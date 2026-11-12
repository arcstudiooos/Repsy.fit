// Prompt 77: /join/:code sign-up, the welcome questions, the waiting screen, and client password
// reset pages. Every /api call is mocked.
import { expect, test, type Page } from "@playwright/test";

type Account = { id: string; name: string; loginEmail: string; joinStatus: string; coachName: string; needsWelcome: boolean };

async function mock(page: Page, opts: { joinReply?: { status: number; json: unknown }; account?: Partial<Account>; badCode?: boolean } = {}) {
  const sent: { path: string; body: unknown }[] = [];
  let account: Account = { id: "c-new", name: "Maya Patel", loginEmail: "maya@example.com", joinStatus: "active", coachName: "Anna Rivers", needsWelcome: true, ...opts.account };
  await page.route("**/api/**", (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    const body = req.postData() ? req.postDataJSON() : undefined;
    if (req.method() !== "GET") sent.push({ path, body });
    if (path.startsWith("/api/join/")) {
      return opts.badCode
        ? route.fulfill({ status: 404, json: { error: "This join code is not valid. Please ask your coach for a new one." } })
        : route.fulfill({ json: { coachName: "Anna Rivers" } });
    }
    if (path === "/api/client-auth/join") {
      const reply = opts.joinReply ?? { status: 201, json: { id: "c-new", name: "Maya Patel", loginEmail: "maya@example.com", joinStatus: account.joinStatus } };
      return route.fulfill(reply);
    }
    if (path === "/api/client-auth/me") return route.fulfill({ json: account });
    if (path === "/api/client-auth/me/profile" && req.method() === "GET") {
      return route.fulfill({ json: { goal: "General fitness", age: null, heightCm: null, weightKg: null, level: "Beginner", units: "kg", injuries: "" } });
    }
    if (path === "/api/client-auth/me/profile") {
      account = { ...account, needsWelcome: false };
      return route.fulfill({ status: 204 });
    }
    if (path === "/api/client-auth/my-plan") return route.fulfill({ json: { plan: null, lastPaymentDate: null } });
    if (path === "/api/client-auth/my-sessions") return route.fulfill({ json: { sessions: [] } });
    if (path.startsWith("/api/client-auth/my-streaks")) return route.fulfill({ json: { date: "2026-11-12", checkInStreak: 0, habitPercent: null, workoutsThisWeek: 0, enoughData: false } });
    if (path === "/api/client-auth/forgot") return route.fulfill({ json: { message: "If that email exists, a reset link is on its way." } });
    if (path === "/api/client-auth/reset") return route.fulfill({ status: 204 });
    return route.fulfill({ status: 404, json: { error: "Not found" } });
  });
  return { sent };
}

test("the join page names the coach, validates, creates the account and goes to the welcome questions", async ({ page }) => {
  const { sent } = await mock(page);
  await page.goto("/join/anna-7k2q8m");
  await expect(page.getByRole("heading", { level: 1, name: "Join Anna Rivers's coaching" })).toBeVisible();
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Please enter your name.")).toBeVisible();
  await expect(page.getByText("Your password needs at least 10 characters.")).toBeVisible();
  expect(sent).toEqual([]);
  await page.getByLabel("Your name").fill("Maya Patel");
  await page.getByLabel("Email").fill(" Maya@Example.com ");
  await page.getByLabel(/^Password/).fill("correct horse battery");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/client\/welcome$/);
  expect(sent[0]).toEqual({
    path: "/api/client-auth/join",
    body: { code: "anna-7k2q8m", name: "Maya Patel", email: "maya@example.com", password: "correct horse battery" },
  });
  await expect(page.getByRole("heading", { level: 1, name: "A few quick questions" })).toBeVisible();
});

test("a bad or turned-off code shows a plain message and a way to sign in", async ({ page }) => {
  await mock(page, { badCode: true });
  await page.goto("/join/NOPE-222222");
  await expect(page.getByRole("alert")).toHaveText("This join code is not valid. Please ask your coach for a new one.");
  await expect(page.getByRole("form", { name: "Create your client account" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Go to the home page" })).toHaveAttribute("href", "/");
  await expect(page.getByRole("link", { name: "Client sign-in" })).toBeVisible();
});

test("an email that already has an account gets the server's message", async ({ page }) => {
  await mock(page, { joinReply: { status: 409, json: { error: "That email already has a client account. Please sign in." } } });
  await page.goto("/join/ANNA-7K2Q8M");
  await page.getByLabel("Your name").fill("Maya");
  await page.getByLabel("Email").fill("maya@example.com");
  await page.getByLabel(/^Password/).fill("correct horse battery");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("alert")).toHaveText("That email already has a client account. Please sign in.");
  await expect(page).toHaveURL(/\/join\/ANNA-7K2Q8M$/);
});

test("an address the coach already invited is told to check their email (not signed in)", async ({ page }) => {
  await mock(page, { joinReply: { status: 202, json: { status: "check-email", message: "Your coach has already added you. We've emailed you a link to finish joining - open it to set your password." } } });
  await page.goto("/join/ANNA-7K2Q8M");
  await page.getByLabel("Your name").fill("Maya");
  await page.getByLabel("Email").fill("maya@example.com");
  await page.getByLabel(/^Password/).fill("correct horse battery");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("status")).toContainText("We've emailed you a link to finish joining");
  await expect(page).toHaveURL(/\/join\/ANNA-7K2Q8M$/);
});

test("welcome questions: lb converts to kg, injuries are sent, then the client home", async ({ page }) => {
  const { sent } = await mock(page);
  await page.goto("/client/welcome");
  await page.getByLabel("Your main goal").selectOption("Muscle gain");
  await page.getByLabel("Age").fill("29");
  await page.getByLabel("Height (cm)").fill("165");
  await page.getByRole("radio", { name: "lb" }).click();
  await page.getByLabel("Weight in lb").fill("150");
  await page.getByLabel("Training experience").selectOption("Intermediate");
  await page.getByLabel("Injuries or anything your coach should know").fill("Left knee");
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Today" })).toBeVisible();
  expect(sent.at(-1)).toEqual({
    path: "/api/client-auth/me/profile",
    body: { goal: "Muscle gain", age: 29, heightCm: 165, weightKg: 68, level: "Intermediate", units: "lb", injuries: "Left knee" },
  });
});

test("welcome questions check ranges, and Skip for now saves nothing else", async ({ page }) => {
  const { sent } = await mock(page);
  await page.goto("/client/welcome");
  await page.getByLabel("Age").fill("9");
  await page.getByLabel("Weight in kg").fill("5");
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(page.getByText("Enter your age in whole years (13 or over).")).toBeVisible();
  await expect(page.getByText("Enter your weight in kg (20 to 500).")).toBeVisible();
  expect(sent).toEqual([]);
  await page.getByRole("button", { name: "Skip for now" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Today" })).toBeVisible();
  expect(sent).toEqual([{ path: "/api/client-auth/me/profile", body: { skip: true } }]);
});

test("/client sends a client who has not answered to the welcome questions", async ({ page }) => {
  await mock(page);
  await page.goto("/client");
  await expect(page).toHaveURL(/\/client\/welcome$/);
});

test("a pending client sees the waiting screen and no data", async ({ page }) => {
  await mock(page, { account: { joinStatus: "pending", needsWelcome: false } });
  await page.goto("/client");
  await expect(page.getByRole("heading", { level: 1, name: "Waiting for Anna Rivers" })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("approves new clients before they join");
  await expect(page.getByRole("region", { name: "My plan" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
});

test("a declined client is told plainly", async ({ page }) => {
  await mock(page, { account: { joinStatus: "declined", needsWelcome: false } });
  await page.goto("/client");
  await expect(page.getByRole("heading", { level: 1, name: "Request not accepted" })).toBeVisible();
});

test("client sign-in links to forgot password and lets a client type a join code", async ({ page }) => {
  await mock(page);
  await page.goto("/client/login");
  await page.getByLabel("No account yet? Enter your coach's code").fill("bad");
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByText("Codes look like ANNA-7K2Q8M.")).toBeVisible();
  await page.getByLabel("No account yet? Enter your coach's code").fill("anna-7k2q8m");
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page).toHaveURL(/\/join\/ANNA-7K2Q8M$/);
  await expect(page.getByRole("heading", { level: 1, name: "Join Anna Rivers's coaching" })).toBeVisible();
});

test("client forgot / reset password pages", async ({ page }) => {
  const { sent } = await mock(page);
  await page.goto("/client/login");
  await page.getByRole("link", { name: "Forgot your password?" }).click();
  await expect(page).toHaveURL(/\/client\/forgot-password$/);
  await page.getByLabel("Email").fill("MAYA@example.com");
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("status")).toHaveText("If that email exists, a reset link is on its way.");
  expect(sent).toEqual([{ path: "/api/client-auth/forgot", body: { email: "maya@example.com" } }]);

  await page.goto("/client/reset-password?token=tok123");
  await page.getByLabel("New password", { exact: true }).fill("new password 123");
  await page.getByRole("button", { name: "Set new password" }).click();
  await expect(page).toHaveURL(/\/client\/login\?set=1$/);
  expect(sent.at(-1)).toEqual({ path: "/api/client-auth/reset", body: { token: "tok123", password: "new password 123" } });

  await page.goto("/client/reset-password");
  await expect(page.getByRole("alert")).toHaveText("This reset link is not valid any more. Please ask for a new one.");
});

test("join and welcome pages work on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mock(page);
  await page.goto("/join/ANNA-7K2Q8M");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.goto("/client/welcome");
  await expect(page.getByRole("button", { name: "Save and continue" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
});
