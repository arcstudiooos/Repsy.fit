// Browser smoke tests against the REAL server and database: the things only a real server can
// prove. Everything a mocked page can prove (styling, loading / error cards, per-tab panels, phone
// layout) lives in e2e-ui/ instead, where it runs in a fraction of the time - Prompt 74 trimmed
// those duplicates from here so the real-server suite stays small and meaningful.
// Each test sets up REAL clients through the API first (all clients are deleted, then the
// needed ones created), so run these only against a test database.
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { TOP_TABS, clientHeader, openClientTab, selectClient } from "./nav";

const TABS = TOP_TABS;
const SAMPLE_CLIENTS = [
  { name: "Maya Patel", goal: "Fat loss + strength" },
  { name: "Arjun Mehta", goal: "Muscle gain" },
  { name: "Casey Jordan", goal: "Marathon prep + conditioning" },
];

const panel = (page: Page) => page.getByRole("tabpanel").first();

/** Deletes every client, then creates the given ones in order (oldest first = first chip). */
async function setClients(request: APIRequestContext, clients: { name: string; goal: string }[]) {
  const list = await request.get("/api/clients");
  expect(list.ok()).toBeTruthy();
  for (const c of (await list.json()) as { id: string }[]) {
    expect((await request.delete(`/api/clients/${c.id}`)).status()).toBe(204);
  }
  for (const c of clients) {
    expect((await request.post("/api/clients", { data: c })).status()).toBe(201);
  }
}

// Default for every test: the 3 sample clients. The empty-state test overrides this.
test.beforeEach(async ({ request }) => {
  await setClients(request, SAMPLE_CLIENTS);
});

test("the production build serves the app shell: 5 tabs in order and a real logo file", async ({ page }) => {
  await page.goto("/app");
  await expect(page.getByRole("tablist", { name: "Sections" }).getByRole("tab")).toHaveText(TABS);
  const logo = page.locator("header").getByRole("img", { name: "Repsy" });
  // Loaded for real from the server (a broken image has naturalWidth 0).
  expect(await logo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
});

test("the client header lists the real clients, and switching one carries into the workspace", async ({ page }) => {
  await page.goto("/app");
  await expect(clientHeader(page)).toContainText("Maya Patel");
  await expect(clientHeader(page)).toContainText("Fat loss + strength");
  await page.getByRole("button", { name: "Switch client" }).click();
  const options = page.getByRole("listbox", { name: "Clients" }).getByRole("option");
  await expect(options).toHaveCount(3);
  await expect(options.nth(0)).toContainText("Maya Patel");
  await page.keyboard.press("Escape");

  await selectClient(page, "Casey Jordan");
  await expect(clientHeader(page)).toContainText("Casey Jordan");
  for (const sub of ["Plans", "Progress"] as const) {
    await openClientTab(page, sub);
    await expect(clientHeader(page)).toContainText("Casey Jordan");
  }
  // The roster manages clients, so it has no client header.
  await page.getByRole("button", { name: "Back to all clients" }).click();
  await expect(clientHeader(page)).toHaveCount(0);
});

test("a message really persists: send it, reload, and it is still the only one", async ({ page }) => {
  await page.goto("/app");
  await page.getByRole("tab", { name: "Messages" }).click();
  const clientsList = page.getByRole("list", { name: "Clients" });
  await clientsList.getByRole("button", { name: /Maya Patel/ }).click();
  const pane = page.getByRole("region", { name: "Conversation with Maya Patel" });
  await expect(pane).toContainText("Start the conversation - your client sees this in their app view.");
  const box = page.getByLabel("Message to Maya Patel");
  await box.fill("Smoke test hello");
  await box.press("Enter");
  await expect(pane.locator('li[data-sender="coach"]')).toContainText("Smoke test hello");
  await expect(clientsList.getByRole("button", { name: /Maya Patel/ })).toContainText("You: Smoke test hello");

  await page.reload();
  await page.getByRole("tab", { name: "Messages" }).click();
  await page.getByRole("list", { name: "Clients" }).getByRole("button", { name: /Maya Patel/ }).click();
  await expect(page.getByRole("region", { name: "Conversation with Maya Patel" }).getByRole("listitem")).toHaveCount(1);
});

test("a coach with no clients gets the empty state, and Add a client opens the Clients tab", async ({ page, request }) => {
  await setClients(request, []);
  await page.goto("/app");
  await expect(panel(page)).toContainText("Add your first client, or load demo clients to explore.");
  await expect(page.getByRole("button", { name: "Load demo clients" })).toBeVisible();
  await page.getByRole("button", { name: "Add a client" }).click();
  await expect(page.getByRole("tab", { name: "Clients" })).toHaveAttribute("aria-selected", "true");
});

// Runs against `npm start` - the production server serving the built client (Prompt 32).
test.describe("production server", () => {
  test("health check reports the database", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ ok: true, db: true });
  });

  test("refreshing on a deep /app path still opens the full app", async ({ page }) => {
    const res = await page.goto("/app/some/deep/link");
    expect(res?.status()).toBe(200);
    await expect(page.getByRole("tablist", { name: "Sections" }).getByRole("tab")).toHaveCount(5);
    await expect(clientHeader(page)).toContainText("Maya Patel");
  });

  test("unknown /api paths are JSON 404, not the app page", async ({ request }) => {
    const res = await request.get("/api/no-such-route");
    expect(res.status()).toBe(404);
    expect(res.headers()["content-type"]).toMatch(/application\/json/);
    expect(await res.json()).toEqual({ error: "Not found" });
  });

  // Prompt 73: the headers the security pass added must survive on the real deployed server.
  test("every response carries the security headers and no CORS wildcard", async ({ request }) => {
    const res = await request.get("/app");
    const h = res.headers();
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["content-security-policy"]).toContain("script-src 'self'");
    expect(h["x-powered-by"]).toBeUndefined();
    expect(h["access-control-allow-origin"]).toBeUndefined();
  });
});
