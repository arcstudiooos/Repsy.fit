// "Continue with Google" on the coach login / register pages. /api is mocked.
import { expect, test, type Page } from "@playwright/test";

async function mock(page: Page, google: boolean) {
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/providers") return route.fulfill({ json: { google } });
    if (path === "/api/auth/me") return route.fulfill({ status: 401, json: { error: "You are not signed in." } });
    return route.fulfill({ json: [] });
  });
}

test("shows 'Continue with Google' on log in when the server has Google set up", async ({ page }) => {
  await mock(page, true);
  await page.goto("/login");
  const google = page.getByRole("link", { name: "Continue with Google" });
  await expect(google).toBeVisible();
  await expect(google).toHaveAttribute("href", "/api/auth/google/start");
  // the email form is still there
  await expect(page.getByRole("form", { name: "Log in" })).toBeVisible();
});

test("register says 'Sign up with Google'", async ({ page }) => {
  await mock(page, true);
  await page.goto("/register");
  await expect(page.getByRole("link", { name: "Sign up with Google" })).toBeVisible();
});

test("no Google button when Google is not set up", async ({ page }) => {
  await mock(page, false);
  await page.goto("/login");
  await expect(page.getByRole("form", { name: "Log in" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Google/ })).toHaveCount(0);
});

test("a failed Google sign-in comes back with a plain message", async ({ page }) => {
  await mock(page, true);
  await page.goto("/login?google=cancelled");
  await expect(page.getByRole("alert")).toHaveText("Google sign-in was cancelled.");
  await page.goto("/login?google=unverified");
  await expect(page.getByRole("alert")).toContainText("not verified");
  await page.goto("/login?google=link");
  await expect(page.getByRole("alert")).toContainText("already exists");
});
