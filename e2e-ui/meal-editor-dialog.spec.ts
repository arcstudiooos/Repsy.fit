// The meal editor is a dialog over the library (Nov 2026 UI batch, flow 6).
//
// Opening the form used to hide the library's whole filter bar, so a coach who had searched for
// "paneer" and filtered to Vegetarian lost both when they edited a meal - and the list behind had
// quietly gone back to showing everything. The food picker stays INSIDE this dialog rather than
// opening a second one: two stacked sheets on a 360px phone leave no room for the thing being
// filled in.
import { expect, test, type Page, type Route, emptyApi } from "./fixtures";

const meal = (id: string, name: string, dietType = "Any") => ({
  id, coachId: "c1", stock: false, name, mealType: "Lunch", calories: 500, proteinG: 30,
  carbsG: 50, fatG: 15, fiberG: 5, ingredients: "", steps: "", dietType, swapIds: [],
  createdAt: "2026-11-01T00:00:00.000Z",
});

const meals = [
  meal("m1", "Paneer bhurji", "Vegetarian"),
  meal("m2", "Paneer tikka", "Vegetarian"),
  meal("m3", "Chicken curry", "Non-vegetarian"),
];

async function openMealLibrary(page: Page) {
  await page.route("**/api/**", (route: Route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.startsWith("/api/meals")) return route.fulfill({ status: 200, json: meals });
    if (path.startsWith("/api/foods")) {
      return route.fulfill({ status: 200, json: [
        { id: "f1", coachId: null, stock: true, name: "Paneer", per: "100 g", calories: 265, proteinG: 18, carbsG: 6, fatG: 20, fiberG: 0, createdAt: "2026-11-01T00:00:00.000Z" },
      ] });
    }
    return route.fulfill({ status: 200, json: emptyApi(path) });
  });
  await page.goto("/app");
  await page.getByRole("tab", { name: "Business" }).click();
  await page.getByRole("button", { name: "Library" }).click();
  await page.getByRole("group", { name: "Library view" }).getByRole("button", { name: "Meals" }).click();
}

test("the search and the filters are still there after an edit is cancelled", async ({ page }) => {
  await openMealLibrary(page);
  await page.getByLabel("Search meals").fill("paneer");
  await page.getByLabel("Diet").selectOption("Vegetarian");
  await expect(page.getByRole("heading", { level: 3, name: "Chicken curry" })).toHaveCount(0);

  await page.getByRole("button", { name: "Edit Paneer bhurji" }).click();
  const dialog = page.getByRole("dialog", { name: "Edit meal" });
  await expect(dialog).toBeVisible();
  // The filter bar is still mounted BEHIND the dialog - that is what makes going back free.
  await expect(page.getByLabel("Search meals")).toHaveValue("paneer");

  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByLabel("Search meals")).toHaveValue("paneer");
  await expect(page.getByLabel("Diet")).toHaveValue("Vegetarian");
  // And the list did not quietly go back to showing everything.
  await expect(page.getByRole("heading", { level: 3, name: "Chicken curry" })).toHaveCount(0);
});

test("the food catalogue opens inside the same dialog, not a second one on top", async ({ page }) => {
  await openMealLibrary(page);
  await page.getByRole("button", { name: "New meal" }).click();
  const dialog = page.getByRole("dialog", { name: "New meal" });
  await dialog.getByRole("button", { name: "Build from foods" }).click();
  // Still exactly one dialog: the picker is a section of this one.
  await expect(page.getByRole("dialog")).toHaveCount(1);
  // The food, not the "Paneer bhurji"/"Paneer tikka" swap chips also on screen.
  await expect(dialog.getByRole("button", { name: /^Paneer · .* 265 kcal/ })).toBeVisible();
});

test("it fits a 360px phone with the Save button reachable", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await openMealLibrary(page);
  await page.getByRole("button", { name: "New meal" }).click();
  const dialog = page.getByRole("dialog", { name: "New meal" });
  const box = (await dialog.boundingBox())!;
  expect(box.width).toBeLessThanOrEqual(360);
  // The footer is sticky, so the commit button is visible without scrolling the dialog first.
  await expect(dialog.getByRole("button", { name: "Save meal" })).toBeInViewport();
  // No field is clipped by the dialog's edge. Deliberately NOT asserting one column: the macro
  // boxes are 2-up on purpose (four short numbers side by side keeps the dialog short), which is a
  // choice the design made long before this dialog existed.
  const right = box.x + box.width;
  const edges = await dialog.locator("input").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().right));
  for (const edge of edges) expect(edge).toBeLessThanOrEqual(right + 1);
});

test("Escape closes the editor and focus returns to the row's Edit button", async ({ page }) => {
  await openMealLibrary(page);
  const trigger = page.getByRole("button", { name: "Edit Paneer tikka" });
  await trigger.click();
  await expect(page.getByRole("dialog", { name: "Edit meal" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Edit meal" })).toHaveCount(0);
  await expect(trigger).toBeFocused();
});
