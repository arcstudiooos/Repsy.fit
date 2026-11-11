// Auto-assign buttons (Prompt 18). Every /api call is mocked in the browser, so these run
// without a database or AI key. The mock saves one assignment per auto-assign call.
import { expect, test, type Page, type Route } from "@playwright/test";

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
    focus: "Lower body strength",
    notes: "Vegetarian",
    createdAt: "2026-10-01T00:00:00.000Z",
  },
];

type Mock = {
  posts: { clientId: string; body: Record<string, unknown> }[];
  behaviour: "ok" | "fail" | "hold";
  release?: () => void;
};

async function mockApi(page: Page): Promise<Mock> {
  const mock: Mock = { posts: [], behaviour: "ok" };
  let nextId = 1;

  await page.route("**/api/**", async (route: Route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;

    if (req.method() === "GET" && path === "/api/clients") return route.fulfill({ json: CLIENTS });
    if (req.method() === "GET" && /^\/api\/clients\/[^/]+\/(chat|assignments)$/.test(path)) {
      return route.fulfill({ json: [] });
    }

    const auto = path.match(/^\/api\/clients\/([^/]+)\/auto-assign$/);
    if (auto && req.method() === "POST") {
      const clientId = decodeURIComponent(auto[1]);
      const body = req.postDataJSON() as Record<string, unknown>;
      mock.posts.push({ clientId, body });
      if (mock.behaviour === "hold") await new Promise<void>((resolve) => (mock.release = resolve));
      if (mock.behaviour === "fail") {
        return route.fulfill({
          status: 502,
          json: { error: "The AI couldn't create a plan right now. Nothing was saved - please try again." },
        });
      }
      const type = body.type as string;
      const saved = {
        id: `as${nextId++}`,
        coachId: null,
        clientId,
        type,
        title: `${type} plan for Maya`,
        details: `${type} step 1\n${type} step 2`,
        reasoning: `Maya's goal is fat loss + strength (${type}).`,
        source: "ai",
        status: "Active",
        date: body.date,
        createdAt: new Date().toISOString(),
      };
      return route.fulfill({ status: 201, json: [saved] });
    }

    return route.fulfill({ status: 404, json: { error: "Not found" } });
  });

  return mock;
}

const panel = (page: Page) => page.getByRole("tabpanel");
const row = (page: Page) => panel(page).getByRole("group", { name: "Auto-assign" });
const button = (page: Page, name: string) => row(page).getByRole("button", { name, exact: true });
const result = (page: Page) => panel(page).getByRole("region", { name: "Auto-assigned plan" });

const browserToday = (page: Page) =>
  page.evaluate(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });

test("shows 4 auto-assign buttons in the type colours", async ({ page }) => {
  await mockApi(page);
  await page.goto("/app");
  const labels = ["Auto-assign Workout", "Nutrition", "Habit", "Recovery"];
  await expect(row(page).getByRole("button")).toHaveText(labels);
  await expect(button(page, "Auto-assign Workout")).toHaveClass(/bg-type-workout/);
  await expect(button(page, "Nutrition")).toHaveClass(/bg-type-nutrition/);
  await expect(button(page, "Habit")).toHaveClass(/bg-type-habit/);
  await expect(button(page, "Recovery")).toHaveClass(/bg-type-recovery/);
});

test("one of each type saves 4 distinct plans and shows each saved plan with a planner link", async ({ page }) => {
  const mock = await mockApi(page);
  await page.goto("/app");
  const today = await browserToday(page);

  for (const [label, type] of [
    ["Auto-assign Workout", "Workout"],
    ["Nutrition", "Nutrition"],
    ["Habit", "Habit"],
    ["Recovery", "Recovery"],
  ]) {
    await button(page, label).click();
    await expect(result(page)).toContainText(`${type} plan for Maya`);
    await expect(result(page)).toContainText(`${type} step 1`);
    await expect(result(page)).toContainText("fat loss + strength");
  }
  expect(mock.posts).toEqual(
    ["Workout", "Nutrition", "Habit", "Recovery"].map((type) => ({ clientId: "c-maya", body: { type, date: today } })),
  );

  await result(page).getByRole("button", { name: "View in Manual Planner" }).click();
  await expect(page.getByRole("tab", { name: "Manual Planner" })).toHaveAttribute("aria-selected", "true");
});

test("shows Generating... and disables all buttons, so a double click saves once", async ({ page }) => {
  const mock = await mockApi(page);
  mock.behaviour = "hold";
  await page.goto("/app");
  await button(page, "Habit").click();
  const running = button(page, "Generating...");
  await expect(running).toBeDisabled();
  for (const name of ["Auto-assign Workout", "Nutrition", "Recovery"]) await expect(button(page, name)).toBeDisabled();
  await running.click({ force: true });
  await expect.poll(() => mock.posts.length).toBe(1);
  mock.behaviour = "ok";
  mock.release!();
  await expect(result(page)).toContainText("Habit plan for Maya");
  expect(mock.posts).toHaveLength(1);
  await expect(button(page, "Habit")).toBeEnabled();
});

test("an AI failure shows the error and no success card", async ({ page }) => {
  const mock = await mockApi(page);
  mock.behaviour = "fail";
  await page.goto("/app");
  await button(page, "Recovery").click();
  await expect(panel(page).getByRole("alert")).toContainText("Nothing was saved");
  await expect(result(page)).toHaveCount(0);
  await expect(button(page, "Recovery")).toBeEnabled();
});
