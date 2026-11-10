// Browser smoke tests: app shell, client strip, and empty / loading / error states.
// A small set on purpose - not a full UI suite.
// Each test sets up REAL clients through the API first (all clients are deleted, then the
// needed ones created), so run these only against a test database.
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const TABS = ["AI Coach", "Clients", "Manual Planner", "Progress"];
const SAMPLE_CLIENTS = [
  { name: "Maya Patel", goal: "Fat loss + strength" },
  { name: "Arjun Mehta", goal: "Muscle gain" },
  { name: "Casey Jordan", goal: "Marathon prep + conditioning" },
];

const panel = (page: Page) => page.getByRole("tabpanel");
const strip = (page: Page) => page.getByRole("group", { name: "Select client" });

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

// Default for every test: the 3 sample clients. The empty-state tests override this.
test.beforeEach(async ({ request }) => {
  await setClients(request, SAMPLE_CLIENTS);
});

test.describe("app shell", () => {
  test("header strip shows the Repsy logo and subtitle", async ({ page }) => {
    await page.goto("/");
    const header = page.locator("header");
    await expect(header).toHaveCSS("background-color", "rgb(20, 20, 20)");
    const logo = header.getByRole("img", { name: "Repsy" });
    await expect(logo).toBeVisible();
    // Loaded for real (a broken image has naturalWidth 0).
    expect(await logo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
    await expect(header.getByText("Prototype - coach command center")).toBeVisible();
  });

  test("exactly 4 horizontal tabs, in order", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("tab")).toHaveText(TABS);
    await expect(page.getByRole("tablist")).toHaveCSS("flex-direction", "row");
    await expect(page.locator("nav, aside, [role=navigation]")).toHaveCount(0);
  });

  test("clicking each tab switches the panel", async ({ page }) => {
    await page.goto("/");
    for (const name of TABS) {
      await page.getByRole("tab", { name }).click();
      await expect(page.getByRole("tab", { name })).toHaveAttribute("aria-selected", "true");
      await expect(panel(page).getByRole("heading", { level: 2 })).toHaveText(name);
    }
  });

  test("phone width: tabs stay in one row and scroll sideways", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    await page.goto("/");
    const r = await page.getByRole("tablist").evaluate((list) => {
      const tops = [...list.children].map((t) => Math.round(t.getBoundingClientRect().top));
      return {
        oneRow: Math.max(...tops) - Math.min(...tops) <= 1,
        scrolls: list.scrollWidth > list.clientWidth,
        pageScrolls: document.documentElement.scrollWidth > window.innerWidth,
      };
    });
    expect(r).toEqual({ oneRow: true, scrolls: true, pageScrolls: false });
  });
});

test.describe("client strip (real clients from the API)", () => {
  test("shows 3 chips with initials, first name and goal", async ({ page }) => {
    await page.goto("/");
    const chips = strip(page).getByRole("button");
    await expect(chips).toHaveCount(3);
    await expect(chips.nth(0)).toHaveText(/^MPMayaFat loss \+ strength$/);
    await expect(chips.nth(1)).toHaveText(/^AMArjunMuscle gain$/);
    await expect(chips.nth(2)).toHaveText(/^CJCaseyMarathon prep \+ conditioning$/);
  });

  test("defaults to the first client, with the accent border", async ({ page }) => {
    await page.goto("/");
    await expect(panel(page)).toContainText("Selected: Maya Patel");
    const maya = strip(page).getByRole("button", { name: /Maya/ });
    await expect(maya).toHaveAttribute("aria-pressed", "true");
    await expect(maya).toHaveCSS("border-top-color", "rgb(255, 74, 31)");
  });

  test("tapping a chip changes the selected client on all three tabs", async ({ page }) => {
    await page.goto("/");
    for (const [first, full] of [["Arjun", "Arjun Mehta"], ["Casey", "Casey Jordan"]]) {
      await page.getByRole("tab", { name: "AI Coach" }).click();
      await strip(page).getByRole("button", { name: new RegExp(first) }).click();
      for (const tab of ["AI Coach", "Manual Planner", "Progress"]) {
        await page.getByRole("tab", { name: tab }).click();
        await expect(panel(page)).toContainText(`Selected: ${full}`);
      }
    }
  });

  test("Clients tab has no strip", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("tab", { name: "Clients" }).click();
    await expect(strip(page)).toHaveCount(0);
  });
});

test.describe("states", () => {
  test("loading: shows the Loading... card until the clients arrive", async ({ page }) => {
    // Hold the real /api/clients request so the loading state stays visible.
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    await page.route("**/api/clients", async (route) => {
      await held;
      await route.continue();
    });
    await page.goto("/");
    await expect(page.getByRole("status")).toHaveText(/loading\.\.\./i);
    release();
    await expect(strip(page)).toBeVisible(); // real clients load
  });

  test("error: plain-words message, Retry loads the real clients", async ({ page }) => {
    // Make the first /api/clients request fail with a server error; Retry goes through.
    await page.route("**/api/clients", (route) =>
      route.fulfill({ status: 500, json: { error: "Database is down" } }),
    );
    await page.goto("/");
    const alert = page.getByRole("alert");
    // Server errors are retried 3 times with backoff (~7s) before the error card shows.
    await expect(alert).toContainText("The server had a problem. Please try again in a moment.", { timeout: 15_000 });
    await expect(alert).not.toContainText("/api");
    await page.unroute("**/api/clients");
    await page.getByRole("button", { name: "Retry" }).click();
    await expect(strip(page)).toBeVisible();
    await expect(panel(page)).toContainText("Selected: Maya Patel");
  });

  test("empty: card with both buttons and the note", async ({ page, request }) => {
    await setClients(request, []);
    await page.goto("/");
    await expect(panel(page)).toContainText("Add your first client, or load demo clients to explore.");
    await expect(page.getByRole("button", { name: "Add a client" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Load demo clients" })).toBeVisible();
    await expect(panel(page)).toContainText("Demo data is sample data - delete any client anytime.");
  });

  test("empty: Add a client switches to the Clients tab", async ({ page, request }) => {
    await setClients(request, []);
    await page.goto("/");
    await page.getByRole("button", { name: "Add a client" }).click();
    await expect(page.getByRole("tab", { name: "Clients" })).toHaveAttribute("aria-selected", "true");
  });
});

// Runs against `npm start` - the production server serving the built client (Prompt 32).
test.describe("production server", () => {
  test("health check reports the database", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ ok: true, db: true });
  });

  test("refreshing on a non-API path still opens the full app", async ({ page }) => {
    const res = await page.goto("/some/deep/link");
    expect(res?.status()).toBe(200);
    await expect(page.getByRole("tab")).toHaveCount(4);
    await expect(strip(page).getByRole("button")).toHaveCount(3);
  });

  test("unknown /api paths are JSON 404, not the app page", async ({ request }) => {
    const res = await request.get("/api/no-such-route");
    expect(res.status()).toBe(404);
    expect(res.headers()["content-type"]).toMatch(/application\/json/);
    expect(await res.json()).toEqual({ error: "Not found" });
  });
});
