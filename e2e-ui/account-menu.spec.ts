// The coach header's account menu (owner, Nov 2026): one initials button replaces the name link and
// "Log out". It is a proper menu button: aria-haspopup / aria-expanded, keyboard and outside-click close.
import { expect, test } from "./fixtures";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/**", (route) => route.fulfill({ json: [] }));
  await page.goto("/app");
});

test("the initials button opens a menu with Account settings and Log out; keyboard works", async ({ page }) => {
  const header = page.locator("header");
  const button = header.getByRole("button", { name: "Account menu for Test Coach" });
  await expect(button).toHaveText("TC");
  await expect(button).toHaveAttribute("aria-haspopup", "menu");
  await expect(button).toHaveAttribute("aria-expanded", "false");
  await expect(header.getByRole("switch", { name: "Dark mode" })).toBeVisible();

  await button.focus();
  await page.keyboard.press("Enter");
  await expect(button).toHaveAttribute("aria-expanded", "true");
  const menu = page.getByRole("menu", { name: "Account menu for Test Coach" });
  await expect(menu.getByRole("menuitem")).toHaveText(["Account settings", "Log out"]);
  await expect(menu.getByTestId("coach-name")).toHaveText("Test Coach");
  await expect(menu.getByRole("menuitem", { name: "Account settings" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(menu.getByRole("menuitem", { name: "Log out" })).toBeFocused();
  await page.keyboard.press("ArrowDown"); // wraps
  await expect(menu.getByRole("menuitem", { name: "Account settings" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(button).toBeFocused();
  await expect(button).toHaveAttribute("aria-expanded", "false");

  // A click outside closes it too.
  await button.click();
  await expect(menu).toBeVisible();
  await page.getByRole("tablist").click({ position: { x: 5, y: 5 } });
  await expect(menu).toHaveCount(0);

  // Account settings opens the account page, like the old name link.
  await button.click();
  await menu.getByRole("menuitem", { name: "Account settings" }).click();
  await expect(page).toHaveURL(/\/app\/account$/);
});

test("375px: the header fits (logo, switch, account menu) and the menu stays on screen", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  const button = page.getByRole("button", { name: "Account menu for Test Coach" });
  await expect(button).toBeVisible();
  const box = (await button.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(40);
  expect(box.height).toBeGreaterThanOrEqual(40);
  await button.click();
  const menuBox = (await page.getByRole("menu").boundingBox())!;
  expect(menuBox.x).toBeGreaterThanOrEqual(0);
  expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(375);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
});
