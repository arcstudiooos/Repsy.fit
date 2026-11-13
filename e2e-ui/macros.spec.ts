// Macro calculator in the Library tab (Prompt 61). Every /api call is mocked; the maths itself is covered by the
// server unit tests, so the fake /api/macros here just returns fixed numbers.
import { expect, test, type Page, openClientTab, openLibrary } from "./fixtures";

const DISCLAIMER = "Starting estimate for coaching only - not medical advice. Adjust from the client's real progress.";

const client = (id: string, name: string, over: Record<string, unknown> = {}) => ({
  id,
  coachId: null,
  name,
  goal: "Fat loss",
  age: 29,
  weightKg: 68,
  heightCm: 165,
  level: "Intermediate",
  focus: "",
  notes: "",
  createdAt: "2026-10-01T00:00:00.000Z",
  ...over,
});
const CLIENTS = [client("c-maya", "Maya Patel"), client("c-arjun", "Arjun Mehta", { goal: "Muscle gain", age: 31, weightKg: 82, heightCm: 180 })];

async function mock(page: Page) {
  const calls: string[] = [];
  await page.route("**/api/**", (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    const method = req.method();
    if (path === "/api/clients") return route.fulfill({ json: CLIENTS });
    if (path === "/api/review-queue") return route.fulfill({ json: { pendingCount: 0, items: [] } });
    if (path === "/api/templates" || path === "/api/meals") return route.fulfill({ json: [] });
    if (path === "/api/macros" && method === "POST") {
      calls.push(`MACROS ${JSON.stringify(req.postDataJSON())}`);
      return route.fulfill({ json: { bmr: 1405, tdee: 2178, calories: 1743, proteinG: 136, carbsG: 192, fatG: 48 } });
    }
    const asg = path.match(/^\/api\/clients\/([^/]+)\/assignments$/);
    if (asg && method === "POST") {
      const body = req.postDataJSON() as Record<string, unknown>;
      calls.push(`ASSIGN ${asg[1]} ${JSON.stringify(body)}`);
      return route.fulfill({
        status: 201,
        json: { id: "a1", coachId: "coach-test", clientId: asg[1], status: "Active", createdAt: "2026-11-11T09:00:00.000Z", ...body },
      });
    }
    if (/^\/api\/clients\/[^/]+\/habits$/.test(path)) return route.fulfill({ json: { date: "2026-11-11", days: [], habits: [] } });
    if (/^\/api\/clients\/[^/]+\/(assignments|checkins|measurements|progress)$/.test(path)) return route.fulfill({ json: [] });
    return route.fulfill({ status: 404, json: { error: "Not found" } });
  });
  return calls;
}

async function openCalculator(page: Page) {
  const calls = await mock(page);
  await page.goto("/app");
  await openLibrary(page);
  await expect(page.getByRole("heading", { level: 3, name: "Macro calculator" })).toBeVisible();
  return calls;
}

const fill = async (page: Page, over: Record<string, string> = {}) => {
  const v = { weight: "68", height: "165", age: "29", sex: "Female", activity: "Moderate", goal: "Fat loss", ...over };
  const form = page.getByRole("form", { name: "Macro calculator" });
  await form.getByLabel("Weight (kg)").fill(v.weight);
  await form.getByLabel("Height (cm)").fill(v.height);
  await form.getByLabel("Age").fill(v.age);
  await form.getByLabel("Sex").selectOption(v.sex);
  await form.getByLabel("Activity level").selectOption(v.activity);
  await form.getByLabel("Goal").fill(v.goal);
  return form;
};

test("under 18: the form stops with a plain message and calculates nothing", async ({ page }) => {
  const calls = await openCalculator(page);
  const form = await fill(page, { age: "17" });
  await form.getByRole("button", { name: "Calculate" }).click();
  await expect(form.getByRole("alert")).toHaveText("Macros are only calculated for adults aged 18 or older.");
  await expect(page.getByRole("region", { name: "Macro result" })).toHaveCount(0);
  expect(calls).toEqual([]);
});

test("calculates, shows calories / protein / carbs / fat and the exact disclaimer line", async ({ page }) => {
  const calls = await openCalculator(page);
  const form = await fill(page);
  await form.getByRole("button", { name: "Calculate" }).click();
  const result = page.getByRole("region", { name: "Macro result" });
  await expect(result).toContainText("1743 kcal");
  await expect(result).toContainText("Protein 136g · Carbs 192g · Fat 48g");
  await expect(result.getByText(DISCLAIMER, { exact: true })).toBeVisible();
  expect(calls).toEqual([
    `MACROS ${JSON.stringify({ weightKg: 68, heightCm: 165, age: 29, sex: "Female", activity: "Moderate", goal: "Fat loss" })}`,
  ]);

  // Changing an input makes the shown result stale, so it goes away.
  await form.getByLabel("Weight (kg)").fill("70");
  await expect(result).toHaveCount(0);
});

test("needs sex and activity before it calculates", async ({ page }) => {
  const calls = await openCalculator(page);
  const form = page.getByRole("form", { name: "Macro calculator" });
  await form.getByLabel("Weight (kg)").fill("68");
  await form.getByLabel("Height (cm)").fill("165");
  await form.getByLabel("Age").fill("29");
  await form.getByRole("button", { name: "Calculate" }).click();
  await expect(form.getByRole("alert")).toContainText("Choose Female or Male");
  expect(calls).toEqual([]);
});

test("Save as Nutrition assignment saves for the chosen client with the disclaimer in the reasoning", async ({ page }) => {
  const calls = await openCalculator(page);
  const form = page.getByRole("form", { name: "Macro calculator" });
  // Picking a client fills weight, height, age and goal from their record.
  await form.getByLabel("Client (optional)").selectOption({ label: "Arjun Mehta" });
  await expect(form.getByLabel("Weight (kg)")).toHaveValue("82");
  await expect(form.getByLabel("Goal")).toHaveValue("Muscle gain");
  await form.getByLabel("Sex").selectOption("Male");
  await form.getByLabel("Activity level").selectOption("Light");
  await form.getByRole("button", { name: "Calculate" }).click();

  const result = page.getByRole("region", { name: "Macro result" });
  await result.getByLabel("Date").fill("2026-12-01");
  await result.getByRole("button", { name: "Save as Nutrition assignment" }).click();
  await expect(result.getByRole("status")).toContainText("Saved for Arjun Mehta as a Nutrition plan.");

  const assign = calls.find((c) => c.startsWith("ASSIGN"))!;
  const [, clientId, json] = assign.match(/^ASSIGN (\S+) (.*)$/)!;
  expect(clientId).toBe("c-arjun");
  const body = JSON.parse(json) as Record<string, string>;
  expect(body).toMatchObject({
    type: "Nutrition",
    title: "Macro targets: 1743 kcal",
    details: "1743 kcal · Protein 136g · Carbs 192g · Fat 48g\nGoal: Muscle gain. Activity: Light.",
    source: "manual",
    date: "2026-12-01",
  });
  expect(body.reasoning).toContain(DISCLAIMER);
});

test("saving without a client asks for one and saves nothing", async ({ page }) => {
  const calls = await openCalculator(page);
  const form = await fill(page);
  await form.getByRole("button", { name: "Calculate" }).click();
  const result = page.getByRole("region", { name: "Macro result" });
  await result.getByRole("button", { name: "Save as Nutrition assignment" }).click();
  await expect(result.getByRole("alert")).toHaveText("Choose a client to save this for.");
  expect(calls.some((c) => c.startsWith("ASSIGN"))).toBe(false);
});

test("the one macro link (Plans, next to New plan) opens the calculator pre-filled with that client", async ({ page }) => {
  await mock(page);
  await page.goto("/app");
  // Progress and Check-ins no longer carry a duplicate link.
  for (const sub of ["Check-ins", "Progress"] as const) {
    await openClientTab(page, sub);
    await expect(page.getByRole("heading", { level: 2, name: sub })).toBeVisible();
    await expect(page.getByRole("button", { name: "Macro calculator for Maya Patel" })).toHaveCount(0);
  }
  await openClientTab(page, "Plans");
  await expect(page.getByRole("region", { name: "Selected client" })).toContainText("Maya Patel");
  await page.getByRole("button", { name: "Macro calculator for Maya Patel" }).click();

  const form = page.getByRole("form", { name: "Macro calculator" });
  await expect(form.getByLabel("Client (optional)")).toHaveValue("c-maya");
  await expect(form.getByLabel("Weight (kg)")).toHaveValue("68");
  await expect(form.getByLabel("Height (cm)")).toHaveValue("165");
  await expect(form.getByLabel("Age")).toHaveValue("29");
  await expect(form.getByLabel("Goal")).toHaveValue("Fat loss");

  // The pre-fill is used once: leaving and coming back starts empty.
  await page.getByRole("tab", { name: "Clients" }).click();
  await openLibrary(page);
  await expect(page.getByRole("form", { name: "Macro calculator" }).getByLabel("Weight (kg)")).toHaveValue("");
});
