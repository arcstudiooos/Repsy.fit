// Diet type and alternative meals (Inspo N3/N8, Nov 2026) in the meal library.
//
// Reuses meals.spec.ts's fake server shape. What matters here: the diet filter still shows meals
// that suit everyone, and an alternative is a suggestion a coach picks, never a constraint.
import { expect, test, type Page, emptyApi, openLibrary } from "./fixtures";

const client = (id: string, name: string) => ({
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
});
const CLIENTS = [client("c-maya", "Maya Patel")];

type M = Record<string, unknown> & { id: string; name: string };
const meal = (id: string, name: string, over: Partial<M> = {}): M => ({
  id,
  coachId: "coach-test",
  name,
  mealType: "Lunch",
  calories: 450,
  proteinG: 30,
  carbsG: 45,
  fatG: 15,
  fiberG: 0,
  ingredients: "",
  steps: "",
  dietType: "Any",
  swapIds: [],
  createdAt: "2026-11-11T08:00:00.000Z",
  ...over,
});

async function openMeals(page: Page, initial: M[]) {
  const meals = [...initial];
  const calls: { method: string; id?: string; body: Record<string, unknown> }[] = [];
  await page.route("**/api/**", (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    const method = req.method();
    if (path === "/api/clients") return route.fulfill({ json: CLIENTS });
    if (path === "/api/review-queue") return route.fulfill({ json: { pendingCount: 0, items: [] } });
    if (path === "/api/templates") return route.fulfill({ json: [] });
    if (path === "/api/meals") {
      if (method === "POST") {
        const body = req.postDataJSON() as Record<string, unknown>;
        calls.push({ method: "POST", body });
        const created = meal(`m${meals.length + 10}`, String(body.name ?? ""), body);
        meals.push(created);
        return route.fulfill({ status: 201, json: created });
      }
      return route.fulfill({ json: [...meals].sort((a, b) => a.name.localeCompare(b.name)) });
    }
    const one = path.match(/^\/api\/meals\/([^/]+)$/);
    if (one && method === "PUT") {
      const body = req.postDataJSON() as Record<string, unknown>;
      calls.push({ method: "PUT", id: one[1], body });
      const i = meals.findIndex((x) => x.id === one[1]);
      meals[i] = { ...meals[i], ...body } as M;
      return route.fulfill({ json: meals[i] });
    }
    // emptyApi gives each endpoint its real empty SHAPE: a blanket [] breaks the app shell.
    return route.fulfill({ status: 200, json: emptyApi(path) });
  });

  await page.goto("/app");
  await openLibrary(page, "Meals");
  await expect(page.getByRole("heading", { level: 3, name: "Meal library" })).toBeVisible();
  return { calls };
}

const PANEER = meal("m1", "Paneer bhurji", { dietType: "Vegetarian" });
const CHICKEN = meal("m2", "Chicken curry", { dietType: "Non-vegetarian" });
const RICE = meal("m3", "Rice and dal", { dietType: "Any" });

test("a meal says which diet it suits", async ({ page }) => {
  await openMeals(page, [PANEER, CHICKEN]);
  // Scoped to the card: "Vegetarian" also appears as a hidden <option> in the diet filter.
  const card = page.getByRole("listitem").filter({ hasText: "Paneer bhurji" });
  await expect(card).toContainText("Vegetarian");
  // An "Any" meal carries no diet chip, because that is the normal case.
  await openMeals(page, [RICE]);
  await expect(page.getByRole("listitem").filter({ hasText: "Rice and dal" })).not.toContainText("Any");
});

test("filtering by diet still shows the meals that suit everyone", async ({ page }) => {
  // "Any" is not a diet: a vegetarian can eat rice and dal, so hiding it would be wrong.
  await openMeals(page, [PANEER, CHICKEN, RICE]);
  await page.getByLabel("Diet").selectOption("Vegetarian");
  await expect(page.getByRole("heading", { name: "Paneer bhurji" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Rice and dal" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Chicken curry" })).toHaveCount(0);
});

test("the diet filter offers the diets that matter in India", async ({ page }) => {
  await openMeals(page, [PANEER]);
  const options = await page.getByLabel("Diet").locator("option").allTextContents();
  for (const d of ["Vegetarian", "Eggetarian", "Vegan", "Jain", "Halal", "Non-vegetarian"]) {
    expect(options, d).toContain(d);
  }
  // "Any" is the default on a meal, not something to filter BY.
  expect(options).not.toContain("Any");
});

test("a new meal is saved as suiting any diet unless the coach says otherwise", async ({ page }) => {
  const { calls } = await openMeals(page, []);
  await page.getByRole("button", { name: "New meal" }).click();
  await page.getByLabel("Name").fill("Oats");
  await page.getByLabel("Calories").fill("300");
  await page.getByLabel("Protein (g)").fill("10");
  await page.getByLabel("Carbs (g)").fill("50");
  await page.getByLabel("Fat (g)").fill("5");
  await page.getByRole("button", { name: /Save meal|Add meal/ }).click();
  await expect.poll(() => calls.length).toBeGreaterThan(0);
  expect(calls[0].body.dietType).toBe("Any");
  expect(calls[0].body.swapIds).toEqual([]);
});

test("a coach picks the diet a meal suits", async ({ page }) => {
  const { calls } = await openMeals(page, []);
  await page.getByRole("button", { name: "New meal" }).click();
  await page.getByLabel("Name").fill("Jain thali");
  await page.getByLabel("Calories").fill("500");
  await page.getByLabel("Protein (g)").fill("15");
  await page.getByLabel("Carbs (g)").fill("70");
  await page.getByLabel("Fat (g)").fill("12");
  await page.getByLabel("Suits which diet").selectOption("Jain");
  await page.getByRole("button", { name: /Save meal|Add meal/ }).click();
  await expect.poll(() => calls.length).toBeGreaterThan(0);
  expect(calls[0].body.dietType).toBe("Jain");
});

test("alternatives are offered only once there is something to swap for", async ({ page }) => {
  await openMeals(page, []);
  await page.getByRole("button", { name: "New meal" }).click();
  // Nothing in the library yet, so the picker would be an empty box.
  await expect(page.getByRole("group", { name: "Can be swapped for" })).toHaveCount(0);
});

test("a meal can be swapped for others the coach picks", async ({ page }) => {
  const { calls } = await openMeals(page, [PANEER, CHICKEN, RICE]);
  await page.getByRole("button", { name: "Edit Paneer bhurji" }).click();
  const group = page.getByRole("group", { name: "Can be swapped for" });
  // The meal itself is never offered as its own alternative.
  await expect(group.getByRole("button", { name: "Paneer bhurji" })).toHaveCount(0);
  await group.getByRole("button", { name: "Chicken curry" }).click();
  await group.getByRole("button", { name: "Rice and dal" }).click();
  // Tapping again takes it off: it is a choice, not a commitment.
  await group.getByRole("button", { name: "Rice and dal" }).click();
  await page.getByRole("button", { name: /Save meal|Add meal/ }).click();
  await expect.poll(() => calls.length).toBeGreaterThan(0);
  expect(calls[0].body.swapIds).toEqual(["m2"]);
});

test("it says plainly that a swap is a choice, not a rule", async ({ page }) => {
  await openMeals(page, [PANEER, CHICKEN]);
  await page.getByRole("button", { name: "Edit Paneer bhurji" }).click();
  await expect(page.getByText(/Nothing is forced/)).toBeVisible();
});

test("editing keeps the alternatives already chosen", async ({ page }) => {
  await openMeals(page, [meal("m1", "Paneer bhurji", { swapIds: ["m2"] }), CHICKEN]);
  await page.getByRole("button", { name: "Edit Paneer bhurji" }).click();
  const group = page.getByRole("group", { name: "Can be swapped for" });
  await expect(group.getByRole("button", { name: "Chicken curry" })).toHaveAttribute("aria-pressed", "true");
});
