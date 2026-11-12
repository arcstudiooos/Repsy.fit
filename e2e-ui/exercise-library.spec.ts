// Exercise library search in the Manual Planner form (Prompt 21). Every /api call is mocked in
// the browser, so these run without a database.
import { expect, test, type Page, type Route, openClientTab } from "./fixtures";

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

async function mockApi(page: Page) {
  const posts: Record<string, unknown>[] = [];
  await page.route("**/api/**", async (route: Route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (req.method() === "GET" && path === "/api/clients") return route.fulfill({ json: CLIENTS });
    if (req.method() === "GET" && /^\/api\/clients\/[^/]+\/chat$/.test(path)) return route.fulfill({ json: [] });
    if (/^\/api\/clients\/[^/]+\/assignments$/.test(path)) {
      if (req.method() === "GET") return route.fulfill({ json: [] });
      if (req.method() === "POST") {
        const body = req.postDataJSON() as Record<string, unknown>;
        posts.push(body);
        return route.fulfill({
          status: 201,
          json: {
            id: "as1",
            coachId: null,
            clientId: "c-maya",
            reasoning: "",
            source: "manual",
            status: "Active",
            date: "2026-11-10",
            createdAt: new Date().toISOString(),
            ...body,
          },
        });
      }
    }
    return route.fulfill({ status: 404, json: { error: "Not found" } });
  });
  return { posts };
}

const form = (page: Page) => page.getByRole("tabpanel").first().getByRole("form", { name: "New assignment" });
const typeButton = (page: Page, type: string) => form(page).getByRole("group", { name: "Type" }).getByRole("button", { name: type });
const search = (page: Page) => form(page).getByLabel("Search exercises");
const results = (page: Page) => form(page).getByRole("list", { name: "Exercise results" });
const resultRows = (page: Page) => results(page).getByRole("button");
const selected = (page: Page) => form(page).getByRole("list", { name: "Selected exercises" }).getByRole("listitem");

async function openPlanner(page: Page) {
  await page.goto("/app");
  await openClientTab(page, "Plans");
}

test("the search box shows only for Workout, above Details", async ({ page }) => {
  await mockApi(page);
  await openPlanner(page);
  await expect(search(page)).toBeVisible();
  const searchBox = await search(page).boundingBox();
  const detailsBox = await form(page).getByLabel("Details").boundingBox();
  expect(searchBox!.y).toBeLessThan(detailsBox!.y);

  for (const type of ["Nutrition", "Habit", "Recovery"]) {
    await typeButton(page, type).click();
    await expect(search(page)).toHaveCount(0);
  }
  await typeButton(page, "Workout").click();
  await expect(search(page)).toBeVisible();
});

test('searching "squat" shows the squats with their group', async ({ page }) => {
  await mockApi(page);
  await openPlanner(page);
  await expect(results(page)).toHaveCount(0);
  await search(page).fill("squat");
  const names = resultRows(page).filter({ hasNotText: "Add custom exercise" });
  await expect(names).toHaveCount(4);
  await expect(names.nth(0)).toContainText("Back Squat");
  await expect(names.nth(0)).toContainText("Legs");
  for (const name of ["Front Squat", "Goblet Squat", "Bulgarian Split Squat"]) {
    await expect(names.filter({ hasText: name })).toHaveCount(1);
  }
  // Case-insensitive.
  await search(page).fill("SQUAT");
  await expect(names).toHaveCount(4);
});

test('searching "back" shows the Back group rows (group match), at most 8 results', async ({ page }) => {
  await mockApi(page);
  await openPlanner(page);
  await search(page).fill("back");
  const names = resultRows(page).filter({ hasNotText: "Add custom exercise" });
  for (const name of ["Deadlift", "Barbell Row", "One-Arm Dumbbell Row", "Seated Cable Row", "Lat Pulldown", "Pull-Up", "Chin-Up"]) {
    await expect(names.filter({ hasText: name }).first()).toContainText("Back");
  }
  await expect(names.filter({ hasText: "Back Squat" })).toHaveCount(1);

  // A broad search is capped at 8 library results; the custom option stays last.
  await search(page).fill("e");
  await expect(names).toHaveCount(8);
  await expect(resultRows(page).last()).toContainText('Add custom exercise "e"');
});

test("clicking a result adds it to the selected list; X removes it", async ({ page }) => {
  await mockApi(page);
  await openPlanner(page);
  await search(page).fill("squat");
  await resultRows(page).filter({ hasText: "Goblet Squat" }).click();
  await expect(selected(page)).toHaveCount(1);
  await expect(selected(page).first()).toContainText("Goblet Squat");
  await expect(search(page)).toHaveValue("");
  await expect(results(page)).toHaveCount(0);

  await search(page).fill("plank");
  await resultRows(page).filter({ hasText: "Plank" }).first().click();
  await expect(selected(page)).toHaveCount(2);

  await selected(page).filter({ hasText: "Goblet Squat" }).getByRole("button", { name: "Remove Goblet Squat" }).click();
  await expect(selected(page)).toHaveCount(1);
  await expect(selected(page).first()).toContainText("Plank");
});

test("a made-up name can be added as Custom", async ({ page }) => {
  await mockApi(page);
  await openPlanner(page);
  await search(page).fill("Zercher Carry");
  await expect(resultRows(page)).toHaveCount(1);
  const custom = resultRows(page).last();
  await expect(custom).toContainText('Add custom exercise "Zercher Carry"');
  await expect(custom).toContainText("Custom");
  await custom.click();
  await expect(selected(page)).toHaveCount(1);
  await expect(selected(page).first()).toContainText("Zercher Carry");
});

// Prompt 23 changed this: the selected rows now become the details (no new request fields).
test("the selected list adds no new fields to what is saved", async ({ page }) => {
  const mock = await mockApi(page);
  await openPlanner(page);
  await search(page).fill("squat");
  await resultRows(page).filter({ hasText: "Back Squat" }).click();
  await form(page).getByLabel("Title").fill("Leg day");
  await form(page).getByLabel("Extra notes (optional)").fill("Back Squat 5x5");
  await form(page).getByRole("button", { name: "Assign plan" }).click();
  await expect.poll(() => mock.posts.length).toBe(1);
  expect(Object.keys(mock.posts[0]).sort()).toEqual(["date", "details", "reasoning", "source", "title", "type"]);
  expect(mock.posts[0].details).toBe("1. Back Squat — 3 sets × 10 reps · Rest 60s\n\nBack Squat 5x5");
});
