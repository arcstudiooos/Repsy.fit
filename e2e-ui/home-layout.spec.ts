// The Home dashboard's layout contract (Nov 2026 redesign).
//
// Home used to be six stacked full-width cards. Three of the six were usually EMPTY, so the screen
// spent most of its height saying nothing was wrong. These tests pin the rules that fixed it, so a
// later change cannot quietly bring the wall of rows back.
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

const rail = (page: Page) => page.getByRole("group", { name: "Today at a glance" });

test("the counts live on one rail instead of a card each", async ({ page }) => {
  await openHome(page, {
    "/clients": [client("c1", "Maya Patel"), client("c2", "Garima Sharma"), client("c3", "Leo Brooks")],
    "/tasks/today": { date: "2026-11-16", tasks: [idle("c1", "Maya Patel", 9), idle("c2", "Garima Sharma", 12)] },
    "/at-risk": { date: "2026-11-16", clients: [{ clientId: "c1", clientName: "Maya Patel", reasons: [{ rule: "no-checkin", text: "No check-in for 8 days" }] }] },
    "/review-queue": { pendingCount: 2, items: [] },
  });
  // Five facts on one line: what used to need three near-empty cards to say.
  await expect(rail(page)).toContainText("Clients");
  await expect(rail(page)).toContainText("Needs attention");
  await expect(rail(page)).toContainText("Waiting on you");
  await expect(rail(page)).toContainText("Idle 7+ days");
  await expect(rail(page)).toContainText("Check-ins today");
});

test("the dashboard is a grid, not a stack of full-width rows", async ({ page }) => {
  await openHome(page, {
    "/clients": [client("c1", "Maya Patel")],
    "/tasks/today": { date: "2026-11-16", tasks: [idle("c1", "Maya Patel", 9)] },
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  const tasks = page.getByRole("region", { name: "Today's Tasks" });
  const attention = page.getByRole("region", { name: "Needs attention" });
  const tasksBox = await tasks.boundingBox();
  const attentionBox = await attention.boundingBox();
  expect(tasksBox).not.toBeNull();
  expect(attentionBox).not.toBeNull();
  // Side by side: they share a row, so an empty block cannot cost a full row of its own.
  expect(attentionBox!.x).toBeGreaterThan(tasksBox!.x + tasksBox!.width - 10);
  // And neither one spans the whole dashboard.
  expect(tasksBox!.width).toBeLessThan(1100);
});

test("a repeated row action is quiet; the loud button is not repeated", async ({ page }) => {
  await openHome(page, {
    "/clients": [client("c1", "Maya Patel"), client("c2", "Garima Sharma")],
    "/tasks/today": {
      date: "2026-11-16",
      tasks: [idle("c1", "Maya Patel", 9), idle("c2", "Garima Sharma", 12), idle("c3", "Leo Brooks", 15)],
    },
  });
  const tasks = page.getByRole("region", { name: "Today's Tasks" });
  // Every row offers the same two actions, so BOTH have to be quiet: "New plan" finishes the job
  // in a dialog, "AI Coach" is the route into the conversation.
  const rowButtons = tasks.getByRole("button", { name: /New plan|AI Coach/ });
  await expect(rowButtons).toHaveCount(6);
  // Three identical solid buttons would mean none of them is important: these are ghost.
  for (const cls of await rowButtons.evaluateAll((els) => els.map((e) => e.className))) {
    expect(cls).toContain("btn-ghost");
    expect(cls).not.toContain("btn-primary");
  }
});

test("on a phone it is a single column and every card is still reachable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openHome(page, {
    "/clients": [client("c1", "Maya Patel")],
    "/tasks/today": { date: "2026-11-16", tasks: [idle("c1", "Maya Patel", 9)] },
  });
  const tasks = await page.getByRole("region", { name: "Today's Tasks" }).boundingBox();
  const checkIns = await page.getByRole("region", { name: "New check-ins" }).boundingBox();
  // Stacked, not side by side.
  expect(checkIns!.y).toBeGreaterThan(tasks!.y + tasks!.height - 10);
  // No horizontal overflow.
  expect(tasks!.width).toBeLessThanOrEqual(390);
});
