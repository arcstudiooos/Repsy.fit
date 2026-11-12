// Sign-in screens wear the landing page's cream paper look in light AND dark mode (owner's request,
// Nov 2026): same background, wordmark home link, orange pill button with the hard ink shadow.
import { expect, test } from "@playwright/test";

test.use({ colorScheme: "dark" });

const CREAM = "rgb(250, 247, 242)";

for (const path of ["/login", "/register", "/forgot-password", "/client/login", "/join/ANNA-7K2Q8M"]) {
  test(`${path} is cream paper even in dark mode, like the landing`, async ({ page }) => {
    await page.route("**/api/**", (route) => {
      const p = new URL(route.request().url()).pathname;
      if (p.startsWith("/api/join/")) return route.fulfill({ json: { coachName: "Anna", requiresApproval: false } });
      if (p === "/api/auth/providers" || p === "/api/client-auth/providers") return route.fulfill({ json: { google: true } });
      return route.fulfill({ status: 401, json: { error: "You are not signed in." } });
    });
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const paper = page.locator(".paper");
    await expect(paper).toHaveCSS("background-color", CREAM);
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(CREAM);
    await expect(page.getByRole("link", { name: "Repsy home" })).toHaveAttribute("href", "/");
    const button = page.locator(".paper .btn-primary").first();
    await expect(button).toHaveCSS("border-radius", "999px");
    await expect(button).toHaveCSS("box-shadow", /rgb\(20, 20, 20\) 0px 4px 0px/);
    // Text on the card is the dark ink, not the dark-mode cream text.
    await expect(page.getByRole("heading", { level: 1 })).toHaveCSS("color", "rgb(26, 26, 26)");
  });
}

test("only sign-in screens get the cream page class (the legal pages and apps keep their own)", async ({ page }) => {
  await page.route("**/api/**", (route) => route.fulfill({ status: 401, json: { error: "You are not signed in." } }));
  await page.goto("/login");
  await expect(page.locator("html")).toHaveClass(/paper-page/);
  await page.goto("/privacy");
  await expect(page.locator("html")).not.toHaveClass(/paper-page/);
});
