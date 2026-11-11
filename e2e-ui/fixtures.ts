// Shared test fixture (Prompt 46). /app now checks GET /api/auth/me before it shows anything, so
// every mocked spec that opens /app needs a signed-in coach. Specs import { test, expect } from
// "./fixtures" instead of "@playwright/test": the page answers /api/auth/me with MOCK_COACH, whatever
// catch-all page.route("**/api/**") the spec registers afterwards (later routes win in Playwright,
// so the answer is added inside page.route itself). auth.spec.ts uses plain @playwright/test
// because it mocks the sign-in flow on its own.
import { test as base, type Route } from "@playwright/test";

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
