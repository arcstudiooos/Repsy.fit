// The always-visible light / dark switch in the coach header (owner's request, Nov 2026).
import { expect, test } from "./fixtures";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/**", (route) => route.fulfill({ json: [] }));
});

const bg = (page: import("@playwright/test").Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

test.describe("device in light mode", () => {
  test.use({ colorScheme: "light" });

  test("the switch is in the header, off, and turns the app dark - and the choice survives a reload", async ({ page }) => {
    await page.goto("/app");
    const sw = page.locator("header").getByRole("switch", { name: "Dark mode" });
    await expect(sw).toBeVisible();
    await expect(sw).toHaveAttribute("aria-checked", "false");
    expect(await bg(page)).toBe("rgb(250, 247, 242)");
    await sw.click();
    await expect(sw).toHaveAttribute("aria-checked", "true");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect.poll(() => bg(page)).toBe("rgb(20, 20, 20)");
    await page.reload();
    await expect(page.locator("header").getByRole("switch", { name: "Dark mode" })).toHaveAttribute("aria-checked", "true");
    await expect.poll(() => bg(page)).toBe("rgb(20, 20, 20)");
  });

  test("it is a 40px+ tap target that works from the keyboard", async ({ page }) => {
    await page.goto("/app");
    const sw = page.locator("header").getByRole("switch", { name: "Dark mode" });
    const box = (await sw.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(40);
    await sw.focus();
    await page.keyboard.press("Space");
    await expect(sw).toHaveAttribute("aria-checked", "true");
  });
});

test.describe("device in dark mode", () => {
  test.use({ colorScheme: "dark" });

  test("starts on, and switching it off gives the light theme", async ({ page }) => {
    await page.goto("/app");
    const sw = page.locator("header").getByRole("switch", { name: "Dark mode" });
    await expect(sw).toHaveAttribute("aria-checked", "true");
    expect(await bg(page)).toBe("rgb(20, 20, 20)");
    await sw.click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect.poll(() => bg(page)).toBe("rgb(250, 247, 242)");
  });

  test("sign-in screens stay cream even when the app is set to dark", async ({ page }) => {
    await page.goto("/app");
    await page.locator("header").getByRole("switch", { name: "Dark mode" }).click();
    await page.locator("header").getByRole("switch", { name: "Dark mode" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.route("**/api/**", (route) => route.fulfill({ status: 401, json: { error: "You are not signed in." } }));
    await page.goto("/login");
    await expect(page.locator(".paper")).toHaveCSS("background-color", "rgb(250, 247, 242)");
  });
});
