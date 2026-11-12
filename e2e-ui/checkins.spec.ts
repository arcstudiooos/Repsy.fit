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
    if (req.method() === "GET" && /\/(assignments|chat|progress)$/.test(url.pathname)) return route.fulfill({ json: [] });
    return route.fulfill({ status: 404, json: { error: "Not found" } });
  });
}

const panel = (page: Page) => page.getByRole("tabpanel").first();
const list = (page: Page) => panel(page).getByRole("list", { name: "New check-ins" });

test("rows show client, what was logged and time ago, newest first", async ({ page }) => {
  await mockApi(page, ITEMS());
  await page.goto("/app");
  await page.getByRole("tab", { name: "Home" }).click();
  await expect(panel(page).getByRole("heading", { level: 3, name: "New check-ins" })).toBeVisible();
  const rows = list(page).getByRole("listitem");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText("Leo Brooks");
  await expect(rows.nth(0)).toContainText("81.2 kg");
  await expect(rows.nth(0)).toContainText("75% adherence");
  await expect(rows.nth(0)).toContainText("2 workouts");
  await expect(rows.nth(0)).toContainText("Sore legs");
  await expect(rows.nth(0)).toContainText("5 hours ago");
  await expect(rows.nth(1)).toContainText("Maya Patel");
  await expect(rows.nth(1)).toContainText("Great week");
  await expect(rows.nth(1)).toContainText("1 day ago");
});

test("clicking a row selects that client and opens the Progress tab", async ({ page }) => {
  await mockApi(page, ITEMS());
  await page.goto("/app");
  await page.getByRole("tab", { name: "Home" }).click();
  await list(page).getByRole("button", { name: /Maya Patel/ }).click();
  await expect(page.getByRole("tab", { name: "Progress", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("region", { name: "Selected client" })).toContainText("Maya Patel");
});

test("no check-ins shows the plain-words empty state and no rows", async ({ page }) => {
  await mockApi(page, []);
  await page.goto("/app");
  await page.getByRole("tab", { name: "Home" }).click();
  await expect(panel(page)).toContainText("No new check-ins in the last 2 days");
  await expect(list(page)).toHaveCount(0);
});

test("a missing endpoint shows an error with Retry, not made-up rows", async ({ page }) => {
  await mockApi(page, "missing");
  await page.goto("/app");
  await page.getByRole("tab", { name: "Home" }).click();
  await expect(panel(page).getByRole("region", { name: "New check-ins" }).getByRole("alert")).toBeVisible();
  await expect(list(page)).toHaveCount(0);
});
