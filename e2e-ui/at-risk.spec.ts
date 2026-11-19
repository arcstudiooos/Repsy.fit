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
    // The redesigned Clients tab renders <WaitingList/> standalone, which reads /api/clients/waiting.
    if (req.method() === "GET" && url.pathname === "/api/clients/waiting") return route.fulfill({ json: [] });
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
// Redesign Nov 2026: at-risk is flagged ON each client's card (no separate "Needs attention" panel);
// the card's main button (aria-label "Open <name>") holds the amber chip and the reason lines.
const openCards = (page: Page) => panel(page).getByRole("button", { name: /^Open / });

test("each at-risk client is flagged on its own card and sorted to the top of the roster", async ({ page }) => {
  const requested = await mockApi(page, AT_RISK);
  await page.goto("/app");
  await page.getByRole("tab", { name: "Clients" }).click();
  // Both clients are at-risk here, so they sort at-risk-first then alphabetically: Leo before Maya.
  const cards = openCards(page);
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0)).toContainText("Leo Brooks");
  await expect(cards.nth(1)).toContainText("Maya Patel");
  // Each card carries the "Needs attention" chip and every exact reason the rule engine returned.
  const leo = page.getByRole("button", { name: "Open Leo Brooks" });
  await expect(leo).toContainText("Needs attention");
  await expect(leo).toContainText("Adherence 45% over the last 2 weeks");
  await expect(leo).toContainText("No check-in for 12 days");
  const maya = page.getByRole("button", { name: "Open Maya Patel" });
  await expect(maya).toContainText("Needs attention");
  await expect(maya).toContainText("Weight went up 3 logs in a row (68 → 69.5 kg) while the goal is fat loss");
  expect(requested[0]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
});

test("opening an at-risk client's card selects them and opens their workspace", async ({ page }) => {
  await mockApi(page, AT_RISK);
  await page.goto("/app");
  await page.getByRole("tab", { name: "Clients" }).click();
  await page.getByRole("button", { name: "Open Maya Patel" }).click();
  await expect(page.getByRole("region", { name: "Selected client" })).toContainText("Maya Patel");
});

test("nobody needing attention flags no card at all", async ({ page }) => {
  await mockApi(page, []);
  await page.goto("/app");
  await page.getByRole("tab", { name: "Clients" }).click();
  // New: with everyone on track, no card wears the amber "Needs attention" chip.
  const maya = panel(page).getByRole("button", { name: "Open Maya Patel" });
  await expect(maya).toBeVisible();
  await expect(maya).not.toContainText("Needs attention");
  await expect(panel(page).getByRole("button", { name: "Open Leo Brooks" })).not.toContainText("Needs attention");
});

test("a missing endpoint flags no card and never fabricates attention", async ({ page }) => {
  await mockApi(page, "missing");
  await page.goto("/app");
  await page.getByRole("tab", { name: "Clients" }).click();
  // New: on an at-risk error no card is flagged (it never invents attention); the roster stays usable.
  const leo = panel(page).getByRole("button", { name: "Open Leo Brooks" });
  await expect(leo).toBeVisible();
  await expect(leo).not.toContainText("Needs attention");
});
