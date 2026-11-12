// Repsy logo in the header, and the R-mark favicon.
import { expect, test } from "./fixtures";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/**", (route) => route.fulfill({ json: [] }));
});

for (const width of [375, 1280]) {
  test(`${width}px: the header shows the loaded Repsy logo, 36px tall, the switch and the account menu`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/app");
    const header = page.locator("header");
    const logo = header.getByRole("img", { name: "Repsy" });
    await expect(logo).toBeVisible();
    expect(await logo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    const box = (await logo.boundingBox())!;
    expect(Math.round(box.height)).toBe(36);
    expect(box.width).toBeGreaterThan(100); // wide wordmark, not squashed
    // No subtitle any more (owner, Nov 2026): logo, light / dark switch and the account menu only.
    await expect(header).not.toContainText("Prototype");
    await expect(header.getByRole("switch", { name: "Dark mode" })).toBeVisible();
    await expect(header.getByRole("button", { name: /^Account menu for / })).toBeVisible();
    await expect(header.getByRole("button", { name: "Log out" })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  });
}

test("the favicon and touch icon are the R mark and load", async ({ page, request }) => {
  await page.goto("/app");
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute("href", "/favicon.png");
  for (const path of ["/favicon.png", "/apple-touch-icon.png", "/repsy-logo.png"]) {
    const res = await request.get(path);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toBe("image/png");
  }
});

// Cream pages use the dark-wordmark logo (the white one is only for the dark coach header).
for (const path of ["/", "/?design=classic", "/login", "/register", "/client/login", "/privacy"]) {
  test(`${path} shows the full Repsy logo (gradient R + dark wordmark), loaded`, async ({ page }) => {
    await page.goto(path);
    const logo = page.locator('img[src="/repsy-logo-dark.png"]').first();
    await expect(logo).toBeVisible();
    expect(await logo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 300)).toBe(true);
    expect((await logo.boundingBox())!.height).toBeGreaterThanOrEqual(28);
  });
}

