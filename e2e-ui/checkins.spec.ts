// Home "New check-ins" card (Prompt 49). Every /api call is mocked, so no database is needed.
import { expect, test, type Page, type Route } from "./fixtures";

const client = (id: string, name: string, createdAt: string) => ({
  id,
  coachId: null,
  name,
  goal: "Fat loss",
  age: 29,
  weightKg: 68,
  heightCm: 165,
  level: "Intermediate",
  focus: "",
  notes: "",
  createdAt,
});
const CLIENTS = [client("c-maya", "Maya Patel", "2026-10-01T00:00:00.000Z"), client("c-leo", "Leo Brooks", "2026-10-02T00:00:00.000Z")];

const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const HOUR = 3600 * 1000;

type Items = Record<string, unknown>[];
const ITEMS = (): Items => [
  { kind: "progress", id: "p2", clientId: "c-leo", clientName: "Leo Brooks", createdAt: ago(5 * HOUR), weightKg: 81.2, adherence: 75, workoutsDone: 2, note: "Sore legs" },
  { kind: "progress", id: "p1", clientId: "c-maya", clientName: "Maya Patel", createdAt: ago(30 * HOUR), weightKg: null, adherence: null, workoutsDone: null, note: "Great week" },
];

async function mockApi(page: Page, items: Items | "missing") {
  await page.route("**/api/**", async (route: Route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (req.method() === "GET" && url.pathname === "/api/clients") return route.fulfill({ json: CLIENTS });
    if (req.method() === "GET" && url.pathname === "/api/tasks/today") return route.fulfill({ json: { date: "2026-11-11", tasks: [] } });
    if (req.method() === "GET" && url.pathname === "/api/checkins/recent") {
      if (items === "missing") return route.fulfill({ status: 404, json: { error: "Not found" } });
      return route.fulfill({ json: { items } });
    }
    // The redesigned Home folds check-ins into Recent activity, which is driven by /api/alerts; answer every Home endpoint.
    if (req.method() === "GET" && url.pathname === "/api/alerts") return route.fulfill({ json: { waiting: 0, joined: [], finished: [], unread: [] } });
    if (req.method() === "GET" && url.pathname === "/api/at-risk") return route.fulfill({ json: { date: "2026-11-11", clients: [] } });
    if (req.method() === "GET" && url.pathname === "/api/review-queue") return route.fulfill({ json: { pendingCount: 0, items: [] } });
    if (req.method() === "GET" && url.pathname === "/api/weekly-summary") return route.fulfill({ json: { weekStart: "2026-11-09", summary: null } });
    if (req.method() === "GET" && /\/(assignments|chat|progress)$/.test(url.pathname)) return route.fulfill({ json: [] });
    return route.fulfill({ status: 404, json: { error: "Not found" } });
  });
}

const panel = (page: Page) => page.getByRole("tabpanel").first();
const list = (page: Page) => panel(page).getByRole("list", { name: "Recent activity" });

test("check-ins appear as rows in Recent activity, newest first", async ({ page }) => {
  await mockApi(page, ITEMS());
  await page.goto("/app");
  await page.getByRole("tab", { name: "Home" }).click();
  // The standalone "New check-ins" card is gone; recent check-ins are rows in Recent activity now.
  await expect(panel(page).getByRole("heading", { level: 2, name: "Recent activity" })).toBeVisible();
  const rows = list(page).getByRole("listitem");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText("Leo Brooks");
  await expect(rows.nth(0)).toContainText("81.2 kg");
  await expect(rows.nth(0)).toContainText("75% adherence");
  await expect(rows.nth(0)).toContainText("2 workouts");
  await expect(rows.nth(0)).toContainText("5 hours ago");
  // The compact row summarises the log; the free-text note ("Sore legs"/"Great week") is not shown here.
  await expect(rows.nth(1)).toContainText("Maya Patel");
  await expect(rows.nth(1)).toContainText("a progress log");
  await expect(rows.nth(1)).toContainText("1 day ago");
});

test("a row's View check-in opens that client's workspace", async ({ page }) => {
  await mockApi(page, ITEMS());
  await page.goto("/app");
  await page.getByRole("tab", { name: "Home" }).click();
  await list(page).getByRole("listitem").filter({ hasText: "Maya Patel" }).getByRole("button", { name: "View check-in" }).click();
  // Maya's latest is a weekly progress log, so her row opens Progress.
  await expect(page.getByRole("tab", { name: "Progress", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("region", { name: "Selected client" })).toContainText("Maya Patel");
});

test("no check-ins shows the Recent activity empty state and no rows", async ({ page }) => {
  await mockApi(page, []);
  await page.goto("/app");
  await page.getByRole("tab", { name: "Home" }).click();
  await expect(panel(page).getByRole("region", { name: "Recent activity" })).toContainText("No recent updates from your clients.");
  await expect(list(page)).toHaveCount(0);
});

test("a failed check-ins endpoint never fabricates rows", async ({ page }) => {
  await mockApi(page, "missing");
  await page.goto("/app");
  await page.getByRole("tab", { name: "Home" }).click();
  // New: check-ins are a secondary source folded into Recent activity; if they fail to load the card shows no
  // check-in rows (here, with no alerts either, the empty state) rather than inventing any.
  await expect(panel(page).getByRole("region", { name: "Recent activity" })).toContainText("No recent updates from your clients.");
  await expect(list(page)).toHaveCount(0);
});
