// Sets, reps and rest per selected exercise in the Manual Planner form (Prompt 22). Every /api
// call is mocked in the browser, so these run without a database.
import { expect, test, type Page, type Route, openClientTab } from "./fixtures";

const CLIENTS = [
  {
    id: "c-maya",
    coachId: null,
    name: "Maya Patel",
    goal: "Fat loss + strength",
    age: 29,
    weightKg: 68,
    heightCm: 165,
    level: "Intermediate",
    focus: "",
    notes: "",
    createdAt: "2026-10-01T00:00:00.000Z",
  },
];

async function mockApi(page: Page) {
  await page.route("**/api/**", async (route: Route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (req.method() === "GET" && path === "/api/clients") return route.fulfill({ json: CLIENTS });
    if (req.method() === "GET" && /^\/api\/clients\/[^/]+\/chat$/.test(path)) return route.fulfill({ json: [] });
    if (req.method() === "GET" && /^\/api\/clients\/[^/]+\/assignments$/.test(path)) return route.fulfill({ json: [] });
    return route.fulfill({ status: 404, json: { error: "Not found" } });
  });
}

const form = (page: Page) => page.getByRole("tabpanel").first().getByRole("form", { name: "New assignment" });
const typeButton = (page: Page, type: string) => form(page).getByRole("group", { name: "Type" }).getByRole("button", { name: type });
const search = (page: Page) => form(page).getByLabel("Search exercises");
const results = (page: Page) => form(page).getByRole("list", { name: "Exercise results" });
const rows = (page: Page) => form(page).getByRole("list", { name: "Selected exercises" }).getByRole("listitem");
const row = (page: Page, name: string) => rows(page).filter({ hasText: name });
const sets = (page: Page, name: string) => form(page).getByLabel(`Sets for ${name}`);
const reps = (page: Page, name: string) => form(page).getByLabel(`Reps for ${name}`);
const rest = (page: Page, name: string) => form(page).getByLabel(`Rest seconds for ${name}`);
const quickPick = (page: Page, name: string, seconds: number) =>
  form(page).getByRole("group", { name: `Rest quick picks for ${name}` }).getByRole("button", { name: `${seconds}s` });

async function openPlanner(page: Page) {
  await page.goto("/app");
  await openClientTab(page, "Plans");
}

async function add(page: Page, query: string, name: string) {
  await search(page).fill(query);
  await results(page).getByRole("button").filter({ hasText: name }).first().click();
}

async function expectDose(page: Page, name: string, dose: { sets: string; reps: string; rest: string }) {
  await expect(sets(page, name)).toHaveValue(dose.sets);
  await expect(reps(page, name)).toHaveValue(dose.reps);
  await expect(rest(page, name)).toHaveValue(dose.rest);
}

test("a new row gets the default dose: 3 sets, 10 reps, 60s rest", async ({ page }) => {
  await mockApi(page);
  await openPlanner(page);
  await add(page, "squat", "Back Squat");
  await expect(rows(page)).toHaveCount(1);
  await expectDose(page, "Back Squat", { sets: "3", reps: "10", rest: "60" });
  await expect(quickPick(page, "Back Squat", 60)).toHaveAttribute("aria-pressed", "true");
  for (const s of [30, 90, 120]) await expect(quickPick(page, "Back Squat", s)).toHaveAttribute("aria-pressed", "false");
  await expect(row(page, "Back Squat").getByRole("button", { name: "Remove Back Squat" })).toBeVisible();
});

test("Back Squat 4 x 6 with 120s quick-pick rest; Plank reps '45 sec'; remove and reorder keep each dose", async ({ page }) => {
  await mockApi(page);
  await openPlanner(page);
  await add(page, "squat", "Back Squat");
  await sets(page, "Back Squat").fill("4");
  await reps(page, "Back Squat").fill("6");
  await quickPick(page, "Back Squat", 120).click();
  await expectDose(page, "Back Squat", { sets: "4", reps: "6", rest: "120" });
  await expect(quickPick(page, "Back Squat", 120)).toHaveAttribute("aria-pressed", "true");

  await add(page, "plank", "Plank");
  await reps(page, "Plank").fill("45 sec");
  await add(page, "deadlift", "Romanian Deadlift");
  await reps(page, "Romanian Deadlift").fill("AMRAP");
  await quickPick(page, "Romanian Deadlift", 30).click();

  await expect(rows(page).nth(0)).toContainText("Back Squat");
  await expect(rows(page).nth(1)).toContainText("Plank");
  await expect(rows(page).nth(2)).toContainText("Romanian Deadlift");

  // Move Plank to the top, then Back Squat down to the bottom.
  await form(page).getByRole("button", { name: "Move Plank up" }).click();
  await expect(rows(page).nth(0)).toContainText("Plank");
  await expect(rows(page).nth(1)).toContainText("Back Squat");
  await form(page).getByRole("button", { name: "Move Back Squat down" }).click();
  await expect(rows(page).nth(1)).toContainText("Romanian Deadlift");
  await expect(rows(page).nth(2)).toContainText("Back Squat");
  // Ends cannot move further.
  await expect(form(page).getByRole("button", { name: "Move Plank up" })).toBeDisabled();
  await expect(form(page).getByRole("button", { name: "Move Back Squat down" })).toBeDisabled();

  await expectDose(page, "Plank", { sets: "3", reps: "45 sec", rest: "60" });
  await expectDose(page, "Back Squat", { sets: "4", reps: "6", rest: "120" });
  await expectDose(page, "Romanian Deadlift", { sets: "3", reps: "AMRAP", rest: "30" });

  // Remove the middle row; the others keep their doses.
  await row(page, "Romanian Deadlift").getByRole("button", { name: "Remove Romanian Deadlift" }).click();
  await expect(rows(page)).toHaveCount(2);
  await expect(rows(page).nth(0)).toContainText("Plank");
  await expect(rows(page).nth(1)).toContainText("Back Squat");
  await expectDose(page, "Plank", { sets: "3", reps: "45 sec", rest: "60" });
  await expectDose(page, "Back Squat", { sets: "4", reps: "6", rest: "120" });
});

test("rest number input accepts typed seconds and quick-pick follows it", async ({ page }) => {
  await mockApi(page);
  await openPlanner(page);
  await add(page, "squat", "Back Squat");
  await rest(page, "Back Squat").fill("90");
  await expect(quickPick(page, "Back Squat", 90)).toHaveAttribute("aria-pressed", "true");
  await rest(page, "Back Squat").fill("45");
  for (const s of [30, 60, 90, 120]) await expect(quickPick(page, "Back Squat", s)).toHaveAttribute("aria-pressed", "false");
  await quickPick(page, "Back Squat", 30).click();
  await expect(rest(page, "Back Squat")).toHaveValue("30");
});

test("invalid numbers are corrected: sets to 1..10, rest to at least 6 seconds", async ({ page }) => {
  await mockApi(page);
  await openPlanner(page);
  await add(page, "squat", "Back Squat");

  await sets(page, "Back Squat").fill("0");
  await sets(page, "Back Squat").blur();
  await expect(sets(page, "Back Squat")).toHaveValue("1");
  await sets(page, "Back Squat").fill("-3");
  await sets(page, "Back Squat").blur();
  await expect(sets(page, "Back Squat")).toHaveValue("1");
  await sets(page, "Back Squat").fill("25");
  await sets(page, "Back Squat").blur();
  await expect(sets(page, "Back Squat")).toHaveValue("10");

  await rest(page, "Back Squat").fill("-20");
  await rest(page, "Back Squat").blur();
  await expect(rest(page, "Back Squat")).toHaveValue("6");
});

test("rows show only for Workout and survive switching type away and back", async ({ page }) => {
  await mockApi(page);
  await openPlanner(page);
  await add(page, "squat", "Back Squat");
  await sets(page, "Back Squat").fill("5");
  await quickPick(page, "Back Squat", 90).click();
  await add(page, "plank", "Plank");
  await reps(page, "Plank").fill("30 sec");

  for (const type of ["Nutrition", "Habit", "Recovery"]) {
    await typeButton(page, type).click();
    await expect(form(page).getByRole("list", { name: "Selected exercises" })).toHaveCount(0);
  }
  await typeButton(page, "Workout").click();
  await expect(rows(page)).toHaveCount(2);
  await expectDose(page, "Back Squat", { sets: "5", reps: "10", rest: "90" });
  await expectDose(page, "Plank", { sets: "3", reps: "30 sec", rest: "60" });
});
