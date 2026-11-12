// Home "Needs attention" card (Prompt 50). Every /api call is mocked, so no database is needed.
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

type Clients = Record<string, unknown>[];
const AT_RISK: Clients = [
  {
    clientId: "c-leo",
    clientName: "Leo Brooks",
    reasons: [
      { rule: "adherence", text: "Adherence 45% over the last 2 weeks" },
      { rule: "inactive", text: "No check-in for 12 days" },
    ],
  },
  {
    clientId: "c-maya",
    clientName: "Maya Patel",
    reasons: [{ rule: "weight", text: "Weight went up 3 logs in a row (68 → 69.5 kg) while the goal is fat loss" }],
  },
];

async function mockApi(page: Page, clients: Clients | "missing") {
  const requested: string[] = [];
  await page.route("**/api/**", async (route: Route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (req.method() === "GET" && url.pathname === "/api/clients") return route.fulfill({ json: CLIENTS });
    if (req.method() === "GET" && url.pathname === "/api/tasks/today") return route.fulfill({ json: { date: "2026-11-11", tasks: [] } });
    if (req.method() === "GET" && url.pathname === "/api/checkins/recent") return route.fulfill({ json: { items: [] } });
    if (req.method() === "GET" && url.pathname === "/api/at-risk") {
      requested.push(url.searchParams.get("date") ?? "");
      if (clients === "missing") return route.fulfill({ status: 404, json: { error: "Not found" } });
      return route.fulfill({ json: { date: "2026-11-11", clients } });
    }
    if (req.method() === "GET" && /\/(assignments|chat|progress)$/.test(url.pathname)) return route.fulfill({ json: [] });
    return route.fulfill({ status: 404, json: { error: "Not found" } });
  });
  return requested;
}

const panel = (page: Page) => page.getByRole("tabpanel").first();
const list = (page: Page) => panel(page).getByRole("list", { name: "Needs attention" });

test("rows show the client and every exact reason, in the server's order", async ({ page }) => {
  const requested = await mockApi(page, AT_RISK);
  await page.goto("/app");
  await page.getByRole("tab", { name: "Home" }).click();
  await expect(panel(page).getByRole("heading", { level: 3, name: "Needs attention" })).toBeVisible();
  const rows = list(page).getByRole("listitem");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText("Leo Brooks");
  await expect(rows.nth(0)).toContainText("Adherence 45% over the last 2 weeks");
  await expect(rows.nth(0)).toContainText("No check-in for 12 days");
  await expect(rows.nth(1)).toContainText("Maya Patel");
  await expect(rows.nth(1)).toContainText("Weight went up 3 logs in a row (68 → 69.5 kg) while the goal is fat loss");
  expect(requested[0]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
});

test("clicking a row selects that client and opens the Progress tab", async ({ page }) => {
  await mockApi(page, AT_RISK);
  await page.goto("/app");
  await page.getByRole("tab", { name: "Home" }).click();
  await list(page).getByRole("button", { name: /Maya Patel/ }).click();
  await expect(page.getByRole("tab", { name: "Progress", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("region", { name: "Selected client" })).toContainText("Maya Patel");
});

test("nobody needing attention shows a plain-words message and no rows", async ({ page }) => {
  await mockApi(page, []);
  await page.goto("/app");
  await page.getByRole("tab", { name: "Home" }).click();
  await expect(panel(page)).toContainText("Everyone is on track right now.");
  await expect(list(page)).toHaveCount(0);
});

test("a missing endpoint shows an error with Retry, not made-up rows", async ({ page }) => {
  await mockApi(page, "missing");
  await page.goto("/app");
  await page.getByRole("tab", { name: "Home" }).click();
  await expect(panel(page).getByRole("region", { name: "Needs attention" }).getByRole("alert")).toBeVisible();
  await expect(list(page)).toHaveCount(0);
});
