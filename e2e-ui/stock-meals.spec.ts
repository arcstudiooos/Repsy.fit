// Stock meals in the library UI (Nov 2026).
//
// The library now holds Repsy stock meals as well as the coach's own. These tests pin that a shared
// meal cannot be edited from the UI - showing Edit on one would just produce a 404 - and that the
// per-row note does not claim the coach set numbers they did not set.
import { expect, test, type Page, type Route, emptyApi } from "./fixtures";

const stock = {
  id: "stkm_dal_chawal_ghee",
  coachId: null,
  stock: true,
  name: "Dal Chawal with Ghee",
  mealType: "Lunch",
  calories: 488,
  proteinG: 17,
  carbsG: 78,
  fatG: 12,
  fiberG: 9,
  ingredients: "1 katori cooked toor dal (150 g), 1.5 katori cooked rice (200 g), 1 tsp ghee",
  steps: "Pressure cook the dal. Temper cumin in ghee and pour over.",
  dietType: "Vegetarian",
  swapIds: [],
  createdAt: "2026-11-16T00:00:00.000Z",
};
const mine = { ...stock, id: "m-mine", coachId: "c1", stock: false, name: "My Own Oats", mealType: "Breakfast" };

async function openLibrary(page: Page) {
  const copied: string[] = [];
  await page.route("**/api/**", (route: Route) =>
    route.fulfill({ status: 200, json: emptyApi(new URL(route.request().url()).pathname) }),
  );
  await page.route("**/api/meals", (route: Route) => route.fulfill({ status: 200, json: [stock, mine] }));
  await page.route("**/api/meals/*/copy", (route: Route) => {
    copied.push(new URL(route.request().url()).pathname);
    return route.fulfill({ status: 201, json: { ...stock, id: "copy-1", coachId: "c1", stock: false } });
  });
  await page.goto("/app");
  await page.getByRole("tab", { name: "Business" }).click();
  await page.getByRole("button", { name: "Library" }).click();
  // The Library view has its own sub-tabs and opens on Templates, not Meals.
  await page.getByRole("group", { name: "Library view" }).getByRole("button", { name: "Meals" }).click();
  return { copied };
}

test("a shared meal is badged, so a coach can tell whose it is", async ({ page }) => {
  await openLibrary(page);
  const row = page.getByRole("listitem").filter({ hasText: "Dal Chawal with Ghee" });
  await expect(row.getByText("Repsy", { exact: true })).toBeVisible();
  // The coach's own meal carries no badge: one on every row they made would be noise.
  const own = page.getByRole("listitem").filter({ hasText: "My Own Oats" });
  await expect(own.getByText("Repsy", { exact: true })).toHaveCount(0);
});

test("a shared meal offers Copy instead of Edit and Delete", async ({ page }) => {
  await openLibrary(page);
  const row = page.getByRole("listitem").filter({ hasText: "Dal Chawal with Ghee" });
  await expect(row.getByRole("button", { name: "Copy Dal Chawal with Ghee to my library" })).toBeVisible();
  // Editing a stock row would 404, so the control is not offered at all.
  await expect(row.getByRole("button", { name: "Edit Dal Chawal with Ghee" })).toHaveCount(0);
  await expect(row.getByRole("button", { name: "Delete Dal Chawal with Ghee" })).toHaveCount(0);
});

test("the coach's own meal still edits and deletes normally", async ({ page }) => {
  await openLibrary(page);
  const own = page.getByRole("listitem").filter({ hasText: "My Own Oats" });
  await expect(own.getByRole("button", { name: "Edit My Own Oats" })).toBeVisible();
  await expect(own.getByRole("button", { name: "Delete My Own Oats" })).toBeVisible();
  await expect(own.getByRole("button", { name: /Copy My Own Oats/ })).toHaveCount(0);
});

test("a shared meal does not claim the coach set its numbers", async ({ page }) => {
  await openLibrary(page);
  const row = page.getByRole("listitem").filter({ hasText: "Dal Chawal with Ghee" });
  await expect(row.getByText("Repsy numbers - copy it to change them")).toBeVisible();
  const own = page.getByRole("listitem").filter({ hasText: "My Own Oats" });
  await expect(own.getByText("Numbers you set")).toBeVisible();
});

test("copying calls the copy endpoint for that meal", async ({ page }) => {
  const { copied } = await openLibrary(page);
  await page
    .getByRole("listitem")
    .filter({ hasText: "Dal Chawal with Ghee" })
    .getByRole("button", { name: /^Copy/ })
    .click();
  await expect.poll(() => copied).toEqual(["/api/meals/stkm_dal_chawal_ghee/copy"]);
});

test("the library filter can show just the coach's own meals, or just Repsy's", async ({ page }) => {
  await openLibrary(page);
  const filter = page.getByLabel("Whose meals");
  await filter.selectOption("Mine");
  await expect(page.getByRole("listitem").filter({ hasText: "My Own Oats" })).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "Dal Chawal with Ghee" })).toHaveCount(0);
  await filter.selectOption("Repsy");
  await expect(page.getByRole("listitem").filter({ hasText: "Dal Chawal with Ghee" })).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "My Own Oats" })).toHaveCount(0);
});
