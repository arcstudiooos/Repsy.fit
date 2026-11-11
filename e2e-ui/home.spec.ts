// Home tab and Today's Tasks (Prompt 48). Every /api call is mocked, so no database is needed.
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

type Tasks = { date: string; tasks: Record<string, unknown>[] };
const TASKS: Tasks = {
  date: "2026-11-11",
  tasks: [
    { kind: "due", clientId: "c-maya", clientName: "Maya Patel", assignmentId: "a1", assignmentType: "Workout", text: "Workout due today: Squat day" },
    { kind: "idle", clientId: "c-leo", clientName: "Leo Brooks", daysSince: 9, text: "No assignment in 9 days" },
  ],
};

async function mockApi(page: Page, tasks: Tasks | "missing") {
  const requested: string[] = [];
  await page.route("**/api/**", async (route: Route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (req.method() === "GET" && url.pathname === "/api/clients") return route.fulfill({ json: CLIENTS });
    if (req.method() === "GET" && url.pathname === "/api/tasks/today") {
      requested.push(url.searchParams.get("date") ?? "");
      if (tasks === "missing") return route.fulfill({ status: 404, json: { error: "Not found" } });
      return route.fulfill({ json: tasks });
    }
    if (req.method() === "GET" && url.pathname === "/api/checkins/recent") return route.fulfill({ json: { items: [] } });
    if (req.method() === "GET" && url.pathname === "/api/at-risk") return route.fulfill({ json: { date: "2026-11-11", clients: [] } });
    if (req.method() === "GET" && /\/(assignments|chat|progress)$/.test(url.pathname)) return route.fulfill({ json: [] });
    return route.fulfill({ status: 404, json: { error: "Not found" } });
  });
  return requested;
}

const panel = (page: Page) => page.getByRole("tabpanel");

test("Home is the first of 5 tabs", async ({ page }) => {
  await mockApi(page, TASKS);
  await page.goto("/app");
  await expect(page.getByRole("tab")).toHaveText(["Home", "AI Coach", "Clients", "Manual Planner", "Progress"]);
  await page.getByRole("tab", { name: "Home" }).click();
  await expect(page.getByRole("tab", { name: "Home" })).toHaveAttribute("aria-selected", "true");
  await expect(panel(page).getByRole("heading", { level: 2 })).toHaveText("Home");
});

test("each task row shows the client and what is needed, with one button", async ({ page }) => {
  const requested = await mockApi(page, TASKS);
  await page.goto("/app");
  await page.getByRole("tab", { name: "Home" }).click();
  const rows = panel(page).getByRole("list", { name: "Today's tasks" }).getByRole("listitem");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText("Maya Patel");
  await expect(rows.nth(0)).toContainText("Workout due today: Squat day");
  await expect(rows.nth(1)).toContainText("Leo Brooks");
  await expect(rows.nth(1)).toContainText("No assignment in 9 days");
  await expect(rows.nth(0).getByRole("button")).toHaveCount(1);
  expect(requested[0]).toMatch(/^\d{4}-\d{2}-\d{2}$/); // the coach's local date
});

test("a due task opens the Manual Planner with that client; an idle task opens the AI Coach with that client", async ({ page }) => {
  await mockApi(page, TASKS);
  await page.goto("/app");
  await page.getByRole("tab", { name: "Home" }).click();
  await panel(page).getByRole("button", { name: /Open in Manual Planner: Maya Patel/ }).click();
  await expect(page.getByRole("tab", { name: "Manual Planner" })).toHaveAttribute("aria-selected", "true");
  await expect(panel(page)).toContainText("Selected: Maya Patel");

  await page.getByRole("tab", { name: "Home" }).click();
  await panel(page).getByRole("button", { name: /Plan with AI Coach: Leo Brooks/ }).click();
  await expect(page.getByRole("tab", { name: "AI Coach" })).toHaveAttribute("aria-selected", "true");
  await expect(panel(page)).toContainText("Selected: Leo Brooks");
});

test("no tasks shows the plain-words empty state", async ({ page }) => {
  await mockApi(page, { date: "2026-11-11", tasks: [] });
  await page.goto("/app");
  await page.getByRole("tab", { name: "Home" }).click();
  await expect(panel(page)).toContainText("Nothing due today. Pick a client to plan ahead.");
  await expect(panel(page).getByRole("list", { name: "Today's tasks" })).toHaveCount(0);
  await expect(page.getByRole("group", { name: "Select client" })).toBeVisible();
});

test("a missing tasks endpoint shows an error with Retry, not made-up tasks", async ({ page }) => {
  await mockApi(page, "missing");
  await page.goto("/app");
  await page.getByRole("tab", { name: "Home" }).click();
  await expect(panel(page).getByRole("alert")).toBeVisible();
  await expect(panel(page).getByRole("button", { name: "Retry" })).toBeVisible();
  await expect(panel(page).getByRole("listitem")).toHaveCount(0);
});
