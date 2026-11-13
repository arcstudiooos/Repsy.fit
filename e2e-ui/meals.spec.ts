// Meal library in the Library tab (Prompt 60). Every /api call is mocked, with a small fake server that keeps
// the meals and assignments.
import { expect, test, type Page, openLibrary } from "./fixtures";

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
const CLIENTS = [client("c-maya", "Maya Patel"), client("c-arjun", "Arjun Mehta")];

type M = {
  id: string;
  coachId: string;
  name: string;
  mealType: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  ingredients: string;
  steps: string;
  createdAt: string;
};
const meal = (id: string, name: string, over: Partial<M> = {}): M => ({
  id,
  coachId: "coach-test",
  name,
  mealType: "Breakfast",
  calories: 450,
  proteinG: 30,
  carbsG: 45.5,
  fatG: 15,
  ingredients: "",
  steps: "",
  createdAt: "2026-11-11T08:00:00.000Z",
  ...over,
});

async function openMeals(page: Page, initial: M[] = []) {
  const meals = [...initial];
  const calls: string[] = [];
  await page.route("**/api/**", (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    const method = req.method();
    if (path === "/api/clients") return route.fulfill({ json: CLIENTS });
    if (path === "/api/review-queue") return route.fulfill({ json: { pendingCount: 0, items: [] } });
    if (path === "/api/templates") return route.fulfill({ json: [] });
    if (path === "/api/meals") {
      if (method === "POST") {
        const body = req.postDataJSON() as Partial<M>;
        calls.push(`POST ${JSON.stringify(body)}`);
        const created = meal(`m${meals.length + 10}`, body.name ?? "", body);
        meals.push(created);
        return route.fulfill({ status: 201, json: created });
      }
      return route.fulfill({ json: [...meals].sort((a, b) => a.name.localeCompare(b.name)) });
    }
    const one = path.match(/^\/api\/meals\/([^/]+)$/);
    if (one && method === "PUT") {
      const body = req.postDataJSON() as Partial<M>;
      calls.push(`PUT ${one[1]} ${JSON.stringify(body)}`);
      const i = meals.findIndex((x) => x.id === one[1]);
      meals[i] = { ...meals[i], ...body } as M;
      return route.fulfill({ json: meals[i] });
    }
    if (one && method === "DELETE") {
      calls.push(`DELETE ${one[1]}`);
      const i = meals.findIndex((x) => x.id === one[1]);
      if (i >= 0) meals.splice(i, 1);
      return route.fulfill({ status: 204, body: "" });
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
    if (asg) return route.fulfill({ json: [] });
    return route.fulfill({ status: 404, json: { error: "Not found" } });
  });
  await page.goto("/app");
  await openLibrary(page, "Meals");
  await expect(page.getByRole("heading", { level: 3, name: "Meal library" })).toBeVisible();
  return { calls };
}

test("lists meals as cards with macros labelled 'Coach-entered values'; search by name and filter by type", async ({ page }) => {
  await openMeals(page, [
    meal("m1", "Oats & eggs", { steps: "Cook the oats." }),
    meal("m2", "Chicken bowl", { mealType: "Lunch", calories: 620, proteinG: 48, carbsG: 60, fatG: 18 }),
    meal("m3", "Protein shake", { mealType: "Snack" }),
  ]);
  const list = page.getByRole("list", { name: "Meals" });
  await expect(list.getByRole("heading", { level: 4 })).toHaveText(["Chicken bowl", "Oats & eggs", "Protein shake"]);
  await expect(list).toContainText("620 kcal · Protein 48g · Carbs 60g · Fat 18g");
  await expect(list).toContainText("450 kcal · Protein 30g · Carbs 45.5g · Fat 15g");
  await expect(list.getByText("Coach-entered values")).toHaveCount(3);

  await page.getByLabel("Search meals").fill("OATS");
  await expect(list.getByRole("heading", { level: 4 })).toHaveText(["Oats & eggs"]);
  await page.getByLabel("Search meals").fill("");
  await page.getByLabel("Meal type").selectOption("Lunch");
  await expect(list.getByRole("heading", { level: 4 })).toHaveText(["Chicken bowl"]);
  await page.getByLabel("Meal type").selectOption("Snack");
  await page.getByLabel("Search meals").fill("chicken");
  await expect(page.getByText("No meal matches your search.")).toBeVisible();
});

test("empty state says the coach enters the values (no lookup)", async ({ page }) => {
  await openMeals(page);
  const empty = page.getByText("No meals yet.");
  await expect(empty).toBeVisible();
  await expect(empty).toContainText("you enter the calories and macros yourself");
});

test("creates a meal: checks the numbers, then saves exactly what the coach typed", async ({ page }) => {
  const { calls } = await openMeals(page);
  await page.getByRole("button", { name: "New meal" }).click();
  const form = page.getByRole("form", { name: "New meal" });
  await expect(form.getByText("Coach-entered values")).toBeVisible();

  await form.getByRole("button", { name: "Save meal" }).click();
  await expect(form.getByRole("alert")).toContainText("Give the meal a name.");
  await form.getByLabel("Meal name").fill("  Yoghurt bowl ");
  await form.getByRole("button", { name: "Save meal" }).click();
  await expect(form.getByRole("alert")).toContainText("Calories must be a whole number");
  expect(calls).toEqual([]);

  await form.getByLabel("Type").selectOption("Snack");
  await form.getByLabel("Calories (kcal)").fill("300");
  await form.getByLabel("Protein (g)").fill("25.5");
  await form.getByLabel("Carbs (g)").fill("30");
  await form.getByLabel("Fat (g)").fill("8");
  await form.getByLabel("Ingredients (optional)").fill("Yoghurt, berries");
  await form.getByLabel("Steps (optional)").fill("Mix.");
  await form.getByRole("button", { name: "Save meal" }).click();

  await expect(page.getByRole("list", { name: "Meals" }).getByRole("heading", { level: 4 })).toHaveText(["Yoghurt bowl"]);
  expect(calls).toEqual([
    `POST ${JSON.stringify({
      name: "Yoghurt bowl",
      mealType: "Snack",
      calories: 300,
      proteinG: 25.5,
      carbsG: 30,
      fatG: 8,
      ingredients: "Yoghurt, berries",
      steps: "Mix.",
    })}`,
  ]);
});

test("edits a meal: the form starts from it and saves with PUT", async ({ page }) => {
  const { calls } = await openMeals(page, [meal("m1", "Oats & eggs")]);
  await page.getByRole("button", { name: "Edit Oats & eggs" }).click();
  const form = page.getByRole("form", { name: "Edit meal" });
  await expect(form.getByLabel("Meal name")).toHaveValue("Oats & eggs");
  await expect(form.getByLabel("Carbs (g)")).toHaveValue("45.5");
  await form.getByLabel("Calories (kcal)").fill("500");
  await form.getByRole("button", { name: "Save meal" }).click();
  await expect(page.getByRole("list", { name: "Meals" })).toContainText("500 kcal");
  expect(calls).toEqual([
    `PUT m1 ${JSON.stringify({ name: "Oats & eggs", mealType: "Breakfast", calories: 500, proteinG: 30, carbsG: 45.5, fatG: 15, ingredients: "", steps: "" })}`,
  ]);
});

test("delete asks first; Cancel keeps it, Delete removes it", async ({ page }) => {
  const { calls } = await openMeals(page, [meal("m1", "Oats & eggs")]);
  await page.getByRole("button", { name: "Delete Oats & eggs" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Delete this meal?");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("heading", { level: 4, name: "Oats & eggs" })).toBeVisible();
  expect(calls).toEqual([]);

  await page.getByRole("button", { name: "Delete Oats & eggs" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("No meals yet.")).toBeVisible();
  expect(calls).toEqual(["DELETE m1"]);
});

test("Assign to client saves a Nutrition assignment with the meal name, macros, steps and 'From meal library' reasoning", async ({ page }) => {
  const { calls } = await openMeals(page, [meal("m1", "Oats & eggs", { steps: "Cook the oats." })]);
  await page.getByRole("button", { name: "Assign Oats & eggs to client" }).click();
  const panel = page.getByRole("group", { name: "Assign Oats & eggs" });
  await panel.getByLabel("Client").selectOption({ label: "Arjun Mehta" });
  await panel.getByLabel("Date").fill("2026-12-01");
  await panel.getByRole("button", { name: "Assign meal" }).click();

  await expect(panel.getByRole("status")).toContainText("Assigned to Arjun Mehta as a Nutrition plan.");
  expect(calls).toEqual([
    `ASSIGN c-arjun ${JSON.stringify({
      type: "Nutrition",
      title: "Oats & eggs",
      details: "Oats & eggs\n450 kcal · Protein 30g · Carbs 45.5g · Fat 15g\n\nCook the oats.",
      reasoning: "From meal library: Oats & eggs",
      source: "manual",
      date: "2026-12-01",
    })}`,
  ]);
});
