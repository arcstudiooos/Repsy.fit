// Quick demo seed buttons (Prompt 29). Every /api call is mocked in the browser; the mock
// behaves like the server: the first seed creates 3 clients, later seeds create nothing.
import { expect, test, type Page, type Route } from "@playwright/test";

const DEMO = ["Maya Patel", "Arjun Mehta", "Casey Jordan"].map((name, i) => ({
  id: `demo-${i}`,
  coachId: "default-coach",
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

type Mock = { clients: typeof DEMO; seeds: number; failSeed: boolean };

async function mockApi(page: Page, start: typeof DEMO = []): Promise<Mock> {
  const mock: Mock = { clients: [...start], seeds: 0, failSeed: false };
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
    if (req.method() === "GET" && /\/(chat|assignments|progress)$/.test(path)) return route.fulfill({ json: [] });
    return route.fulfill({ status: 404, json: { error: "Not found" } });
  });
  return mock;
}

const strip = (page: Page) => page.getByRole("group", { name: "Select client" });

test("the empty-state button seeds 3 clients, refreshes, and selects Maya", async ({ page }) => {
  const mock = await mockApi(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Load demo clients" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Added 3 demo clients" })).toBeVisible();
  await expect(strip(page).getByRole("button")).toHaveCount(3);
  await expect(strip(page).getByRole("button", { name: /^Maya/ })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("tabpanel")).toContainText("Selected: Maya Patel");
  expect(mock.seeds).toBe(1);
});

test("the Clients tab 'Load demo' button: first tap adds 3, second tap says already loaded", async ({ page }) => {
  const mock = await mockApi(page);
  await page.goto("/");
  await page.getByRole("tab", { name: "Clients" }).click();
  // Zero clients: the empty-state button seeds.
  await page.getByRole("button", { name: "Load demo clients" }).click();
  await expect(page.getByRole("tabpanel")).toContainText("3 clients");
  await expect(page.getByRole("button", { name: "Added 3 demo clients" })).toBeVisible();

  await page.getByRole("button", { name: "Added 3 demo clients" }).click();
  await expect(page.getByRole("button", { name: "Demo already loaded" })).toBeVisible();
  await expect(page.getByRole("tabpanel")).toContainText("3 clients");
  expect(mock.seeds).toBe(2);
  expect(mock.clients).toHaveLength(3);
});

test("with clients already there, 'Load demo' says 'Demo already loaded'", async ({ page }) => {
  await mockApi(page, DEMO.slice(0, 1));
  await page.goto("/");
  await page.getByRole("tab", { name: "Clients" }).click();
  await page.getByRole("button", { name: "Load demo" }).click();
  await expect(page.getByRole("button", { name: "Demo already loaded" })).toBeVisible();
  await expect(page.getByRole("tabpanel")).toContainText("1 client");
});

test("a failed seed shows the error and adds nothing", async ({ page }) => {
  const mock = await mockApi(page);
  mock.failSeed = true;
  await page.goto("/");
  await page.getByRole("button", { name: "Load demo clients" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Couldn't load demo clients" })).toContainText("The server had a problem");
  await expect(page.getByRole("button", { name: "Load demo clients" })).toBeEnabled();
});
