// Habit presets and recurrence (Inspo C3, Nov 2026) in a client's Progress tab.
//
// The behaviour worth protecting: a preset FILLS THE BOX rather than saving, a habit not expected
// today is not drawn as a miss, and "every day" is never sent as a recurrence (it is the default,
// and what every habit written before recurrence existed already means).
import { expect, test, type Page, type Route, emptyApi, openClientTab } from "./fixtures";

const CLIENTS = [
  { id: "c-maya", coachId: null, name: "Maya Patel", goal: "Strength", age: 29, weightKg: 68, heightCm: 165, level: "Intermediate", focus: "", notes: "", createdAt: "2026-10-01T00:00:00.000Z" },
];

// Mon 16 Nov 2026 back to Tue 10 Nov, as the endpoint returns them (oldest first).
const WEEK = ["2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15", "2026-11-16"];

const habit = (over: Record<string, unknown> = {}) => ({
  id: "h1",
  coachId: "coach-test",
  clientId: "c-maya",
  name: "Drink 3 litres of water",
  active: true,
  days: [0, 1, 2, 3, 4, 5, 6],
  recurrence: "Every day",
  scheduledToday: true,
  weekScheduled: WEEK.map(() => true),
  week: [true, true, false, true, false, false, false],
  currentStreak: 1,
  bestStreak: 2,
  createdAt: "2026-11-01T00:00:00.000Z",
  ...over,
});

async function openHabits(page: Page, habits: unknown[]) {
  const posted: { url: string; body: unknown }[] = [];
  await page.route("**/api/**", (route: Route) =>
    route.fulfill({ status: 200, json: emptyApi(new URL(route.request().url()).pathname) }),
  );
  await page.route("**/api/clients", (route: Route) => route.fulfill({ status: 200, json: CLIENTS }));
  await page.route("**/api/clients/c-maya/habits**", (route: Route) => {
    const req = route.request();
    if (req.method() === "POST") {
      posted.push({ url: new URL(req.url()).pathname, body: req.postDataJSON() });
      return route.fulfill({ status: 201, json: habit({ id: "new" }) });
    }
    return route.fulfill({ status: 200, json: { date: "2026-11-16", days: WEEK, habits } });
  });

  await page.goto("/app");
  await openClientTab(page, "Check-ins");
  await expect(page.getByRole("region", { name: "Habit tracker" })).toBeVisible();
  return { posted };
}

test("the examples are grouped, and picking one fills the box instead of saving", async ({ page }) => {
  const { posted } = await openHabits(page, []);
  await page.getByRole("button", { name: "Pick from examples" }).click();
  // Grouped so a long list stays scannable.
  for (const category of ["Nutrition", "Movement", "Sleep and recovery", "Mind", "Lifestyle"]) {
    await expect(page.getByText(category, { exact: true })).toBeVisible();
  }
  await page.getByRole("button", { name: "Train as planned" }).click();
  // Filled in, NOT saved: the coach still chooses.
  await expect(page.getByLabel("New habit")).toHaveValue("Train as planned");
  expect(posted).toHaveLength(0);
  // And it brought its usual days with it.
  const which = page.getByRole("group", { name: "Which days" });
  for (const d of ["Mon", "Wed", "Fri"]) await expect(which.getByRole("button", { name: d })).toHaveAttribute("aria-pressed", "true");
  for (const d of ["Tue", "Sun"]) await expect(which.getByRole("button", { name: d })).toHaveAttribute("aria-pressed", "false");
});

test("every day is the default, and is never sent as a recurrence", async ({ page }) => {
  const { posted } = await openHabits(page, []);
  const which = page.getByRole("group", { name: "Which days" });
  await expect(which.getByRole("button", { name: "Every day" })).toHaveAttribute("aria-pressed", "true");
  await page.getByLabel("New habit").fill("Ten minutes of stretching");
  await page.getByRole("button", { name: "Add habit" }).click();
  // Omitting `days` is what every pre-recurrence habit means, so the default stays identical.
  expect(posted[0].body).toEqual({ name: "Ten minutes of stretching" });
});

test("choosing days sends exactly those", async ({ page }) => {
  const { posted } = await openHabits(page, []);
  const which = page.getByRole("group", { name: "Which days" });
  // The first tap out of "every day" means "only this day", not "all but this one".
  await which.getByRole("button", { name: "Mon" }).click();
  await which.getByRole("button", { name: "Thu" }).click();
  await page.getByLabel("New habit").fill("Weigh in");
  await page.getByRole("button", { name: "Add habit" }).click();
  expect(posted[0].body).toEqual({ name: "Weigh in", days: [1, 4] });
});

test("turning the last day off falls back to every day, never nothing", async ({ page }) => {
  const { posted } = await openHabits(page, []);
  const which = page.getByRole("group", { name: "Which days" });
  await which.getByRole("button", { name: "Mon" }).click();
  await which.getByRole("button", { name: "Mon" }).click();
  await expect(which.getByRole("button", { name: "Every day" })).toHaveAttribute("aria-pressed", "true");
  await page.getByLabel("New habit").fill("Log every meal");
  await page.getByRole("button", { name: "Add habit" }).click();
  // A habit nobody is ever expected to do would be meaningless.
  expect(posted[0].body).toEqual({ name: "Log every meal" });
});

test("a habit that is not every-day says so", async ({ page }) => {
  await openHabits(page, [habit({ recurrence: "Mon, Wed, Fri", days: [1, 3, 5] })]);
  await expect(page.getByText("Mon, Wed, Fri")).toBeVisible();
});

test("an every-day habit is not labelled, because that is the normal case", async ({ page }) => {
  await openHabits(page, [habit()]);
  await expect(page.getByText("Every day")).toHaveCount(1); // only the picker's own button
});

test("a day the habit was never expected on does not read as a miss", async ({ page }) => {
  // Expected Mon/Wed/Fri only. 14 Nov is a Saturday: not expected, not done.
  await openHabits(page, [
    habit({
      name: "Train as planned",
      days: [1, 3, 5],
      recurrence: "Mon, Wed, Fri",
      weekScheduled: [false, false, true, false, true, false, true],
      week: [false, false, true, false, true, false, false],
    }),
  ]);
  // The label says it outright, for anyone not reading the colour.
  await expect(page.getByRole("button", { name: /Train as planned on 2026-11-10 \(not expected\)/ })).toBeVisible();
  // A scheduled day carries no such note.
  await expect(page.getByRole("button", { name: "Train as planned on 2026-11-12" })).toBeVisible();
});

test("a day it was not expected on can still be ticked, so an extra effort counts", async ({ page }) => {
  const posted: unknown[] = [];
  await openHabits(page, [habit({ days: [1], recurrence: "Mon", weekScheduled: [false, false, false, false, false, false, true] })]);
  await page.route("**/api/clients/c-maya/habits/h1/logs/**", (route: Route) => {
    posted.push(route.request().postDataJSON());
    return route.fulfill({ status: 200, json: { ok: true } });
  });
  await page.getByRole("button", { name: /on 2026-11-10 \(not expected\)/ }).click();
  await expect.poll(() => posted.length).toBe(1);
});
