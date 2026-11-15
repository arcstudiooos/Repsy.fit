// The goal date on a client's workspace (Inspo C5, Nov 2026).
//
// The countdown IS the feature: a stored date nobody sees is just another field. These tests pin the
// wording, and that an unset date reads as an invitation rather than missing data.
import { expect, test, type Page, type Route, emptyApi, openClientTab } from "./fixtures";

const client = (over: Record<string, unknown> = {}) => ({
  id: "c-maya",
  coachId: null,
  name: "Maya Patel",
  goal: "Strength",
  age: 29,
  weightKg: 68,
  heightCm: 165,
  level: "Intermediate",
  focus: "",
  notes: "",
  goalDate: null,
  goalEvent: "",
  createdAt: "2026-10-01T00:00:00.000Z",
  ...over,
});

async function open(page: Page, c: Record<string, unknown>) {
  const patched: Record<string, unknown>[] = [];
  await page.route("**/api/**", (route: Route) =>
    route.fulfill({ status: 200, json: emptyApi(new URL(route.request().url()).pathname) }),
  );
  await page.route("**/api/clients", (route: Route) => route.fulfill({ status: 200, json: [c] }));
  await page.route("**/api/clients/c-maya/goal", (route: Route) => {
    patched.push(route.request().postDataJSON() as Record<string, unknown>);
    return route.fulfill({ status: 200, json: { ...c, ...(route.request().postDataJSON() as object) } });
  });
  await page.goto("/app");
  await openClientTab(page, "Plans");
  return { patched };
}

test("an unset date invites one instead of showing nothing", async ({ page }) => {
  await open(page, client());
  await expect(page.getByRole("button", { name: "Add a goal date" })).toBeVisible();
});

test("a date and event read as a sentence with a countdown", async ({ page }) => {
  // Fixed clock so the countdown is deterministic.
  await page.clock.setFixedTime(new Date("2026-11-16T09:00:00"));
  await open(page, client({ goalDate: "2026-12-14", goalEvent: "Wedding" }));
  await expect(page.getByRole("button", { name: /Wedding in about 4 weeks/ })).toBeVisible();
});

test("a date with no words still counts down", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-16T09:00:00"));
  await open(page, client({ goalDate: "2026-11-17" }));
  await expect(page.getByRole("button", { name: /^tomorrow$/ })).toBeVisible();
});

test("a goal with no date still shows the words, because a goal is still a goal", async ({ page }) => {
  await open(page, client({ goalEvent: "Half marathon" }));
  await expect(page.getByRole("button", { name: "Half marathon" })).toBeVisible();
});

test("a date that has passed says so, rather than counting negatives", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-16T09:00:00"));
  await open(page, client({ goalDate: "2026-11-01", goalEvent: "Race" }));
  await expect(page.getByRole("button", { name: /Race 15 days ago/ })).toBeVisible();
});

test("clicking it opens an editor and saves both fields", async ({ page }) => {
  const { patched } = await open(page, client());
  await page.getByRole("button", { name: "Add a goal date" }).click();
  const form = page.getByRole("form", { name: "Goal date for Maya Patel" });
  await form.getByLabel("Date").fill("2026-12-14");
  await form.getByLabel("What is it?").fill("  Wedding  ");
  await form.getByRole("button", { name: "Save" }).click();
  await expect.poll(() => patched.length).toBe(1);
  expect(patched[0]).toEqual({ goalDate: "2026-12-14", goalEvent: "Wedding" });
});

test("clearing the date keeps the words", async ({ page }) => {
  // A coach who mistyped the day has not changed what the client is training for.
  const { patched } = await open(page, client({ goalDate: "2026-12-14", goalEvent: "Wedding" }));
  await page.getByRole("button", { name: /Wedding/ }).click();
  const form = page.getByRole("form", { name: "Goal date for Maya Patel" });
  await form.getByLabel("Date").fill("");
  await form.getByRole("button", { name: "Save" }).click();
  await expect.poll(() => patched.length).toBe(1);
  expect(patched[0]).toEqual({ goalDate: null, goalEvent: "Wedding" });
});

test("cancel restores what was stored and sends nothing", async ({ page }) => {
  const { patched } = await open(page, client({ goalDate: "2026-12-14", goalEvent: "Wedding" }));
  await page.getByRole("button", { name: /Wedding/ }).click();
  const form = page.getByRole("form", { name: "Goal date for Maya Patel" });
  await form.getByLabel("What is it?").fill("Something else");
  await form.getByRole("button", { name: "Cancel" }).click();
  expect(patched).toHaveLength(0);
  // Reopening shows the stored value, not the abandoned edit.
  await page.getByRole("button", { name: /Wedding/ }).click();
  await expect(page.getByRole("form", { name: "Goal date for Maya Patel" }).getByLabel("What is it?")).toHaveValue("Wedding");
});
