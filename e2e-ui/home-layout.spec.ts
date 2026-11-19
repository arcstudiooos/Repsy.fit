// The Home dashboard's layout contract (Nov 2026 coach-command-centre redesign).
//
// Home opens with three KPI buttons, then a 2x2 card grid (Action centre + Client health, then
// Today's tasks + Recent activity), then a full-width Weekly coaching report. These tests pin those
// rules so a later change cannot quietly bring back the old wall of stacked, usually-empty rows.
import { expect, test, type Page, type Route, emptyApi } from "./fixtures";

const client = (id: string, name: string) => ({
  id,
  coachId: null,
  name,
  goal: "Fat loss",
  age: 29,
  weightKg: 58,
  heightCm: 165,
  level: "Beginner",
  focus: "",
  notes: "",
  goalDate: null,
  goalEvent: "",
  createdAt: "2026-10-01T00:00:00.000Z",
});

const idle = (clientId: string, clientName: string, daysSince: number) => ({
  kind: "idle" as const,
  clientId,
  clientName,
  daysSince,
  text: `No plan for ${daysSince} days`,
});

async function openHome(page: Page, data: Record<string, unknown> = {}) {
  await page.route("**/api/**", (route: Route) => {
    const path = new URL(route.request().url()).pathname;
    for (const [fragment, json] of Object.entries(data)) {
      if (path.includes(fragment)) return route.fulfill({ status: 200, json: json as object });
    }
    return route.fulfill({ status: 200, json: emptyApi(path) });
  });
  await page.goto("/app");
  await page.getByRole("tab", { name: "Home" }).click();
}

const panel = (page: Page) => page.getByRole("tabpanel").first();

test("the three KPIs are buttons that navigate", async ({ page }) => {
  await openHome(page, {
    "/clients": [client("c1", "Maya Patel"), client("c2", "Garima Sharma"), client("c3", "Leo Brooks")],
    "/at-risk": { date: "2026-11-16", clients: [{ clientId: "c1", clientName: "Maya Patel", reasons: [{ rule: "no-checkin", text: "No check-in for 8 days" }] }] },
    "/review-queue": { pendingCount: 2, items: [] },
  });
  // The whole KPI card is one button with a chevron, so it is obvious it goes somewhere - the old
  // rail was five flat numbers nobody knew were clickable.
  const kpis = panel(page).getByRole("button", { name: /\. Open (the client directory|clients that need attention|the action centre)\.$/ });
  await expect(kpis).toHaveCount(3);
  await expect(panel(page).getByRole("button", { name: "Total clients: 3. Open the client directory." })).toBeVisible();
  await expect(panel(page).getByRole("button", { name: "At risk: 1. Open clients that need attention." })).toBeVisible();
  await expect(panel(page).getByRole("button", { name: "Pending reviews: 2. Open the action centre." })).toBeVisible();

  // The first two KPIs jump to the Clients tab.
  await panel(page).getByRole("button", { name: /^Total clients:/ }).click();
  await expect(page.getByRole("tab", { name: "Clients" })).toHaveAttribute("aria-selected", "true");

  // The third stays on Home and reveals the Action centre.
  await page.getByRole("tab", { name: "Home" }).click();
  await panel(page).getByRole("button", { name: /^Pending reviews:/ }).click();
  await expect(page.getByRole("tab", { name: "Home" })).toHaveAttribute("aria-selected", "true");
  await expect(panel(page).getByRole("region", { name: "Action centre" })).toBeVisible();
});

test("the dashboard is a 2x2 grid with a full-width report, not a stack of full-width rows", async ({ page }) => {
  await openHome(page, { "/clients": [client("c1", "Maya Patel")] });
  await page.setViewportSize({ width: 1280, height: 1100 });
  const action = panel(page).getByRole("region", { name: "Action centre" });
  const health = panel(page).getByRole("region", { name: "Client health" });
  const tasks = panel(page).getByRole("region", { name: "Today's tasks" });
  const activity = panel(page).getByRole("region", { name: "Recent activity" });
  const weekly = panel(page).getByRole("region", { name: "Weekly coaching report" });
  const [a, h, t, ac, w] = await Promise.all([
    action.boundingBox(),
    health.boundingBox(),
    tasks.boundingBox(),
    activity.boundingBox(),
    weekly.boundingBox(),
  ]);
  // Row 1: Action centre and Client health share a row (side by side, tops aligned).
  expect(h!.x).toBeGreaterThan(a!.x + a!.width - 10);
  expect(Math.abs(h!.y - a!.y)).toBeLessThan(40);
  // Row 2: Today's tasks and Recent activity share the next row, below row 1.
  expect(ac!.x).toBeGreaterThan(t!.x + t!.width - 10);
  expect(t!.y).toBeGreaterThan(a!.y + 10);
  // Neither grid card spans the whole dashboard, so an empty block cannot cost a full row of its own.
  expect(a!.width).toBeLessThan(1100);
  // The weekly report is full-width and sits below the grid.
  expect(w!.width).toBeGreaterThan(a!.width + 50);
  expect(w!.y).toBeGreaterThan(t!.y + 10);
});

test("the Today's tasks row actions are quiet ghost buttons, not loud repeated ones", async ({ page }) => {
  await openHome(page, {
    "/clients": [client("c1", "Maya Patel"), client("c2", "Garima Sharma")],
    "/tasks/today": {
      date: "2026-11-16",
      tasks: [idle("c1", "Maya Patel", 9), idle("c2", "Garima Sharma", 12), idle("c3", "Leo Brooks", 15)],
    },
  });
  const tasks = panel(page).getByRole("region", { name: "Today's tasks" });
  // Every idle row offers the same two actions ("New plan" and "AI Coach"), so BOTH stay quiet:
  // three identical solid buttons would mean none of them is important - these are ghost.
  const rowButtons = tasks.getByRole("button", { name: /New plan|Plan with AI Coach/ });
  await expect(rowButtons).toHaveCount(6);
  for (const cls of await rowButtons.evaluateAll((els) => els.map((e) => e.className))) {
    expect(cls).toContain("btn-ghost");
    expect(cls).not.toContain("btn-primary");
  }
});

test("on a phone it is a single column and every card is still reachable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openHome(page, { "/clients": [client("c1", "Maya Patel")] });
  const action = await panel(page).getByRole("region", { name: "Action centre" }).boundingBox();
  const health = await panel(page).getByRole("region", { name: "Client health" }).boundingBox();
  // Stacked, not side by side.
  expect(health!.y).toBeGreaterThan(action!.y + action!.height - 10);
  // No horizontal overflow.
  expect(action!.width).toBeLessThanOrEqual(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
});
