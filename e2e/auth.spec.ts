// Prompt 46, against the real server and database: signed-out redirect, register, logout, and a
// second coach on the same browser seeing nothing of the first. Starts signed out (no shared cookie).
import { expect, test } from "@playwright/test";

test.use({ storageState: { cookies: [], origins: [] } });

test("signed out /app goes to /login; register, log out, and a second coach sees nothing of the first", async ({ page }) => {
  const stamp = Date.now().toString(36);
  const password = "e2e-test-password-1";

  await page.goto("/app");
  await expect(page).toHaveURL(/\/login$/);

  // Coach one registers, lands in an empty app and adds a client.
  await page.goto("/register");
  await page.getByLabel("Name").fill("First Coach");
  await page.getByLabel("Email").fill(`first-${stamp}@example.com`);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole("button", { name: "Account menu for First Coach" })).toBeVisible();
  await page.getByRole("tab", { name: "Clients" }).click();
  await page.getByRole("button", { name: "Add a client" }).click();
  await page.locator("#client-name").fill(`Private client ${stamp}`);
  await page.getByRole("button", { name: "Save client" }).click();
  await expect(page.getByText(`Private client ${stamp}`).first()).toBeVisible();

  await page.getByRole("button", { name: /^Account menu for / }).click();
  await page.getByRole("menuitem", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/app");
  await expect(page).toHaveURL(/\/login$/);

  // Coach two registers in the same browser.
  await page.goto("/register");
  await page.getByLabel("Name").fill("Second Coach");
  await page.getByLabel("Email").fill(`second-${stamp}@example.com`);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole("button", { name: "Account menu for Second Coach" })).toBeVisible();
  await expect(page.getByText(`Private client ${stamp}`)).toHaveCount(0);

  // Wrong password, then the right one.
  await page.getByRole("button", { name: /^Account menu for / }).click();
  await page.getByRole("menuitem", { name: "Log out" }).click();
  await page.getByLabel("Email").fill(`first-${stamp}@example.com`);
  await page.getByLabel("Password").fill("wrong-password-1");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByRole("alert")).toHaveText("That email or password is not right.");
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole("button", { name: "Account menu for First Coach" })).toBeVisible();
});
