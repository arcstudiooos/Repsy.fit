// Prompt 78: "Continue with Google" on the client sign-in and join pages, and the messages for each
// way a client's Google attempt can come back. Every /api call is mocked.
import { expect, test, type Page } from "@playwright/test";

async function mock(page: Page, google: boolean) {
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/providers") return route.fulfill({ json: { google } });
    if (path.startsWith("/api/join/")) return route.fulfill({ json: { coachName: "Anna Rivers" } });
    if (path === "/api/client-auth/me") return route.fulfill({ status: 401, json: { error: "You are not signed in." } });
    return route.fulfill({ status: 404, json: { error: "Not found" } });
  });
}

test("client sign-in shows Continue with Google, pointing at the CLIENT start route", async ({ page }) => {
  await mock(page, true);
  await page.goto("/client/login");
  const link = page.getByRole("link", { name: "Continue with Google" });
  await expect(link).toHaveAttribute("href", "/api/client-auth/google/start");
});

test("the join page's Google button carries the code", async ({ page }) => {
  await mock(page, true);
  await page.goto("/join/anna-7k2q8m");
  await expect(page.getByRole("link", { name: "Continue with Google" })).toHaveAttribute("href", "/api/client-auth/google/start?code=ANNA-7K2Q8M");
});

test("no button when Google is not set up on the server", async ({ page }) => {
  await mock(page, false);
  await page.goto("/client/login");
  await expect(page.getByRole("heading", { level: 1, name: "Client sign-in" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Continue with Google" })).toHaveCount(0);
});

for (const [reason, text] of [
  ["noaccount", "No client account for this Google account. Ask your coach for their join link."],
  ["link", "A client account with this email already exists. Sign in with your email and password."],
  ["cancelled", "Google sign-in was cancelled."],
  ["something-new", "Google sign-in didn't work. Please try again, or use your email and password."],
] as const) {
  test(`client sign-in explains ?google=${reason}`, async ({ page }) => {
    await mock(page, true);
    await page.goto(`/client/login?google=${reason}`);
    await expect(page.getByRole("alert")).toHaveText(text);
  });
}

test("the join page explains a code that stopped working during the Google round trip", async ({ page }) => {
  await mock(page, true);
  await page.goto("/join/ANNA-7K2Q8M?google=badcode");
  await expect(page.getByRole("alert")).toHaveText("This join code is not valid. Please ask your coach for a new one.");
});

test("the join page explains an account that belongs to another coach", async ({ page }) => {
  await mock(page, true);
  await page.goto("/join/ANNA-7K2Q8M?google=othercoach");
  await expect(page.getByRole("alert")).toHaveText(
    "This Google account already has a Repsy client account with another coach. Sign in from the client sign-in page.",
  );
});

test("the join page's terms line covers both Google and email sign-up", async ({ page }) => {
  await mock(page, true);
  await page.goto("/join/ANNA-7K2Q8M");
  await expect(page.getByText("By creating an account (with Google or email) you agree to the")).toBeVisible();
});

test("the coach login keeps its own Google link", async ({ page }) => {
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/providers") return route.fulfill({ json: { google: true } });
    return route.fulfill({ status: 401, json: { error: "You are not signed in." } });
  });
  await page.goto("/login");
  await expect(page.getByRole("link", { name: "Continue with Google" })).toHaveAttribute("href", "/api/auth/google/start");
});
