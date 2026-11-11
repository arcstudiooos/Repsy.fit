// Prompt 36 full coach journey, in order, against a REAL server + database.
// CI runs it against the production build on a throwaway Postgres (no AI key, so the AI steps
// use the fallback path). The same file was also run against the live site with a one-off
// config whose baseURL is https://repsy-coach.onrender.com (no webServer).
// It creates 2 uniquely named clients and deletes both at the end; nothing else is touched.
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);

const stamp = Date.now().toString(36);
// Distinct first words: the client strip shows first names only.
const A = `JourneyA${stamp} Test`;
const B = `JourneyB${stamp} Test`;
let idA = "";
let idB = "";
let aiWorks = false;

const panel = (page: Page) => page.getByRole("tabpanel");
const strip = (page: Page) => page.getByRole("group", { name: "Select client" });

async function selectClient(page: Page, name: string) {
  await strip(page).getByRole("button", { name: new RegExp(`^${name.split(" ")[0]}\\b`) }).click();
  await expect(panel(page)).toContainText(`Selected: ${name}`);
}
async function counts(request: APIRequestContext, id: string) {
  const get = async (p: string) => (await request.get(`/api/clients/${id}/${p}`)).json();
  return { assignments: (await get("assignments")).length, progress: (await get("progress")).length, chat: (await get("chat")).length };
}

test.afterAll(async ({ request }) => {
  // Safety net if a step failed before the delete step.
  for (const id of [idA, idB]) if (id) await request.delete(`/api/clients/${id}`);
});

test("1. add client", async ({ page, request }) => {
  await page.goto("/app");
  await page.getByRole("tab", { name: "Clients" }).click();
  // Wait for the list (or the empty state) before deciding whether the form needs opening.
  await expect(panel(page)).toContainText(/\d+ clients?|No clients yet/, { timeout: 60_000 });
  for (const name of [B, A]) {
    const addButton = panel(page).getByRole("button", { name: "Add client", exact: true });
    if (await addButton.isVisible()) await addButton.click();
    const form = panel(page).getByRole("form", { name: "Add client" });
    await form.getByLabel("Name", { exact: true }).fill(name);
    await form.getByRole("button", { name: "Save client" }).click();
    await expect(form).toHaveCount(0, { timeout: 30_000 });
    await expect(panel(page)).toContainText(name);
  }
  const list = (await (await request.get("/api/clients")).json()) as { id: string; name: string }[];
  idA = list.find((c) => c.name === A)!.id;
  idB = list.find((c) => c.name === B)!.id;
  expect(idA && idB).toBeTruthy();
});

test("2. ask AI a question", async ({ page }) => {
  await page.goto("/app");
  await selectClient(page, A);
  await panel(page).getByRole("textbox", { name: "Ask the AI coach" }).fill("Make a workout plan for this week");
  await panel(page).getByRole("button", { name: "Send" }).click();
  const conversation = panel(page).getByRole("list", { name: "Conversation" });
  await expect(conversation.getByRole("listitem")).toHaveCount(2, { timeout: 90_000 });
  const reply = await conversation.getByRole("listitem").nth(1).innerText();
  aiWorks = !reply.includes(`Here's what I can see for ${A}`);
  test.info().annotations.push({ type: "AI", description: aiWorks ? "real AI answer" : "fallback answer (AI not configured or failing)" });
  expect(reply.length).toBeGreaterThan(20);
});

test("3. assign from the AI suggestion", async ({ page, request }) => {
  test.skip(!aiWorks, "No AI suggestion: the AI answered with the fallback, which never carries a suggestion.");
  await page.goto("/app");
  await selectClient(page, A);
  const card = panel(page).getByRole("region", { name: "AI suggestion" });
  if (!(await card.isVisible())) {
    await panel(page).getByRole("group", { name: "Quick prompts" }).getByRole("button", { name: "Make a workout plan" }).click();
  }
  await expect(card).toBeVisible({ timeout: 90_000 });
  await card.getByRole("button", { name: "Assign to client" }).click();
  await expect.poll(async () => (await counts(request, idA)).assignments, { timeout: 30_000 }).toBe(1);
});

test("4. auto-assign a Nutrition plan", async ({ page, request }) => {
  test.skip(!aiWorks, "Auto-assign needs a working AI; without it the app correctly shows 'Nothing was saved'.");
  const before = (await counts(request, idA)).assignments;
  await page.goto("/app");
  await selectClient(page, A);
  await panel(page).getByRole("group", { name: "Auto-assign" }).getByRole("button", { name: /Nutrition/ }).click();
  await expect(panel(page).getByRole("region", { name: "Auto-assigned plan" })).toBeVisible({ timeout: 90_000 });
  await expect.poll(async () => (await counts(request, idA)).assignments, { timeout: 30_000 }).toBe(before + 1);
});

test("5. manual Workout with exercise search, sets, reps and rest, then mark it Done", async ({ page, request }) => {
  await page.goto("/app");
  await page.getByRole("tab", { name: "Manual Planner" }).click();
  await selectClient(page, A);
  const form = panel(page).getByRole("form", { name: "New assignment" });
  await form.getByRole("button", { name: "Workout", exact: true }).click();
  await form.getByLabel("Title", { exact: true }).fill("Journey leg day");
  await form.getByLabel("Search exercises").fill("squat");
  await form.getByRole("list", { name: "Exercise results" }).getByRole("button").filter({ hasText: "Back Squat" }).first().click();
  await form.getByLabel("Sets for Back Squat").fill("4");
  await form.getByLabel("Reps for Back Squat").fill("6");
  await form.getByLabel("Rest seconds for Back Squat").fill("120");
  await form.getByRole("button", { name: "Assign plan" }).click();
  await expect(panel(page)).toContainText("1. Back Squat — 4 sets × 6 reps · Rest 120s", { timeout: 30_000 });

  // ...and mark it Done, on the same card.
  const card = panel(page).getByRole("list", { name: "Assignments" }).getByRole("listitem").filter({ hasText: "Journey leg day" });
  await card.getByRole("group", { name: "Status" }).getByRole("button", { name: "Done" }).click();
  await expect(card.getByRole("button", { name: "Done" })).toHaveAttribute("aria-pressed", "true");
  const list = (await (await request.get(`/api/clients/${idA}/assignments`)).json()) as { title: string; status: string }[];
  expect(list.find((a) => a.title === "Journey leg day")!.status).toBe("Done");
});

test("6. add two progress check-ins; the cards and all 3 charts update", async ({ page, request }) => {
  await page.goto("/app");
  await page.getByRole("tab", { name: "Progress" }).click();
  await selectClient(page, A);
  const form = panel(page).getByRole("form", { name: "Weekly check-in" });
  await form.getByLabel("Date", { exact: true }).fill("2026-11-02");
  await form.getByLabel("Weight kg", { exact: true }).fill("68.4");
  await form.getByRole("button", { name: "Add check-in" }).click();
  await expect(panel(page).getByRole("list", { name: "Check-ins" }).getByRole("listitem")).toHaveCount(1, { timeout: 30_000 });
  await form.getByLabel("Date", { exact: true }).fill("2026-11-09");
  await form.getByLabel("Weight kg", { exact: true }).fill("67.6");
  await form.getByRole("button", { name: "Add check-in" }).click();
  await expect(panel(page).getByRole("list", { name: "Check-ins" }).getByRole("listitem")).toHaveCount(2, { timeout: 30_000 });
  expect((await counts(request, idA)).progress).toBe(2);

  // The stat cards and all three charts follow the same two check-ins.
  await expect(panel(page).getByRole("group", { name: "Current weight" })).toContainText("67.6 kg");
  await expect(panel(page).getByRole("group", { name: "Current weight" })).toContainText("-0.8 kg overall");
  await expect(panel(page).getByRole("group", { name: "Average adherence" })).toContainText("85%");
  await expect(panel(page).getByRole("group", { name: "Total workouts" })).toContainText("8");
  await expect(panel(page).getByRole("figure", { name: "Weight" }).locator(".recharts-line-dots circle")).toHaveCount(2);
  await expect(panel(page).getByRole("figure", { name: "Adherence" }).locator(".recharts-line-curve")).toHaveCount(1);
  // At least the Done manual workout shows as a Workout bar with a non-zero label.
  const labels = await panel(page)
    .getByRole("figure", { name: "Assignments by type" })
    .locator(".recharts-label-list text")
    .evaluateAll((els) => els.map((e) => e.textContent ?? ""));
  expect(Number(labels[0])).toBeGreaterThanOrEqual(1);
});

test("7. switch client: zero data leakage", async ({ page, request }) => {
  expect(await counts(request, idB)).toEqual({ assignments: 0, progress: 0, chat: 0 });
  await page.goto("/app");
  await selectClient(page, B);
  await expect(panel(page)).not.toContainText("Make a workout plan for this week");
  await page.getByRole("tab", { name: "Manual Planner" }).click();
  await expect(panel(page)).toContainText(`Selected: ${B}`);
  await expect(panel(page)).not.toContainText("Journey leg day");
  await page.getByRole("tab", { name: "Progress" }).click();
  await expect(panel(page)).toContainText("No progress logged yet");
  await expect(panel(page).getByRole("group", { name: "Current weight" })).not.toContainText("67.6");
});

test("8. delete the test client and confirm cascade", async ({ page, request }) => {
  await page.goto("/app");
  await page.getByRole("tab", { name: "Clients" }).click();
  await panel(page).getByRole("button", { name: `Delete ${A}` }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await expect(panel(page)).not.toContainText(A, { timeout: 30_000 });
  for (const p of ["assignments", "progress", "chat"]) {
    const res = await request.get(`/api/clients/${idA}/${p}`);
    expect(res.status()).toBe(404);
  }
  expect(((await (await request.get("/api/clients")).json()) as { id: string }[]).some((c) => c.id === idA)).toBe(false);
  idA = "";
  expect((await request.delete(`/api/clients/${idB}`)).status()).toBe(204);
  idB = "";
});
