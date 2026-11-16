// Assigning a template finishes in a dialog, over the library (Nov 2026 UI batch).
//
// This was the worst journey in the app: "Open in Plans" changed the top tab, the sub-view AND the
// selected client in one click, with no way back to the library the coach was browsing. Assigning
// three templates meant walking back three times.
//
// The old cross-tab route is kept as "Open in Plans instead" and is tested in library.spec.ts.
// These tests pin the new default: the job finishes where it started.
import { expect, test, type Page, type Route, emptyApi } from "./fixtures";

const template = {
  id: "t1",
  coachId: "c1",
  name: "Leg day",
  focus: "Quads and glutes",
  notes: "Warm up first",
  exercises: [{ name: "Back Squat", sets: 4, reps: "6", rest: 120 }],
  createdAt: "2026-11-01T00:00:00.000Z",
};

const clients = [
  { id: "c-arjun", coachId: "c1", name: "Arjun Mehta", goal: "Strength", age: 30, weightKg: 70, heightCm: 175, level: "Beginner", focus: "", notes: "", goalDate: null, goalEvent: "", createdAt: "2026-10-01T00:00:00.000Z" },
  { id: "c-maya", coachId: "c1", name: "Maya Patel", goal: "Fat loss", age: 29, weightKg: 58, heightCm: 165, level: "Intermediate", focus: "", notes: "", goalDate: null, goalEvent: "", createdAt: "2026-10-01T00:00:00.000Z" },
];

async function openAssign(page: Page) {
  const calls: string[] = [];
  await page.route("**/api/**", (route: Route) =>
    route.fulfill({ status: 200, json: emptyApi(new URL(route.request().url()).pathname) }),
  );
  await page.route("**/api/templates**", (route: Route) => route.fulfill({ status: 200, json: [template] }));
  await page.route("**/api/clients", (route: Route) => route.fulfill({ status: 200, json: clients }));
  await page.route("**/api/clients/*/assignments", (route: Route) => {
    if (route.request().method() !== "POST") return route.fulfill({ status: 200, json: [] });
    const clientId = new URL(route.request().url()).pathname.split("/")[3];
    calls.push(`${clientId} ${(route.request().postDataJSON() as { title: string }).title}`);
    return route.fulfill({ status: 201, json: { id: `a${calls.length}` } });
  });
  await page.goto("/app");
  await page.getByRole("tab", { name: "Business" }).click();
  await page.getByRole("button", { name: "Library" }).click();
  await page.getByRole("button", { name: "Assign Leg day to client" }).click();
  return { calls, dialog: page.getByRole("dialog", { name: "Assign Leg day" }) };
}

test("the plan is saved from the dialog, and the library is never navigated away from", async ({ page }) => {
  const { calls, dialog } = await openAssign(page);
  await dialog.getByLabel("Client").selectOption({ label: "Arjun Mehta" });
  await dialog.getByRole("button", { name: "Assign plan" }).click();

  await expect(dialog.getByText(/Assigned to Arjun Mehta/)).toBeVisible();
  await expect.poll(() => calls).toEqual(["c-arjun Leg day"]);
  // The tab never changed: this is the defect that dialogs were introduced to fix.
  await expect(page.getByRole("tab", { name: "Business" })).toHaveAttribute("aria-selected", "true");
});

test("the form inside is the real one, prefilled from the template", async ({ page }) => {
  const { dialog } = await openAssign(page);
  const form = dialog.getByRole("form", { name: "New assignment" });
  await expect(form.getByLabel("Title")).toHaveValue("Leg day");
  await expect(form.getByLabel("Reasoning / why this plan (optional)")).toHaveValue("From template: Leg day");
  await expect(form.getByLabel("Extra notes (optional)")).toHaveValue("Warm up first");
  await expect(form.getByLabel("Reps for Back Squat")).toHaveValue("6");
});

test("there is exactly one Date control, so there is no question which one wins", async ({ page }) => {
  const { dialog } = await openAssign(page);
  await expect(dialog.getByLabel("Date")).toHaveCount(1);
});

test("switching client restarts the form, so one client's edits never ride along to the next", async ({ page }) => {
  const { dialog } = await openAssign(page);
  const form = dialog.getByRole("form", { name: "New assignment" });
  await form.getByLabel("Title").fill("Leg day - lighter");
  await dialog.getByLabel("Client").selectOption({ label: "Maya Patel" });
  await expect(form.getByLabel("Title")).toHaveValue("Leg day");
});

test("it stays open after saving, so the same template goes to the next client without re-finding it", async ({ page }) => {
  const { calls, dialog } = await openAssign(page);
  await dialog.getByLabel("Client").selectOption({ label: "Arjun Mehta" });
  await dialog.getByRole("button", { name: "Assign plan" }).click();
  await expect(dialog.getByText(/Assigned to Arjun Mehta/)).toBeVisible();

  await dialog.getByLabel("Client").selectOption({ label: "Maya Patel" });
  await dialog.getByRole("button", { name: "Assign plan" }).click();
  await expect(dialog.getByText(/Arjun Mehta, Maya Patel/)).toBeVisible();
  await expect.poll(() => calls).toEqual(["c-arjun Leg day", "c-maya Leg day"]);
});

test("Escape leaves the library exactly where it was, and focus returns to the trigger", async ({ page }) => {
  const { dialog } = await openAssign(page);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 2, name: "Library" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 3, name: "Leg day" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Assign Leg day to client" })).toBeFocused();
});
