// AI plan drafts from the type buttons (Prompt 18; drafts since Nov 2026, owner's rule: the coach decides).
// Every /api call is mocked in the browser, so these run without a database or AI key. The AI button
// returns a DRAFT; only "Assign to client" saves (POST /assignments).
import { expect, test, type Page, type Route } from "./fixtures";

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
  drafts: { clientId: string; body: Record<string, unknown> }[];
  saved: Record<string, unknown>[];
  parked: Record<string, unknown>[];
  behaviour: "ok" | "fail" | "hold";
  release?: () => void;
};

async function mockApi(page: Page): Promise<Mock> {
  const mock: Mock = { drafts: [], saved: [], parked: [], behaviour: "ok" };

  await page.route("**/api/**", async (route: Route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;

    if (req.method() === "GET" && path === "/api/clients") return route.fulfill({ json: CLIENTS });
    if (req.method() === "GET" && /^\/api\/clients\/[^/]+\/(chat|assignments)$/.test(path)) return route.fulfill({ json: [] });
    if (req.method() === "POST" && /^\/api\/clients\/[^/]+\/assignments$/.test(path)) {
      const body = req.postDataJSON() as Record<string, unknown>;
      mock.saved.push(body);
      return route.fulfill({ status: 201, json: { id: "as1", clientId: "c-maya", status: "Active", createdAt: new Date().toISOString(), ...body } });
    }
    if (req.method() === "POST" && path === "/api/review-queue") {
      mock.parked.push(req.postDataJSON() as Record<string, unknown>);
      return route.fulfill({ status: 201, json: { id: "r1" } });
    }

    const auto = path.match(/^\/api\/clients\/([^/]+)\/auto-assign$/);
    if (auto && req.method() === "POST") {
      const clientId = decodeURIComponent(auto[1]);
      const body = req.postDataJSON() as Record<string, unknown>;
      mock.drafts.push({ clientId, body });
      if (mock.behaviour === "hold") await new Promise<void>((resolve) => (mock.release = resolve));
      if (mock.behaviour === "fail") {
        return route.fulfill({ status: 502, json: { error: "The AI couldn't create a plan right now. Please try again." } });
      }
      const type = body.type as string;
      return route.fulfill({
        json: {
          draft: {
            type,
            title: `${type} plan for Maya`,
            details: `${type} step 1\n${type} step 2`,
            reasoning: `Maya's goal is fat loss + strength (${type}).`,
            date: body.date,
          },
        },
      });
    }

    return route.fulfill({ status: 404, json: { error: "Not found" } });
  });

  return mock;
}

const panel = (page: Page) => page.getByRole("tabpanel").first();
const row = (page: Page) => panel(page).getByRole("group", { name: "Draft a plan with AI" });
const button = (page: Page, name: string) => row(page).getByRole("button", { name, exact: true });
const draft = (page: Page) => panel(page).getByRole("region", { name: "AI draft" });

const browserToday = (page: Page) =>
  page.evaluate(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });

test("shows the 4 draft buttons in the type colours, and says nothing reaches the client unreviewed", async ({ page }) => {
  await mockApi(page);
  await page.goto("/app");
  await expect(row(page).getByRole("button")).toHaveText(["Workout", "Nutrition", "Habit", "Recovery"]);
  await expect(button(page, "Workout")).toHaveClass(/bg-type-workout/);
  await expect(button(page, "Nutrition")).toHaveClass(/bg-type-nutrition/);
  await expect(button(page, "Habit")).toHaveClass(/bg-type-habit/);
  await expect(button(page, "Recovery")).toHaveClass(/bg-type-recovery/);
  await expect(panel(page)).toContainText("you review it before anything reaches Maya Patel");
});

test("a draft is NOT saved: it shows with Assign, Edit, Review later and Dismiss", async ({ page }) => {
  const mock = await mockApi(page);
  await page.goto("/app");
  const today = await browserToday(page);
  await button(page, "Habit").click();
  await expect(draft(page)).toContainText("Habit plan for Maya");
  await expect(draft(page)).toContainText("Habit step 1");
  await expect(draft(page)).toContainText("fat loss + strength");
  for (const name of ["Assign to client", "Edit", "Review later", "Dismiss"]) {
    await expect(draft(page).getByRole("button", { name })).toBeVisible();
  }
  expect(mock.drafts).toEqual([{ clientId: "c-maya", body: { type: "Habit", date: today } }]);
  expect(mock.saved).toEqual([]);
});

test("Assign to client saves the draft as written, then links to the planner", async ({ page }) => {
  const mock = await mockApi(page);
  await page.goto("/app");
  const today = await browserToday(page);
  await button(page, "Nutrition").click();
  await draft(page).getByRole("button", { name: "Assign to client" }).click();
  await expect(draft(page)).toContainText("✓ Assigned to Maya Patel");
  expect(mock.saved).toEqual([
    {
      type: "Nutrition",
      title: "Nutrition plan for Maya",
      details: "Nutrition step 1\nNutrition step 2",
      reasoning: "Maya's goal is fat loss + strength (Nutrition).",
      source: "ai",
      date: today,
    },
  ]);
  await draft(page).getByRole("button", { name: "View in Plans" }).click();
  await expect(page.getByRole("tab", { name: "Plans", exact: true })).toHaveAttribute("aria-selected", "true");
});

test("Edit lets the coach change title, details and why before assigning; the edited version is saved", async ({ page }) => {
  const mock = await mockApi(page);
  await page.goto("/app");
  await button(page, "Recovery").click();
  await draft(page).getByRole("button", { name: "Edit" }).click();
  await expect(draft(page)).toContainText("nothing is saved until you assign it");
  await draft(page).getByLabel("Title").fill("Easy recovery week");
  await draft(page).getByLabel("Plan details").fill("Walk 20 min daily\nStretch 10 min before bed");
  await draft(page).getByLabel("Why this plan").fill("Maya slept badly this week.");
  await draft(page).getByRole("button", { name: "Done editing" }).click();
  await expect(draft(page).getByRole("heading", { name: "Easy recovery week" })).toBeVisible();
  await expect(draft(page)).toContainText("Edited");
  await expect(draft(page)).toContainText("Stretch 10 min before bed");
  expect(mock.saved).toEqual([]);
  await draft(page).getByRole("button", { name: "Assign to client" }).click();
  await expect(draft(page)).toContainText("✓ Assigned");
  expect(mock.saved[0]).toMatchObject({
    type: "Recovery",
    title: "Easy recovery week",
    details: "Walk 20 min daily\nStretch 10 min before bed",
    reasoning: "Maya slept badly this week.",
    source: "ai",
  });
});

test("an edit can't empty the title or details", async ({ page }) => {
  const mock = await mockApi(page);
  await page.goto("/app");
  await button(page, "Workout").click();
  await draft(page).getByRole("button", { name: "Edit" }).click();
  await draft(page).getByLabel("Plan details").fill("   ");
  await draft(page).getByRole("button", { name: "Assign to client" }).click();
  await expect(draft(page).getByRole("alert")).toHaveText("The plan needs some details.");
  expect(mock.saved).toEqual([]);
});

test("Dismiss drops the draft without saving; Review later parks the (edited) draft", async ({ page }) => {
  const mock = await mockApi(page);
  await page.goto("/app");
  await button(page, "Habit").click();
  await draft(page).getByRole("button", { name: "Dismiss" }).click();
  await expect(draft(page)).toHaveCount(0);
  await button(page, "Habit").click();
  await draft(page).getByRole("button", { name: "Edit" }).click();
  await draft(page).getByLabel("Title").fill("Hydration habit");
  await draft(page).getByRole("button", { name: "Review later" }).click();
  await expect(draft(page)).toContainText("Sent to the review queue");
  expect(mock.parked[0]).toMatchObject({ kind: "suggestion", type: "Habit", title: "Hydration habit" });
  expect(mock.saved).toEqual([]);
});

test("shows Drafting... and disables all buttons, so a double click asks once", async ({ page }) => {
  const mock = await mockApi(page);
  mock.behaviour = "hold";
  await page.goto("/app");
  await button(page, "Habit").click();
  const running = button(page, "Drafting...");
  await expect(running).toBeDisabled();
  for (const name of ["Workout", "Nutrition", "Recovery"]) await expect(button(page, name)).toBeDisabled();
  await running.click({ force: true });
  await expect.poll(() => mock.drafts.length).toBe(1);
  mock.behaviour = "ok";
  mock.release!();
  await expect(draft(page)).toContainText("Habit plan for Maya");
  expect(mock.drafts).toHaveLength(1);
  await expect(button(page, "Habit")).toBeEnabled();
});

test("an AI failure shows the error and no draft", async ({ page }) => {
  const mock = await mockApi(page);
  mock.behaviour = "fail";
  await page.goto("/app");
  await button(page, "Recovery").click();
  await expect(panel(page).getByRole("alert")).toContainText("couldn't create a plan");
  await expect(draft(page)).toHaveCount(0);
  await expect(button(page, "Recovery")).toBeEnabled();
});
