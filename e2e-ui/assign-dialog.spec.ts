// Assigning a meal is a dialog that finishes the job (Nov 2026 UI batch).
//
// It used to be an inline panel: it pushed the rest of the library down the page, and assigning the
// same meal to a second client meant finding the meal again. These tests pin the behaviour that
// replaced it, plus the accessibility the dialog has to carry.
import { expect, test, type Page, type Route, emptyApi } from "./fixtures";

const meal = {
  id: "m1",
  coachId: "c1",
  stock: false,
  name: "Oats and eggs",
  mealType: "Breakfast",
  calories: 450,
  proteinG: 30,
  carbsG: 45.5,
  fatG: 15,
  fiberG: 6,
  ingredients: "50 g oats, 3 eggs",
  steps: "Cook the oats.",
  dietType: "Eggetarian",
  swapIds: [],
  createdAt: "2026-11-01T00:00:00.000Z",
};

const clients = [
  { id: "c-arjun", coachId: "c1", name: "Arjun Mehta", goal: "Fat loss", age: 30, weightKg: 70, heightCm: 175, level: "Beginner", focus: "", notes: "", goalDate: null, goalEvent: "", createdAt: "2026-10-01T00:00:00.000Z" },
  { id: "c-maya", coachId: "c1", name: "Maya Patel", goal: "Strength", age: 29, weightKg: 58, heightCm: 165, level: "Intermediate", focus: "", notes: "", goalDate: null, goalEvent: "", createdAt: "2026-10-01T00:00:00.000Z" },
];

async function openAssign(page: Page) {
  const calls: string[] = [];
  await page.route("**/api/**", (route: Route) =>
    route.fulfill({ status: 200, json: emptyApi(new URL(route.request().url()).pathname) }),
  );
  await page.route("**/api/meals**", (route: Route) => route.fulfill({ status: 200, json: [meal] }));
  await page.route("**/api/clients", (route: Route) => route.fulfill({ status: 200, json: clients }));
  await page.route("**/api/clients/*/assignments", (route: Route) => {
    if (route.request().method() !== "POST") return route.fulfill({ status: 200, json: [] });
    calls.push(new URL(route.request().url()).pathname.split("/")[3]);
    return route.fulfill({ status: 201, json: { id: `a${calls.length}` } });
  });
  await page.goto("/app");
  // Nov 2026: the Library is its own tab, not a view inside Business.
  await page.getByRole("tab", { name: "Library" }).click();
  await page.getByRole("group", { name: "Library view" }).getByRole("button", { name: "Meals" }).click();
  await page.getByRole("button", { name: "Assign Oats and eggs to client" }).click();
  return { calls, dialog: page.getByRole("dialog", { name: "Assign Oats and eggs" }) };
}

test("the dialog carries the macros, so the coach does not leave to check them", async ({ page }) => {
  const { dialog } = await openAssign(page);
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("450");
  await expect(dialog).toContainText("Protein 30");
});

test("it stays open after assigning, so the next client does not mean re-finding the meal", async ({ page }) => {
  const { calls, dialog } = await openAssign(page);
  await dialog.getByLabel("Client").selectOption({ label: "Arjun Mehta" });
  await dialog.getByRole("button", { name: "Assign meal" }).click();
  await expect(dialog.getByText(/Assigned to Arjun Mehta/)).toBeVisible();
  await expect(dialog).toBeVisible();

  // Second client, same dialog, no re-navigation.
  await dialog.getByLabel("Client").selectOption({ label: "Maya Patel" });
  await dialog.getByRole("button", { name: "Assign meal" }).click();
  await expect(dialog.getByText(/Arjun Mehta, Maya Patel/)).toBeVisible();
  await expect.poll(() => calls).toEqual(["c-arjun", "c-maya"]);
});

test("Cancel becomes Done once something was assigned", async ({ page }) => {
  const { dialog } = await openAssign(page);
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeVisible();
  await dialog.getByRole("button", { name: "Assign meal" }).click();
  await expect(dialog.getByRole("button", { name: "Done" })).toBeVisible();
});

test("Escape closes it and the library is still there underneath", async ({ page }) => {
  const { dialog } = await openAssign(page);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  // The point of a dialog: the page behind was never navigated away from.
  await expect(page.getByRole("heading", { name: "Meal library" })).toBeVisible();
});

test("the close button has a real name, and focus returns to the trigger", async ({ page }) => {
  const { dialog } = await openAssign(page);
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("button", { name: "Assign Oats and eggs to client" })).toBeFocused();
});

test("a failed assign explains itself inside the dialog and keeps it open", async ({ page }) => {
  const { dialog } = await openAssign(page);
  await page.route("**/api/clients/*/assignments", (route: Route) =>
    route.request().method() === "POST"
      ? route.fulfill({ status: 500, json: { error: "Could not save that." } })
      : route.fulfill({ status: 200, json: [] }),
  );
  await dialog.getByRole("button", { name: "Assign meal" }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await expect(dialog).toBeVisible();
});
