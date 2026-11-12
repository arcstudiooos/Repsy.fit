// Prompt 74: the full v2 journey against a REAL server and database, in order.
// One brand-new coach, one client, start to finish: landing -> register -> build -> invite ->
// the client signs in -> the coach sees the result -> weekly summary -> CSV export.
// CI runs it against the production build on a throwaway Postgres with no AI key, so the AI steps
// take the fallback path (that is deliberate: the journey must work without a paid key).
// Everything it makes belongs to its own coach, and the last step deletes that coach, so the
// database is left exactly as it was found.
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);

// One browser context for the whole journey, created here rather than taken from the `page`
// fixture: every Playwright test gets a FRESH context, which would throw away the session this
// journey registers in step 2. It also must not start from global-setup's saved coach session,
// because step 2 proves a brand-new coach starts with nothing.
let context: BrowserContext;
let page: Page;

test.beforeAll(async ({ browser }) => {
  context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  page = await context.newPage();
});

test.afterAll(async () => {
  await context?.close();
});

const stamp = Date.now().toString(36);
const COACH_EMAIL = `v2-journey-${stamp}@example.com`;
const COACH_PASSWORD = "journey-password-1";
const CLIENT_NAME = `Journey${stamp} Client`;
const CLIENT_EMAIL = `v2-client-${stamp}@example.com`;
const TEMPLATE = `Journey Push ${stamp}`;
const today = new Date().toLocaleDateString("en-CA");

let inviteLink = "";

const panel = (page: Page) => page.getByRole("tabpanel");
const tab = (page: Page, name: string) => page.getByRole("tab", { name });

test("1. the landing page loads (3D or fallback) and the lead form saves", async () => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  // Either the real 3D canvas or the poster fallback - both are a pass, neither may be missing.
  const hero = page.locator("section[aria-labelledby=hero-title]");
  await expect(hero).toBeVisible();
  expect(await hero.locator("canvas, .landing-poster, img, svg").count()).toBeGreaterThan(0);

  const form = page.getByRole("form", { name: "Start free" });
  await form.scrollIntoViewIfNeeded();
  await form.getByLabel("Name").fill(`Journey Lead ${stamp}`);
  await form.getByLabel("Email").fill(`v2-lead-${stamp}@example.com`);
  await form.getByRole("button", { name: "Start free" }).click();
  // The server really stored it (the form swaps itself for a thank-you).
  await expect(page.getByTestId("lead-result")).toContainText(/You're on the list|already on the list/, { timeout: 15_000 });
});

test("2. signed out, /app redirects to login; a new coach registers and lands in the app", async () => {
  await page.goto("/app");
  await expect(page).toHaveURL(/\/login$/);

  await page.getByRole("link", { name: /Create an account/i }).click();
  const form = page.getByRole("form", { name: "Create account" });
  await form.getByLabel("Name").fill(`Journey Coach ${stamp}`);
  await form.getByLabel("Email").fill(COACH_EMAIL);
  await form.getByLabel("Password", { exact: true }).fill(COACH_PASSWORD);
  await form.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/app/, { timeout: 30_000 });
  await expect(page.getByRole("tab")).toHaveCount(9);
  // A brand-new coach starts with nothing: proof the account is really new and really scoped.
  await expect(panel(page)).toContainText(/Add your first client|No clients yet/);
});

test("3. the coach adds a client", async () => {
  await page.goto("/app");
  await tab(page, "Clients").click();
  const add = panel(page).getByRole("button", { name: "Add client", exact: true });
  if (await add.isVisible()) await add.click();
  const form = panel(page).getByRole("form", { name: "Add client" });
  await form.getByLabel("Name", { exact: true }).fill(CLIENT_NAME);
  await form.getByLabel("Goal").selectOption("Fat loss");
  await form.getByRole("button", { name: "Save client" }).click();
  await expect(form).toHaveCount(0, { timeout: 30_000 });
  await expect(panel(page)).toContainText(CLIENT_NAME);
});

test("4. the coach builds a workout template in the Library", async () => {
  await page.goto("/app");
  await tab(page, "Library").click();
  await panel(page).getByRole("button", { name: "New template" }).click();
  const form = panel(page).getByRole("form", { name: "New template" });
  await form.getByLabel("Template name").fill(TEMPLATE);
  await form.getByLabel("Search exercises").fill("back squat");
  await form.getByRole("list", { name: "Exercise results" }).getByRole("button", { name: /Back Squat/ }).click();
  await form.getByLabel("Sets for Back Squat").fill("5");
  await form.getByLabel("Reps for Back Squat").fill("5");
  await form.getByRole("button", { name: "Save template" }).click();
  await expect(form).toHaveCount(0, { timeout: 30_000 });
  await expect(panel(page)).toContainText(TEMPLATE);
});

test("5. the coach assigns a program to the client", async () => {
  await page.goto("/app");
  await tab(page, "Manual Planner").click();
  await expect(panel(page)).toContainText(`Selected: ${CLIENT_NAME}`);
  const form = panel(page).getByRole("form", { name: "New assignment" });
  await form.getByRole("group", { name: "Type" }).getByRole("button", { name: "Workout" }).click();
  await form.getByLabel("Title", { exact: true }).fill("Journey leg day");
  await form.getByLabel("Details", { exact: true }).fill("Back Squat 5 x 5");
  await form.getByLabel("Date", { exact: true }).fill(today);
  await form.getByRole("button", { name: "Assign plan" }).click();
  await expect(panel(page).getByRole("list", { name: "Assignments" })).toContainText("Journey leg day", { timeout: 30_000 });

  // Home's Today's Tasks lists it now - while it is still Active (Done work drops off the list).
  await tab(page, "Home").click();
  await expect(panel(page).getByRole("region", { name: "Today's Tasks" })).toContainText("Workout due today: Journey leg day", {
    timeout: 30_000,
  });
});

test("6. the coach records a plan and a payment in Business", async () => {
  await page.goto("/app");
  await tab(page, "Business").click();
  await page.getByRole("button", { name: "Add a plan" }).click();
  const planForm = page.getByRole("form", { name: "Add a plan" });
  await planForm.getByLabel("Plan name").fill("Monthly coaching");
  await planForm.getByLabel(/^Price/).fill("4999");
  await planForm.getByLabel("Start date").fill(today);
  await planForm.getByRole("button", { name: "Add plan" }).click();
  await expect(planForm).toHaveCount(0, { timeout: 30_000 });

  const row = page.getByRole("list", { name: "Client plans" }).getByRole("listitem").filter({ hasText: CLIENT_NAME });
  await row.getByRole("button", { name: "Record payment" }).click();
  const payForm = page.getByRole("form", { name: `Record payment for ${CLIENT_NAME}` });
  await expect(payForm.getByLabel(/^Amount/)).toHaveValue("4999");
  await payForm.getByRole("button", { name: "Save payment" }).click();
  await expect(payForm).toHaveCount(0, { timeout: 30_000 });
  await expect(row).toContainText("Last payment");
});

test("7. the coach invites the client and gets a working invite link", async () => {
  await page.goto("/app");
  await tab(page, "Clients").click();
  await panel(page).getByRole("button", { name: `Client sign-in for ${CLIENT_NAME}` }).click();
  const invite = page.getByRole("region", { name: `Client sign-in for ${CLIENT_NAME}` });
  await invite.getByLabel("Client's email").fill(CLIENT_EMAIL);
  await invite.getByRole("button", { name: "Send invite" }).click();
  // No SMTP in CI, so the link is shown to the coach instead of emailed.
  const linkBox = invite.getByLabel(new RegExp(`Invite link for ${CLIENT_EMAIL}`, "i"));
  await expect(linkBox).toBeVisible({ timeout: 30_000 });
  inviteLink = await linkBox.inputValue();
  expect(inviteLink).toContain("/client/set-password?token=");
});

test("8. the client sets a password, signs in, and sees ONLY their own plan", async ({ browser }) => {
  // A separate browser context: the client must never ride on the coach's session.
  const clientContext = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await clientContext.newPage();
  const path = new URL(inviteLink).pathname + new URL(inviteLink).search;

  await page.goto(path);
  const setForm = page.getByRole("form", { name: "Choose your password" });
  await setForm.getByLabel("Password").fill("client-password-1");
  await setForm.getByRole("button", { name: "Set password" }).click();
  // The new password works only through a real sign-in, which is what this proves.
  await expect(page).toHaveURL(/\/client\/login/, { timeout: 30_000 });
  await page.getByLabel("Email").fill(CLIENT_EMAIL);
  await page.getByLabel("Password").fill("client-password-1");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/client\/?$/, { timeout: 30_000 });

  // Prompt 79: the client app opens on Today, with the workout the coach assigned for today.
  await expect(page.getByRole("heading", { level: 1, name: "Today" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("region", { name: "Today's plans" })).toContainText("Journey leg day", { timeout: 30_000 });
  // Their own plan, sessions and streaks live on the Me tab - and no coach UI anywhere.
  await page.goto("/client/me");
  await expect(page.getByRole("region", { name: "My plan" })).toContainText("Monthly coaching", { timeout: 30_000 });
  await expect(page.getByRole("region", { name: "My sessions" })).toBeVisible();
  await expect(page.getByRole("region", { name: "My streaks" })).toBeVisible();
  await expect(page.getByRole("tab")).toHaveCount(0);
  // No amounts and no other client's name are ever shown to a client.
  const text = await page.locator("body").innerText();
  expect(text).not.toContain("4999");
  expect(text).not.toContain("Engagement");

  // The client session cannot reach coach data.
  expect((await page.request.get("/api/clients")).status()).toBe(401);
  expect((await page.request.get("/api/reports/roster")).status()).toBe(401);
  await clientContext.close();
});

test("9. the coach marks the workout Done and files a weekly check-in", async () => {
  await page.goto("/app");
  await tab(page, "Manual Planner").click();
  const card = panel(page).getByRole("list", { name: "Assignments" }).getByRole("listitem").filter({ hasText: "Journey leg day" });
  const status = card.getByRole("group", { name: "Status" });
  await status.getByRole("button", { name: "Done" }).click();
  await expect(status.getByRole("button", { name: "Done" })).toHaveAttribute("aria-pressed", "true", { timeout: 30_000 });

  await tab(page, "Progress").click();
  const checkIn = panel(page).getByRole("form", { name: "Weekly check-in" });
  await checkIn.getByLabel("Date", { exact: true }).fill(today);
  await checkIn.getByLabel("Weight kg", { exact: true }).fill("70");
  await checkIn.getByLabel("Adherence %", { exact: true }).fill("85");
  await checkIn.getByLabel("Workouts done", { exact: true }).fill("3");
  await checkIn.getByRole("button", { name: "Add check-in" }).click();
  await expect(panel(page)).toContainText("70", { timeout: 30_000 });
});

test("10. the coach messages the client and the thread survives a reload", async () => {
  await page.goto("/app");
  await tab(page, "Messages").click();
  await page.getByRole("list", { name: "Clients" }).getByRole("button", { name: new RegExp(CLIENT_NAME.split(" ")[0]) }).click();
  const box = page.getByLabel(`Message to ${CLIENT_NAME}`);
  await box.fill("Welcome aboard - your first week is live.");
  await box.press("Enter");
  const pane = page.getByRole("region", { name: `Conversation with ${CLIENT_NAME}` });
  await expect(pane.locator('li[data-sender="coach"]')).toContainText("Welcome aboard", { timeout: 30_000 });

  await page.reload();
  await tab(page, "Messages").click();
  await page.getByRole("list", { name: "Clients" }).getByRole("button", { name: new RegExp(CLIENT_NAME.split(" ")[0]) }).click();
  await expect(page.getByRole("region", { name: `Conversation with ${CLIENT_NAME}` })).toContainText("Welcome aboard");
});

test("11. Home shows the coach the result: the check-in waits in the review queue, alerts render", async () => {
  await page.goto("/app");
  await tab(page, "Home").click();
  // Every new progress check-in waits in the review queue for the coach (Prompt 52).
  await expect(panel(page).getByRole("region", { name: "Review queue" })).toContainText(CLIENT_NAME, { timeout: 30_000 });
  // The smart-alerts card ("Needs attention") and Today's Tasks render from real data, not an error.
  await expect(panel(page).getByRole("region", { name: "Needs attention" })).toBeVisible();
  await expect(panel(page).getByRole("region", { name: "Today's Tasks" })).toBeVisible();
  await expect(panel(page).getByRole("alert")).toHaveCount(0);
});

test("12. the weekly summary generates (AI fallback) and a CSV really downloads", async () => {
  await page.goto("/app");
  await tab(page, "Home").click();
  const summary = panel(page).getByRole("region", { name: "AI weekly summary" });
  await summary.getByRole("button", { name: "Generate this week's summary" }).click();
  // With no AI key CI takes the fallback path: either way the card must end with real text, not an error.
  // AI or the facts fallback, the saved summary always ends with its "Week of ... saved" line.
  await expect(summary).toContainText("Week of", { timeout: 60_000 });

  await tab(page, "Business").click();
  await page.getByRole("group", { name: "Business view" }).getByRole("button", { name: "Reports" }).click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("group", { name: "CSV exports" }).getByRole("button", { name: "Progress logs" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.csv$/);
});

test("13. deleting the account removes the coach and everything they made", async () => {
  await page.goto("/app/account");
  await page.getByRole("button", { name: "Delete my account" }).click();
  const form = page.getByRole("form", { name: "Delete account" });
  await form.getByLabel("Your password").fill(COACH_PASSWORD);
  await form.getByLabel("Type DELETE to confirm").fill("DELETE");
  await form.getByRole("button", { name: "Delete my account" }).click();

  // Signed out, and the session is dead: the journey leaves no data behind.
  await expect(page).toHaveURL(/\/(login)?$/, { timeout: 30_000 });
  expect((await page.request.get("/api/clients")).status()).toBe(401);
  // The old password no longer signs in, because the coach is gone.
  const retry = await page.request.post("/api/auth/login", { data: { email: COACH_EMAIL, password: COACH_PASSWORD } });
  expect(retry.status()).toBe(401);
});
