// The food catalogue in the meal form (Inspo N1/N7, Nov 2026).
//
// The promise under test: the catalogue FILLS the macro boxes on request and nothing recalculates on
// its own. The meal library guarantees the coach sets every number, and a food database is only
// compatible with that if it stays a one-shot helper.
import { expect, test, type Page, emptyApi, openLibrary } from "./fixtures";

const CLIENTS = [
  { id: "c-maya", coachId: null, name: "Maya Patel", goal: "Fat loss", age: 29, weightKg: 68, heightCm: 165, level: "Intermediate", focus: "", notes: "", createdAt: "2026-10-01T00:00:00.000Z" },
];

const food = (id: string, name: string, over: Record<string, unknown> = {}) => ({
  id,
  name,
  category: "Grains",
  servingLabel: "1 roti",
  servingG: 40,
  calories: 104,
  proteinG: 3.4,
  carbsG: 20,
  fatG: 1,
  fiberG: 2.7,
  stock: true,
  ...over,
});

const ROTI = food("fd_roti", "Roti (whole wheat)");
const PANEER = food("fd_paneer", "Paneer", {
  category: "Dairy and eggs",
  servingLabel: "100 g",
  servingG: 100,
  calories: 265,
  proteinG: 18.3,
  carbsG: 1.2,
  fatG: 20.8,
  fiberG: 0,
});

async function openMealForm(page: Page, foods: unknown[] = [ROTI, PANEER]) {
  const queries: string[] = [];
  const posted: Record<string, unknown>[] = [];
  await page.route("**/api/**", (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.pathname === "/api/clients") return route.fulfill({ json: CLIENTS });
    if (url.pathname === "/api/foods") {
      queries.push(url.search);
      return route.fulfill({ json: foods });
    }
    if (url.pathname === "/api/meals") {
      if (req.method() === "POST") {
        posted.push(req.postDataJSON() as Record<string, unknown>);
        return route.fulfill({ status: 201, json: { id: "m1" } });
      }
      return route.fulfill({ json: [] });
    }
    return route.fulfill({ status: 200, json: emptyApi(url.pathname) });
  });

  await page.goto("/app");
  await openLibrary(page, "Meals");
  await page.getByRole("button", { name: "New meal" }).click();
  return { queries, posted };
}

test("the catalogue is offered, not imposed", async ({ page }) => {
  await openMealForm(page);
  // The boxes are there to type in; the catalogue is a button next to them.
  await expect(page.getByLabel("Calories")).toBeVisible();
  await expect(page.getByRole("button", { name: "Build from foods" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Build from foods" })).toHaveCount(0);
});

test("picking foods shows a running total and fills the boxes only when asked", async ({ page }) => {
  await openMealForm(page);
  await page.getByRole("button", { name: "Build from foods" }).click();
  const picker = page.getByRole("region", { name: "Build from foods" });

  await picker.getByRole("list", { name: "Foods" }).getByRole("button", { name: /Roti \(whole wheat\)/ }).click();
  await picker.getByRole("list", { name: "Foods" }).getByRole("button", { name: /Paneer/ }).click();
  // 104 + 265 kcal, protein 3.4 + 18.3.
  await expect(picker).toContainText("Total: 369 kcal");
  await expect(picker).toContainText("Protein 21.7g");

  // Still nothing in the macro boxes: nothing happens behind the coach's back.
  await expect(page.getByLabel("Calories")).toHaveValue("");

  await picker.getByRole("button", { name: "Use these numbers" }).click();
  await expect(page.getByLabel("Calories")).toHaveValue("369");
  await expect(page.getByLabel("Protein (g)")).toHaveValue("21.7");
  await expect(page.getByLabel("Carbs (g)")).toHaveValue("21.2");
  await expect(page.getByLabel("Fat (g)")).toHaveValue("21.8");
  await expect(page.getByLabel("Fibre (g)")).toHaveValue("2.7");
});

test("the filled numbers stay editable, and what the coach types is what saves", async ({ page }) => {
  const { posted } = await openMealForm(page);
  await page.getByRole("button", { name: "Build from foods" }).click();
  const picker = page.getByRole("region", { name: "Build from foods" });
  await picker.getByRole("list", { name: "Foods" }).getByRole("button", { name: /Roti \(whole wheat\)/ }).click();
  await picker.getByRole("button", { name: "Use these numbers" }).click();

  // Override one: the catalogue is a starting point, not an authority.
  await page.getByLabel("Calories").fill("120");
  await page.getByLabel("Name").fill("Two rotis");
  await page.getByRole("button", { name: /Save meal|Add meal/ }).click();
  await expect.poll(() => posted.length).toBe(1);
  expect(posted[0]).toMatchObject({ name: "Two rotis", calories: 120 });
});

test("servings scale the total, and picking the same food again adds a serving", async ({ page }) => {
  await openMealForm(page);
  await page.getByRole("button", { name: "Build from foods" }).click();
  const picker = page.getByRole("region", { name: "Build from foods" });
  await picker.getByRole("list", { name: "Foods" }).getByRole("button", { name: /Roti \(whole wheat\)/ }).click();
  // Tapping it again means two rotis, not two rows.
  await picker.getByRole("list", { name: "Foods" }).getByRole("button", { name: /Roti \(whole wheat\)/ }).click();
  await expect(picker.getByRole("list", { name: "In this meal" }).getByRole("listitem")).toHaveCount(1);
  await expect(picker).toContainText("Total: 208 kcal");

  // And a typed quantity scales it: half a roti.
  await picker.getByLabel("Servings").fill("0.5");
  await expect(picker).toContainText("Total: 52 kcal");
});

test("a serving reads in words AND grams, because a coach thinks in rotis but weighs in grams", async ({ page }) => {
  await openMealForm(page);
  await page.getByRole("button", { name: "Build from foods" }).click();
  await expect(page.getByRole("button", { name: /Roti \(whole wheat\).*1 roti · 40 g · 104 kcal/ })).toBeVisible();
});

test("a food can be removed from the meal", async ({ page }) => {
  await openMealForm(page);
  await page.getByRole("button", { name: "Build from foods" }).click();
  const picker = page.getByRole("region", { name: "Build from foods" });
  await picker.getByRole("list", { name: "Foods" }).getByRole("button", { name: /Roti \(whole wheat\)/ }).click();
  await picker.getByRole("list", { name: "Foods" }).getByRole("button", { name: /Paneer/ }).click();
  await picker.getByRole("button", { name: "Remove Paneer" }).click();
  await expect(picker).toContainText("Total: 104 kcal");
});

test("searching and filtering ask the server, so the whole catalogue is never downloaded", async ({ page }) => {
  const { queries } = await openMealForm(page);
  await page.getByRole("button", { name: "Build from foods" }).click();
  const picker = page.getByRole("region", { name: "Build from foods" });
  await picker.getByLabel("Search foods").fill("paneer");
  await picker.getByLabel("Category").selectOption("Dairy and eggs");
  await expect
    .poll(() => queries.some((q) => q.includes("search=paneer") && q.includes("category=Dairy%20and%20eggs")))
    .toBe(true);
});

test("a failed food list says the coach can still type the numbers", async ({ page }) => {
  await openMealForm(page);
  await page.route("**/api/foods**", (route) => route.fulfill({ status: 500, json: { error: "nope" } }));
  await page.getByRole("button", { name: "Build from foods" }).click();
  const picker = page.getByRole("region", { name: "Build from foods" });
  // The app retries a 5xx three times with backoff (main.tsx) because it might fix itself, so the
  // error state legitimately takes several seconds to appear. Not a flake: real behaviour.
  await expect(picker.getByRole("alert")).toContainText("still type the numbers in yourself", { timeout: 20_000 });
  // The form is not broken by a failed helper.
  await expect(page.getByLabel("Calories")).toBeEditable();
});

test("no matches points at where to add your own", async ({ page }) => {
  await openMealForm(page, []);
  await page.getByRole("button", { name: "Build from foods" }).click();
  await expect(page.getByText(/No foods match that/)).toBeVisible();
});

test("the library still says the coach sets the numbers", async ({ page }) => {
  await openMealForm(page);
  // The promise survived the feature: it is about control, not about the absence of a database.
  await expect(page.getByText("Numbers you set")).toBeVisible();
});
