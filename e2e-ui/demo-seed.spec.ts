// Quick demo seed buttons (Prompt 29). Every /api call is mocked in the browser; the mock
// behaves like the server: the first seed creates 3 clients, later seeds create nothing.
import { expect, test, type Page, type Route } from "./fixtures";

const DEMO = ["Maya Patel", "Arjun Mehta", "Casey Jordan"].map((name, i) => ({
  id: `demo-${i}`,
  coachId: null,
  name,
  goal: "Fat loss + strength",
  age: 29,
  weightKg: 68,
  heightCm: 165,
  level: "Intermediate",
  focus: "",
  notes: "",
  createdAt: `2026-11-10T00:00:00.00${i}Z`,
}));

const SIX = Array.from({ length: 10 }, (_, i) => ({ ...DEMO[0], id: `six-${i}`, name: `Six Month ${i}` }));

type Mock = { clients: typeof DEMO; seeds: number; sixSeeds: number; failSeed: boolean };

async function mockApi(page: Page, start: typeof DEMO = []): Promise<Mock> {
  const mock: Mock = { clients: [...start], seeds: 0, sixSeeds: 0, failSeed: false };
  await page.route("**/api/**", async (route: Route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (req.method() === "GET" && path === "/api/clients") return route.fulfill({ json: mock.clients });
    if (req.method() === "POST" && path === "/api/seed/demo") {
      mock.seeds++;
      if (mock.failSeed) return route.fulfill({ status: 500, json: { error: "Something went wrong on the server." } });
      if (mock.clients.length > 0) return route.fulfill({ status: 200, json: [] });
      mock.clients = [...DEMO];
      return route.fulfill({ status: 201, json: DEMO });
    }
    if (req.method() === "POST" && path === "/api/seed/six-month-demo") {
      mock.sixSeeds++;
      const missing = SIX.filter((c) => !mock.clients.some((m) => m.name === c.name));
      mock.clients = [...mock.clients, ...missing];
      return route.fulfill({ status: missing.length ? 201 : 200, json: missing });
    }
    if (req.method() === "GET" && /\/(chat|assignments|progress)$/.test(path)) return route.fulfill({ json: [] });
    return route.fulfill({ status: 404, json: { error: "Not found" } });
  });
  return mock;
}

// The client header's "Switch client" list (it replaced the chip strip).
const clientList = async (page: Page) => {
  await page.getByRole("button", { name: "Switch client" }).click();
  return page.getByRole("listbox", { name: "Clients" });
};

test("the empty-state button seeds 3 clients, refreshes, and selects Maya", async ({ page }) => {
  const mock = await mockApi(page);
  await page.goto("/app");
  await page.getByRole("button", { name: "Load demo clients" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Added 3 demo clients" })).toBeVisible();
  const list = await clientList(page);
  await expect(list.getByRole("option")).toHaveCount(3);
  await expect(list.getByRole("option", { name: /^Maya/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("region", { name: "Selected client" })).toContainText("Maya Patel");
  expect(mock.seeds).toBe(1);
});

test("Clients tab: the demo buttons show only while there are no clients", async ({ page }) => {
  const mock = await mockApi(page);
  await page.goto("/app");
  await page.getByRole("tab", { name: "Clients" }).click();
  // Zero clients: the empty-state button seeds.
  await expect(page.getByRole("button", { name: "Load 6-month demo (10 clients)" })).toBeVisible();
  await page.getByRole("button", { name: "Load demo clients" }).click();
  await expect(page.getByRole("tabpanel").first()).toContainText("3 clients");
  await expect(page.getByRole("status").filter({ hasText: "Added 3 demo clients" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Load demo|6-month demo/ })).toHaveCount(0);
  expect(mock.seeds).toBe(1);
  expect(mock.clients).toHaveLength(3);
});

test("with clients already there, there are no demo buttons and no demo note", async ({ page }) => {
  await mockApi(page, DEMO.slice(0, 1));
  await page.goto("/app");
  await page.getByRole("tab", { name: "Clients" }).click();
  await expect(page.getByRole("tabpanel").first()).toContainText("1 client");
  await expect(page.getByRole("button", { name: /Load demo|6-month demo|Demo already loaded/ })).toHaveCount(0);
  await expect(page.getByRole("tabpanel").first()).not.toContainText("13 clients");
});

test("a failed seed shows the error and adds nothing", async ({ page }) => {
  const mock = await mockApi(page);
  mock.failSeed = true;
  await page.goto("/app");
  await page.getByRole("button", { name: "Load demo clients" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Couldn't load demo clients" })).toContainText("The server had a problem");
  await expect(page.getByRole("button", { name: "Load demo clients" })).toBeEnabled();
});

test("the 6-month button adds 10, says so, and the demo buttons go away", async ({ page }) => {
  const mock = await mockApi(page);
  await page.goto("/app");
  await page.getByRole("tab", { name: "Clients" }).click();
  await page.getByRole("button", { name: "Load 6-month demo (10 clients)" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Added 10 demo clients" })).toBeVisible();
  await expect(page.getByRole("tabpanel").first()).toContainText("10 clients");
  await expect(page.getByRole("button", { name: /Load demo|6-month demo/ })).toHaveCount(0);
  expect(mock.sixSeeds).toBe(1);
});

test("after the 6-month seed the first new client is selected", async ({ page }) => {
  await mockApi(page);
  await page.goto("/app");
  await page.getByRole("tab", { name: "Clients" }).click();
  await page.getByRole("button", { name: "Load 6-month demo (10 clients)" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Added 10 demo clients" })).toBeVisible();
  await page.getByRole("tab", { name: "AI Coach" }).click();
  await expect(page.getByRole("region", { name: "Selected client" })).toContainText("Six Month 0");
});
