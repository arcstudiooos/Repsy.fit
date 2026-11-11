// Prompt 47: forgot / reset screens and the account page. Every /api call is mocked; the mock keeps a
// tiny "server" with one coach, a reset token and a signed-in flag.
import { expect, test, type Page, type Route } from "@playwright/test";

const SAME = "If that email exists, a reset link is on its way.";
const INVALID = "This reset link is not valid any more. Please ask for a new one.";

type Mock = {
  password: string;
  name: string;
  signedIn: boolean;
  goodToken: string;
  usedTokens: string[];
  calls: { method: string; path: string; body?: unknown }[];
};

async function mockApi(page: Page): Promise<Mock> {
  const mock: Mock = { password: "old-password-123", name: "Alice Coach", signedIn: false, goodToken: "good-token", usedTokens: [], calls: [] };
  const coach = () => ({ id: "coach-a", name: mock.name, email: "alice@example.com", createdAt: "2026-11-01T00:00:00.000Z" });

  await page.route("**/api/**", async (route: Route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    const body = req.postDataJSON() as Record<string, string> | null;
    mock.calls.push({ method: req.method(), path, body });

    if (path === "/api/auth/me" && req.method() === "GET") {
      return mock.signedIn ? route.fulfill({ json: coach() }) : route.fulfill({ status: 401, json: { error: "You are not signed in." } });
    }
    if (path === "/api/auth/me" && req.method() === "PATCH") {
      if (!body?.name?.trim()) return route.fulfill({ status: 400, json: { error: "Please enter your name." } });
      mock.name = body.name.trim();
      return route.fulfill({ json: coach() });
    }
    if (path === "/api/auth/login") {
      if (body?.email !== "alice@example.com" || body?.password !== mock.password) {
        return route.fulfill({ status: 401, json: { error: "That email or password is not right." } });
      }
      mock.signedIn = true;
      return route.fulfill({ json: coach() });
    }
    if (path === "/api/auth/forgot") return route.fulfill({ json: { message: SAME } });
    if (path === "/api/auth/reset") {
      if (body?.token !== mock.goodToken || mock.usedTokens.includes(body.token)) {
        return route.fulfill({ status: 400, json: { error: INVALID } });
      }
      mock.usedTokens.push(body.token);
      mock.password = body.password;
      mock.signedIn = false;
      return route.fulfill({ status: 204, body: "" });
    }
    if (path === "/api/auth/change-password") {
      if (body?.currentPassword !== mock.password) {
        return route.fulfill({ status: 400, json: { error: "Your current password is not right." } });
      }
      mock.password = body.newPassword;
      return route.fulfill({ status: 204, body: "" });
    }
    if (path === "/api/clients") return route.fulfill({ json: [] });
    return route.fulfill({ status: 404, json: { error: "Not found" } });
  });
  return mock;
}

test("login page links to forgot password; the same message shows for any email and no link is shown", async ({ page }) => {
  const mock = await mockApi(page);
  await page.goto("/login");
  await page.getByRole("link", { name: "Forgot password?" }).click();
  await expect(page).toHaveURL(/\/forgot-password$/);
  await page.getByLabel("Email").fill("anyone@example.com");
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("status")).toHaveText(SAME);
  await expect(page.locator("body")).not.toContainText(/reset-password\?token|http:\/\/localhost/);
  expect(mock.calls.find((c) => c.path === "/api/auth/forgot")?.body).toEqual({ email: "anyone@example.com" });
});

test("forgot: an empty or bad email is caught before any request", async ({ page }) => {
  const mock = await mockApi(page);
  await page.goto("/forgot-password");
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByText("Please enter your email.")).toBeVisible();
  expect(mock.calls.some((c) => c.path === "/api/auth/forgot")).toBe(false);
});

test("reset: use the link, log in with the new password; the same link fails afterwards", async ({ page }) => {
  const mock = await mockApi(page);
  await page.goto("/reset-password?token=good-token");
  await page.getByLabel("New password").fill("short");
  await page.getByRole("button", { name: "Set new password" }).click();
  await expect(page.getByText("Your password needs at least 10 characters.")).toBeVisible();
  expect(mock.calls.some((c) => c.path === "/api/auth/reset")).toBe(false);

  await page.getByLabel("New password").fill("brand-new-password");
  await page.getByRole("button", { name: "Set new password" }).click();
  await expect(page.getByRole("status")).toContainText("Your password is changed");
  await page.getByRole("link", { name: "Log in" }).click();
  await page.getByLabel("Email").fill("alice@example.com");
  await page.getByLabel("Password").fill("old-password-123");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByRole("alert")).toHaveText("That email or password is not right.");
  await page.getByLabel("Password").fill("brand-new-password");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/app$/);

  await page.goto("/reset-password?token=good-token");
  await page.getByLabel("New password").fill("yet-another-password");
  await page.getByRole("button", { name: "Set new password" }).click();
  await expect(page.getByRole("alert")).toHaveText(INVALID);
  await expect(page.getByRole("link", { name: "Ask for a new link" })).toBeVisible();
});

test("reset: a page opened without a token says the link is not valid", async ({ page }) => {
  await mockApi(page);
  await page.goto("/reset-password");
  await expect(page.getByRole("alert")).toHaveText(INVALID);
  await expect(page.getByLabel("New password")).toHaveCount(0);
});

test("account: shows the email, changes the name and the password (needs the current one)", async ({ page }) => {
  const mock = await mockApi(page);
  mock.signedIn = true;
  await page.goto("/app");
  await page.getByRole("link", { name: "Account" }).click();
  await expect(page).toHaveURL(/\/app\/account$/);
  await expect(page.getByRole("tab")).toHaveCount(0);
  await expect(page.getByTestId("account-email")).toHaveText("alice@example.com");
  await expect(page.locator("input[type=email]")).toHaveCount(0); // read-only text, not an input

  await page.getByLabel("Display name", { exact: true }).fill("Alice B");
  await page.getByRole("button", { name: "Save name" }).click();
  await expect(page.getByText("Name saved.")).toBeVisible();
  await expect(page.getByTestId("coach-name")).toHaveText("Alice B");

  await page.getByLabel("Current password").fill("wrong-password-1");
  await page.getByLabel("New password").fill("a-brand-new-password");
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByRole("alert")).toHaveText("Your current password is not right.");

  await page.getByLabel("Current password").fill("old-password-123");
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByText("Password changed. Your other devices have been signed out.")).toBeVisible();
  expect(mock.password).toBe("a-brand-new-password");

  await page.getByRole("link", { name: "Back to dashboard" }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole("tab", { name: "Clients" })).toBeVisible();
});

test("account: an empty name and a short new password are caught before any request", async ({ page }) => {
  const mock = await mockApi(page);
  mock.signedIn = true;
  await page.goto("/app/account");
  await page.getByLabel("Display name", { exact: true }).fill("  ");
  await page.getByRole("button", { name: "Save name" }).click();
  await expect(page.getByText("Please enter your name.")).toBeVisible();
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByText("Please enter your current password.")).toBeVisible();
  expect(mock.calls.some((c) => c.method === "PATCH" || c.path === "/api/auth/change-password")).toBe(false);
});
