// Onboarding automation (Inspo C8, Nov 2026): the Account settings and the per-client nudge.
//
// The copy is part of the feature here. The client app cannot fill in forms yet, so every string
// must say the COACH fills it in - a UI that implies a client was sent a form is a lie the coach
// only discovers when they ask why it is not back.
import { expect, test, type Page, type Route, emptyApi, openClientTab } from "./fixtures";

const CLIENTS = [
  { id: "c-maya", coachId: null, name: "Maya Patel", goal: "Strength", age: 29, weightKg: 68, heightCm: 165, level: "Intermediate", focus: "", notes: "", createdAt: "2026-10-01T00:00:00.000Z" },
];

const FORMS = [
  { id: "frm_client_intake", name: "Client intake", description: "", questions: [], active: true, sample: true, createdAt: "2026-11-01T00:00:00.000Z", submissionCount: 0 },
  { id: "f1", name: "My own intake", description: "", questions: [], active: true, sample: false, createdAt: "2026-11-10T00:00:00.000Z", submissionCount: 0 },
];

/** Mocks everything, with the coach and intake state the test cares about. */
async function setup(
  page: Page,
  opts: { coach?: Record<string, unknown>; intake?: unknown; forms?: unknown[] } = {},
) {
  const patched: Record<string, unknown>[] = [];
  const coach = {
    id: "coach-test",
    name: "Test Coach",
    email: "coach@example.com",
    createdAt: "2026-10-01T00:00:00.000Z",
    currency: "INR",
    units: "kg",
    country: "IN",
    welcomeMessage: "",
    intakeFormId: null,
    ...opts.coach,
  };

  await page.route("**/api/**", (route: Route) =>
    route.fulfill({ status: 200, json: emptyApi(new URL(route.request().url()).pathname) }),
  );
  await page.route("**/api/clients", (route: Route) => route.fulfill({ status: 200, json: CLIENTS }));
  await page.route("**/api/forms**", (route: Route) => route.fulfill({ status: 200, json: opts.forms ?? FORMS }));
  await page.route("**/api/clients/c-maya/intake", (route: Route) =>
    route.fulfill({ status: 200, json: opts.intake ?? { form: null, doneAt: null } }),
  );
  await page.route("**/api/auth/me", (route: Route) => route.fulfill({ status: 200, json: coach }));
  await page.route("**/api/auth/profile", (route: Route) => {
    patched.push(route.request().postDataJSON() as Record<string, unknown>);
    return route.fulfill({ status: 200, json: coach });
  });

  await page.goto("/app");
  return { patched };
}

const openAccount = async (page: Page) => {
  await page.getByRole("button", { name: /Account menu/ }).click();
  await page.getByRole("menuitem", { name: /Account/ }).click();
  await expect(page.getByRole("form", { name: "What a new client gets" })).toBeVisible();
};

test("the settings say plainly who fills the intake form in", async ({ page }) => {
  await setup(page);
  await openAccount(page);
  const form = page.getByRole("form", { name: "What a new client gets" });
  // The client app cannot do forms yet. The copy must not imply otherwise.
  await expect(form).toContainText("You fill it in with them");
  await expect(form).toContainText("they are not sent anything");
});

test("a welcome message saves, trimmed", async ({ page }) => {
  const { patched } = await setup(page);
  await openAccount(page);
  const form = page.getByRole("form", { name: "What a new client gets" });
  await form.getByLabel("Welcome message").fill("  Welcome aboard!  ");
  await form.getByRole("button", { name: "Save" }).click();
  await expect.poll(() => patched.length).toBe(1);
  expect(patched[0]).toMatchObject({ welcomeMessage: "Welcome aboard!" });
});

test("it says the message is optional, and shows how much room is left", async ({ page }) => {
  await setup(page);
  await openAccount(page);
  const form = page.getByRole("form", { name: "What a new client gets" });
  await expect(form).toContainText("Leave it empty to send nothing");
  await form.getByLabel("Welcome message").fill("Hello");
  await expect(form).toContainText("5 of 1000 characters");
});

test("the coach picks an intake form from their own and Repsy's", async ({ page }) => {
  const { patched } = await setup(page);
  await openAccount(page);
  const form = page.getByRole("form", { name: "What a new client gets" });
  const options = await form.getByLabel("Intake form").locator("option").allTextContents();
  expect(options).toContain("No intake form");
  expect(options).toContain("Client intake (Repsy)");
  expect(options).toContain("My own intake");
  await form.getByLabel("Intake form").selectOption("f1");
  await form.getByRole("button", { name: "Save" }).click();
  await expect.poll(() => patched.length).toBe(1);
  expect(patched[0]).toMatchObject({ intakeFormId: "f1" });
});

test("choosing none sends null, not an empty string", async ({ page }) => {
  const { patched } = await setup(page, { coach: { intakeFormId: "f1" } });
  await openAccount(page);
  const form = page.getByRole("form", { name: "What a new client gets" });
  await form.getByLabel("Intake form").selectOption("");
  await form.getByRole("button", { name: "Save" }).click();
  await expect.poll(() => patched.length).toBe(1);
  expect(patched[0].intakeFormId).toBeNull();
});

test("with no forms built, it points at where to build one", async ({ page }) => {
  await setup(page, { forms: [] });
  await openAccount(page);
  await expect(page.getByText(/Build a form under Business/)).toBeVisible();
});

test("a client with intake outstanding is nudged, with the question count", async ({ page }) => {
  await setup(page, { intake: { form: { id: "f1", name: "Client intake", questionCount: 10 }, doneAt: null } });
  await openClientTab(page, "Check-ins");
  const nudge = page.getByRole("region", { name: "Intake form" });
  await expect(nudge).toContainText("Intake not done yet");
  await expect(nudge).toContainText("Client intake");
  await expect(nudge).toContainText("10 questions");
  // Again: the coach fills it in.
  await expect(nudge).toContainText("they are\nnot sent anything".replace("\n", " "));
});

test("once done the nudge becomes a quiet line, not a banner", async ({ page }) => {
  await setup(page, {
    intake: { form: { id: "f1", name: "Client intake", questionCount: 10 }, doneAt: "2026-11-12T00:00:00.000Z" },
  });
  await openClientTab(page, "Check-ins");
  // A permanent banner is wallpaper, and wallpaper is ignored.
  await expect(page.getByRole("region", { name: "Intake form" })).toHaveCount(0);
  await expect(page.getByText(/was filled in on 12\/11\/2026/)).toBeVisible();
});

test("a coach who chose no intake form sees nothing at all", async ({ page }) => {
  await setup(page, { intake: { form: null, doneAt: null } });
  await openClientTab(page, "Check-ins");
  await expect(page.getByRole("region", { name: "Intake form" })).toHaveCount(0);
  await expect(page.getByText(/Intake/)).toHaveCount(0);
});

test("a failed nudge lookup stays silent instead of looking broken", async ({ page }) => {
  await setup(page);
  await page.route("**/api/clients/c-maya/intake", (route: Route) =>
    route.fulfill({ status: 500, json: { error: "nope" } }),
  );
  await openClientTab(page, "Check-ins");
  await expect(page.getByRole("region", { name: "Habit tracker" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Intake form" })).toHaveCount(0);
});
