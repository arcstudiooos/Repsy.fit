// Exercise rows saved as one numbered workout plan (Prompt 23). Every /api call is mocked in the
// browser, so these run without a database. POST .../assignments saves into the mock and the
// list returns newest first, like the server.
import { expect, test, type Page, type Route, openClientTab, openNewPlanForm } from "./fixtures";

const CLIENTS = [
  {
    id: "c-maya",
    coachId: null,
    name: "Maya Patel",
    goal: "Fat loss + strength",
    age: 29,
    weightKg: 68,
    heightCm: 165,
    level: "Intermediate",
    focus: "",
    notes: "",
    createdAt: "2026-10-01T00:00:00.000Z",
  },
];

const PLAN = "1. Back Squat — 4 sets × 6 reps · Rest 120s\n2. Romanian Deadlift — 3 sets × 8 reps · Rest 90s";

type Mock = { assignments: Record<string, unknown>[]; posts: Record<string, unknown>[] };

async function mockApi(page: Page): Promise<Mock> {
  const mock: Mock = { assignments: [], posts: [] };
  let nextId = 1;
  await page.route("**/api/**", async (route: Route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (req.method() === "GET" && path === "/api/clients") return route.fulfill({ json: CLIENTS });
    if (req.method() === "GET" && /^\/api\/clients\/[^/]+\/chat$/.test(path)) return route.fulfill({ json: [] });
    if (/^\/api\/clients\/c-maya\/assignments$/.test(path)) {
      if (req.method() === "GET") return route.fulfill({ json: [...mock.assignments].reverse() });
      if (req.method() === "POST") {
        const body = req.postDataJSON() as Record<string, unknown>;
        mock.posts.push(body);
        const saved = {
          id: `as${nextId++}`,
          coachId: null,
          clientId: "c-maya",
          reasoning: "",
          status: "Active",
          date: "2026-11-10",
          createdAt: new Date().toISOString(),
          ...body,
        };
        mock.assignments.push(saved);
        return route.fulfill({ status: 201, json: saved });
      }
    }
    return route.fulfill({ status: 404, json: { error: "Not found" } });
  });
  return mock;
}

const panel = (page: Page) => page.getByRole("tabpanel").first();
const form = (page: Page) => panel(page).getByRole("form", { name: "New assignment" });
const typeButton = (page: Page, type: string) => form(page).getByRole("group", { name: "Type" }).getByRole("button", { name: type });
const title = (page: Page) => form(page).getByLabel("Title");
const notesBox = (page: Page) => form(page).locator("#assignment-details");
const search = (page: Page) => form(page).getByLabel("Search exercises");
const results = (page: Page) => form(page).getByRole("list", { name: "Exercise results" });
const submit = (page: Page) => form(page).getByRole("button", { name: "Assign plan" });
const cards = (page: Page) => panel(page).getByRole("list", { name: "Assignments" }).getByRole("listitem");

async function openPlanner(page: Page) {
  await page.goto("/app");
  await openClientTab(page, "Plans");
  await openNewPlanForm(page);
}

async function add(page: Page, query: string, name: string) {
  await search(page).fill(query);
  await results(page).getByRole("button").filter({ hasText: name }).first().click();
}

async function buildTwoExerciseWorkout(page: Page) {
  await add(page, "squat", "Back Squat");
  await form(page).getByLabel("Sets for Back Squat").fill("4");
  await form(page).getByLabel("Reps for Back Squat").fill("6");
  await form(page).getByRole("group", { name: "Rest quick picks for Back Squat" }).getByRole("button", { name: "120s" }).click();
  await add(page, "romanian", "Romanian Deadlift");
  await form(page).getByLabel("Reps for Romanian Deadlift").fill("8");
  await form(page).getByRole("group", { name: "Rest quick picks for Romanian Deadlift" }).getByRole("button", { name: "90s" }).click();
}

test("Workout with exercises: Details becomes 'Extra notes (optional)' and only a Title is needed", async ({ page }) => {
  await mockApi(page);
  await openPlanner(page);
  await expect(form(page).getByLabel("Details")).toBeVisible();
  await buildTwoExerciseWorkout(page);
  await expect(form(page).getByLabel("Extra notes (optional)")).toBeVisible();
  await expect(form(page).getByLabel("Details", { exact: true })).toHaveCount(0);
  await expect(notesBox(page)).not.toHaveAttribute("aria-required", "true");
  await expect(submit(page)).toBeDisabled();
  await title(page).fill("Lower body strength");
  await expect(submit(page)).toBeEnabled();

  // Other types still need Title + Details, even with exercise rows kept.
  await typeButton(page, "Nutrition").click();
  await expect(form(page).getByLabel("Details")).toBeVisible();
  await expect(submit(page)).toBeDisabled();
  await typeButton(page, "Workout").click();
  await expect(submit(page)).toBeEnabled();
});

test("saving the 2-exercise workout sends the numbered list in the exact format and the card shows it line by line", async ({ page }) => {
  const mock = await mockApi(page);
  await openPlanner(page);
  await buildTwoExerciseWorkout(page);
  await title(page).fill("Lower body strength");
  await submit(page).click();

  await expect(cards(page)).toHaveCount(1);
  expect(mock.posts[0]).toMatchObject({ type: "Workout", title: "Lower body strength", details: PLAN, source: "manual" });
  // The card shows each exercise as a row: number, name, sets × reps · rest.
  const rows = cards(page).first().locator('[data-plan-line="exercise"]');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText("Back Squat");
  await expect(rows.nth(0)).toContainText("4 × 6 · 120s");
  await expect(rows.nth(1)).toContainText("Romanian Deadlift");
  await expect(rows.nth(1)).toContainText("3 × 8 · 90s");

  // Saving closes the form; a new one starts clean, including the exercise rows.
  await expect(form(page)).toHaveCount(0);
  await openNewPlanForm(page);
  await expect(title(page)).toHaveValue("");
  await expect(form(page).getByRole("list", { name: "Selected exercises" })).toHaveCount(0);
  await expect(form(page).getByLabel("Details")).toBeVisible();
});

test("extra notes are appended after a blank line; the coach's row order is kept", async ({ page }) => {
  const mock = await mockApi(page);
  await openPlanner(page);
  await buildTwoExerciseWorkout(page);
  await form(page).getByRole("button", { name: "Move Romanian Deadlift up" }).click();
  await title(page).fill("Lower body strength");
  await form(page).getByLabel("Extra notes (optional)").fill("  Warm-up: 5 min bike\nTempo 3-1-1  ");
  await submit(page).click();

  await expect(cards(page)).toHaveCount(1);
  expect(mock.posts[0].details).toBe(
    "1. Romanian Deadlift — 3 sets × 8 reps · Rest 90s\n2. Back Squat — 4 sets × 6 reps · Rest 120s\n\nWarm-up: 5 min bike\nTempo 3-1-1",
  );
});

test("Workout with no exercises keeps Details as required free text", async ({ page }) => {
  const mock = await mockApi(page);
  await openPlanner(page);
  await title(page).fill("Push day");
  await expect(submit(page)).toBeDisabled();
  await form(page).getByLabel("Details").fill("Bench 4x8");
  await expect(submit(page)).toBeEnabled();

  // Adding then removing a row returns to the free-text rule.
  await form(page).getByLabel("Details").fill("");
  await add(page, "squat", "Back Squat");
  await expect(submit(page)).toBeEnabled();
  await form(page).getByRole("button", { name: "Remove Back Squat" }).click();
  await expect(submit(page)).toBeDisabled();
  await form(page).getByLabel("Details").fill("Bench 4x8");
  await submit(page).click();

  await expect(cards(page)).toHaveCount(1);
  expect(mock.posts[0]).toMatchObject({ type: "Workout", details: "Bench 4x8" });
});

test("a blank Reps box blocks saving, so no plan line is saved without a rep count", async ({ page }) => {
  const mock = await mockApi(page);
  await openPlanner(page);
  await typeButton(page, "Workout").click();
  await add(page, "squat", "Back Squat");
  await title(page).fill("Leg day");
  await expect(submit(page)).toBeEnabled();
  await form(page).getByLabel("Reps for Back Squat").fill("");
  await expect(submit(page)).toBeDisabled();
  await expect(form(page)).toContainText("Add reps for every exercise to save this plan.");
  await form(page).getByLabel("Reps for Back Squat").fill("AMRAP");
  await expect(submit(page)).toBeEnabled();
  await submit(page).click();
  await expect.poll(() => mock.posts.length).toBe(1);
  expect(mock.posts[0].details).toBe("1. Back Squat — 3 sets × AMRAP reps · Rest 60s");
});
