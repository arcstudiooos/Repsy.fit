// Shared test fixture (Prompt 46). /app now checks GET /api/auth/me before it shows anything, so
// every mocked spec that opens /app needs a signed-in coach. Specs import { test, expect } from
// "./fixtures" instead of "@playwright/test": the page answers /api/auth/me with MOCK_COACH, whatever
// catch-all page.route("**/api/**") the spec registers afterwards (later routes win in Playwright,
// so the answer is added inside page.route itself). auth.spec.ts uses plain @playwright/test
// because it mocks the sign-in flow on its own.
import { test as base, type Page, type Route } from "@playwright/test";

export { expect } from "@playwright/test";
export type { Page, Route } from "@playwright/test";

export const MOCK_COACH = {
  id: "coach-test",
  name: "Test Coach",
  email: "coach@example.com",
  createdAt: "2026-11-01T00:00:00.000Z",
};

export const test = base.extend({
  page: async ({ page }, use) => {
    const originalRoute = page.route.bind(page) as (url: unknown, handler: unknown, options?: unknown) => Promise<void>;
    const answerMe = (handler: (route: Route, request: ReturnType<Route["request"]>) => unknown) =>
      (route: Route, request: ReturnType<Route["request"]>) => {
        const { pathname } = new URL(request.url());
        if (request.method() === "GET" && pathname === "/api/auth/me") return route.fulfill({ json: MOCK_COACH });
        return handler(route, request);
      };
    // The base answer covers specs that never mock /api at all (logo, footer).
    await originalRoute("**/api/auth/me", (route: Route) => route.fulfill({ json: MOCK_COACH }));
    (page as unknown as { route: typeof originalRoute }).route = (url, handler, options) =>
      originalRoute(url, typeof handler === "function" ? answerMe(handler as never) : handler, options);
    await use(page);
  },
});

/**
 * Valid empty answers for the Home cards' endpoints. /app opens on Home since Nov 2026, so a spec's catch-all
 * mock must answer these with the right shape (a bare [] would not be a real server reply). Anything else: [].
 */
export function emptyApi(path: string): unknown {
  switch (path) {
    case "/api/review-queue":
      return { pendingCount: 0, items: [] };
    case "/api/tasks/today":
      return { date: "2026-11-12", tasks: [] };
    case "/api/checkins/recent":
      return { items: [] };
    case "/api/at-risk":
      return { date: "2026-11-12", clients: [] };
    case "/api/weekly-summary":
      return { weekStart: "2026-11-09", summary: null };
    case "/api/alerts":
      return { waiting: 0, joined: [], finished: [], unread: [] };
    default:
      return [];
  }
}

// Navigation helpers (Nov 2026 navigation): five top tabs (Home, Clients, AI Coach, Messages, Business);
// Plans / Progress / Check-ins are sub-tabs of a client's workspace inside Clients; Library is a Business view.
export type ClientSubTab = "Plans" | "Progress" | "Check-ins";

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Opens a client's workspace on a sub-tab. Without a name it uses the selected client (and just
 * switches sub-tab when a workspace is already open); with a name it opens that client's card.
 */
export async function openClientTab(page: Page, sub: ClientSubTab, clientName?: string) {
  const subTab = page.getByRole("tab", { name: sub, exact: true });
  if (!clientName && (await subTab.isVisible())) {
    await subTab.click();
    return;
  }
  await page.getByRole("tab", { name: "Clients" }).click();
  const card = clientName
    ? page.getByRole("button", { name: new RegExp(`^Open ${escapeRe(clientName)}`) })
    : page.getByRole("button", { name: /^Open /, pressed: true });
  await card.first().click();
  await subTab.click();
}

/** Since Nov 2026 /app opens on Home: goes to /app and opens the AI Coach tab. */
export async function openAiCoach(page: Page) {
  await page.goto("/app");
  await page.getByRole("tab", { name: "AI Coach" }).click();
}

/** Plans: opens the New assignment form with the "+ New plan" button (the form is closed by default). */
export async function openNewPlanForm(page: Page) {
  await page.getByRole("button", { name: "New plan", exact: true }).click();
  return page.getByRole("form", { name: "New assignment" });
}

/** Check-ins: opens the collapsed "Log a check-in for <name>" section (history shows first). */
export async function openLogCheckIn(page: Page) {
  const toggle = page.getByRole("button", { name: /^Log a check-in for / });
  if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
  return page.getByRole("form", { name: "Today's check-in" });
}

/** Picks a client with the client header's "Switch client" control (AI Coach / client workspace). */
export async function selectClient(page: Page, name: string) {
  await page.getByRole("button", { name: "Switch client" }).click();
  await page.getByRole("combobox", { name: "Search clients" }).fill(name);
  await page.getByRole("option", { name: new RegExp(escapeRe(name)) }).first().click();
}

/** Opens Business -> Library (templates, meals, macro calculator). */
export async function openLibrary(page: Page, view?: "Templates" | "Meals" | "Macro calculator") {
  await page.getByRole("tab", { name: "Business" }).click();
  await page.getByRole("group", { name: "Business view" }).getByRole("button", { name: "Library" }).click();
  // UI batch 4: Library has its own views (Templates / Meals / Macro calculator); the last one is remembered.
  if (view) await page.getByRole("group", { name: "Library view" }).getByRole("button", { name: view, exact: true }).click();
}

/** Opens any section by name: a top tab, a client workspace sub-tab (selected client) or Business -> Library. */
export async function openSection(page: Page, name: string) {
  if (name === "Plans" || name === "Progress" || name === "Check-ins") return openClientTab(page, name);
  if (name === "Library") return openLibrary(page);
  await page.getByRole("tab", { name }).click();
}
