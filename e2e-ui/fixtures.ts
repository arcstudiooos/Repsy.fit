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

/** Picks a client with the client header's "Switch client" control (AI Coach / client workspace). */
export async function selectClient(page: Page, name: string) {
  await page.getByRole("button", { name: "Switch client" }).click();
  await page.getByRole("combobox", { name: "Search clients" }).fill(name);
  await page.getByRole("option", { name: new RegExp(escapeRe(name)) }).first().click();
}

/** Opens Business -> Library (templates, meals, macro calculator). */
export async function openLibrary(page: Page) {
  await page.getByRole("tab", { name: "Business" }).click();
  await page.getByRole("group", { name: "Business view" }).getByRole("button", { name: "Library" }).click();
}

/** Opens any section by name: a top tab, a client workspace sub-tab (selected client) or Business -> Library. */
export async function openSection(page: Page, name: string) {
  if (name === "Plans" || name === "Progress" || name === "Check-ins") return openClientTab(page, name);
  if (name === "Library") return openLibrary(page);
  await page.getByRole("tab", { name }).click();
}
