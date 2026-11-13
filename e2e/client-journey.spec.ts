// Prompt 85: the client app journey against a REAL server and database, in order.
// A brand-new coach -> join code -> a client joins with email -> welcome -> the coach assigns a workout ->
// the client finishes it with effort -> the coach sees "Done by client" -> messages both ways -> the client's
// weekly check-in reaches the coach's review queue -> the client deletes their account -> the coach no longer
// sees them. The last step deletes the coach too, so the database is left as it was found.
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { clientHeader, openClientTab, openNewPlanForm } from "./nav";

test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);

let coachCtx: BrowserContext;
let clientCtx: BrowserContext;
let coach: Page;
let client: Page;

test.beforeAll(async ({ browser }) => {
  // Two separate browsers-worth of cookies: the client never rides on the coach's session (or vice versa).
  coachCtx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  clientCtx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  coach = await coachCtx.newPage();
  client = await clientCtx.newPage();
});

test.afterAll(async () => {
  // If a step failed, the cleanup step never ran: delete the coach (cascades to the client) anyway.
  await coachCtx?.request.delete("/api/auth/account", { data: { password: COACH_PASSWORD, confirm: "DELETE" } }).catch(() => {});
  await coachCtx?.close();
  await clientCtx?.close();
});

const stamp = Date.now().toString(36);
const COACH_NAME = `Cj Coach ${stamp}`;
const COACH_EMAIL = `client-journey-coach-${stamp}@example.com`;
const COACH_PASSWORD = "journey-password-1";
const CLIENT_NAME = `Cj${stamp} Client`;
const CLIENT_EMAIL = `client-journey-${stamp}@example.com`;
const CLIENT_PASSWORD = "client-password-12";
const WORKOUT = `Cj leg day ${stamp}`;
const today = new Date().toLocaleDateString("en-CA");
let joinPath = "";

const panel = (p: Page) => p.getByRole("tabpanel").first();
const tab = (p: Page, name: string) => p.getByRole("tab", { name });

test("1. a new coach registers and reads their join code", async () => {
  await coach.goto("/register");
  const form = coach.getByRole("form", { name: "Create account" });
  await form.getByLabel("Name").fill(COACH_NAME);
  await form.getByLabel("Email").fill(COACH_EMAIL);
  await form.getByLabel("Password", { exact: true }).fill(COACH_PASSWORD);
  await form.getByRole("button", { name: "Create account" }).click();
  await expect(coach).toHaveURL(/\/app/, { timeout: 30_000 });

  await tab(coach, "Clients").click();
  const invite = coach.getByRole("region", { name: "Invite clients" });
  // The join link sits behind the "Invite settings" disclosure.
  await invite.getByText("Invite settings").click();
  const link = invite.getByLabel("Join link", { exact: true });
  await expect(link).toHaveValue(/\/join\/[A-Z0-9]+-[A-Z0-9]{6}$/, { timeout: 30_000 });
  // Without APP_URL (CI) the link is a path; on a real deploy it's a full URL.
  const value = await link.inputValue();
  joinPath = value.startsWith("/") ? value : new URL(value).pathname;
});

test("2. a client joins with email, answers the welcome questions and lands on Today", async () => {
  await client.goto(joinPath);
  await expect(client.getByRole("heading", { level: 1, name: `Join ${COACH_NAME}'s coaching` })).toBeVisible({ timeout: 30_000 });
  await client.getByLabel("Your name").fill(CLIENT_NAME);
  await client.getByLabel("Email").fill(CLIENT_EMAIL);
  await client.getByLabel(/^Password/).fill(CLIENT_PASSWORD);
  await client.getByRole("button", { name: "Create account" }).click();

  await expect(client.getByRole("heading", { level: 1, name: "A few quick questions" })).toBeVisible({ timeout: 30_000 });
  await client.getByLabel("Your main goal").selectOption("Muscle gain");
  await client.getByLabel("Age").fill("29");
  await client.getByLabel("Training experience").selectOption("Beginner");
  await client.getByRole("button", { name: "Save and continue" }).click();
  await expect(client.getByRole("heading", { level: 1, name: "Today" })).toBeVisible({ timeout: 30_000 });
  await expect(client).toHaveURL(/\/client\/?$/);
});

test("3. the coach sees the new client (joined with code) and assigns today's workout", async () => {
  await coach.goto("/app");
  await tab(coach, "Clients").click();
  await expect(panel(coach)).toContainText(CLIENT_NAME, { timeout: 30_000 });
  await expect(panel(coach)).toContainText("Joined with code");

  await openClientTab(coach, "Plans", CLIENT_NAME);
  await expect(clientHeader(coach)).toContainText(CLIENT_NAME);
  const form = await openNewPlanForm(coach);
  await form.getByRole("group", { name: "Type" }).getByRole("button", { name: "Workout" }).click();
  await form.getByLabel("Title", { exact: true }).fill(WORKOUT);
  await form.getByLabel("Details", { exact: true }).fill("1. Back Squat — 3 sets × 5 reps · Rest 90s");
  await form.getByLabel("Date", { exact: true }).fill(today);
  await form.getByRole("button", { name: "Assign plan" }).click();
  await expect(panel(coach).getByRole("list", { name: "Assignments" })).toContainText(WORKOUT, { timeout: 30_000 });
});

test("4. the client opens Today, finishes the workout with effort and a note", async () => {
  await client.goto("/client");
  const plans = client.getByRole("region", { name: "Today's plans" });
  await plans.getByRole("link", { name: new RegExp(WORKOUT) }).click({ timeout: 30_000 });
  await client.getByRole("button", { name: "Finish workout" }).click();
  const form = client.getByRole("form", { name: "Finish workout" });
  await form.locator("label").filter({ hasText: /^8$/ }).click();
  await form.getByLabel("Note for your coach (optional)").fill("Felt strong");
  await form.getByRole("button", { name: "Save as done" }).click();
  await expect(client.getByRole("region", { name: "Finished" })).toContainText("Effort 8/10", { timeout: 30_000 });
});

test("5. the coach sees Done by client with the effort and note, and a Home alert", async () => {
  await coach.goto("/app");
  await openClientTab(coach, "Plans", CLIENT_NAME);
  const card = panel(coach).getByRole("list", { name: "Assignments" }).getByRole("listitem").filter({ hasText: WORKOUT });
  await expect(card).toContainText("Done by client", { timeout: 30_000 });
  await expect(card).toContainText("Effort 8/10");
  await expect(card).toContainText("Felt strong");
  await tab(coach, "Home").click();
  await expect(panel(coach).getByRole("list", { name: "Client alerts" })).toContainText(`${CLIENT_NAME} finished ${WORKOUT}`, { timeout: 30_000 });
});

test("6. messages both ways: client -> coach -> client", async () => {
  await client.goto("/client/messages");
  const box = client.getByLabel(`Message to ${COACH_NAME}`);
  await box.fill("Thanks coach, legs are sore!");
  await box.press("Enter");
  await expect(client.getByRole("list", { name: "Messages" })).toContainText("legs are sore", { timeout: 30_000 });

  await coach.goto("/app");
  await tab(coach, "Home").click();
  await panel(coach).getByRole("list", { name: "Client alerts" }).getByRole("button", { name: new RegExp(`${CLIENT_NAME} sent 1 new message`) }).click({ timeout: 30_000 });
  const pane = coach.getByRole("region", { name: `Conversation with ${CLIENT_NAME}` });
  await expect(pane).toContainText("legs are sore", { timeout: 30_000 });
  const reply = coach.getByLabel(`Message to ${CLIENT_NAME}`);
  await reply.fill("Great work - stretch tonight.");
  await reply.press("Enter");
  await expect(pane.locator('li[data-sender="coach"]')).toContainText("stretch tonight", { timeout: 30_000 });

  await client.goto("/client");
  await expect(client.getByRole("navigation", { name: "Client app", exact: true }).getByRole("link", { name: /Messages.*1 unread/ })).toBeVisible({ timeout: 30_000 });
  await client.goto("/client/messages");
  await expect(client.getByRole("list", { name: "Messages" })).toContainText("stretch tonight", { timeout: 30_000 });
});

test("7. the client's weekly check-in lands in the coach's review queue", async () => {
  await client.goto("/client/weekly");
  await client.getByLabel("Weight (kg)").fill("71.5");
  await client.getByLabel("Plan followed (%)").fill("90");
  await client.getByLabel("Workouts done").fill("1");
  await client.getByRole("button", { name: "Send to my coach" }).click();
  await expect(client.getByRole("status")).toHaveText("Sent to your coach. Thanks!", { timeout: 30_000 });

  await coach.goto("/app");
  await tab(coach, "Home").click();
  await expect(panel(coach).getByRole("region", { name: "Review queue" })).toContainText(CLIENT_NAME, { timeout: 30_000 });
});

test("8. the client deletes their account; the coach no longer sees them", async () => {
  await client.goto("/client/me");
  await client.getByRole("button", { name: "Delete my account..." }).click();
  const form = client.getByRole("form", { name: "Delete my account" });
  await form.getByLabel("Your password").fill(CLIENT_PASSWORD);
  await form.getByLabel("Type DELETE to confirm").fill("DELETE");
  await form.getByRole("button", { name: "Delete my account forever" }).click();
  await expect(client).toHaveURL(/\/client\/login\?deleted=1$/, { timeout: 30_000 });
  expect((await client.request.get("/api/client-auth/me")).status()).toBe(401);
  const relogin = await client.request.post("/api/client-auth/login", { data: { email: CLIENT_EMAIL, password: CLIENT_PASSWORD } });
  expect(relogin.status()).toBe(401);

  const list = await coach.request.get("/api/clients");
  expect(list.status()).toBe(200);
  expect(JSON.stringify(await list.json())).not.toContain(CLIENT_NAME);
  await coach.goto("/app");
  await tab(coach, "Clients").click();
  await expect(panel(coach)).toContainText(/Add your first client|No clients yet/, { timeout: 30_000 });
  await expect(panel(coach)).not.toContainText(CLIENT_NAME);
});

test("9. cleanup: the coach deletes their account", async () => {
  await coach.goto("/app/account");
  await coach.getByRole("button", { name: "Delete my account" }).click();
  const form = coach.getByRole("form", { name: "Delete account" });
  await form.getByLabel("Your password").fill(COACH_PASSWORD);
  await form.getByLabel("Type DELETE to confirm").fill("DELETE");
  await form.getByRole("button", { name: "Delete my account" }).click();
  await expect(coach).toHaveURL(/\/(login)?$/, { timeout: 30_000 });
  expect((await coach.request.get("/api/clients")).status()).toBe(401);
});
