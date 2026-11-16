// The three quick-log dialogs (Nov 2026 UI batch, flow 4).
//
// Measurement, habit and check-in were all forms for WRITING parked in the middle of screens for
// READING: the measurement form sat between its own heading and its table, the habit add block
// stacked under the 7-day grid (and opening the examples pushed the grid off screen), and the
// check-in form wedged between the progress charts and the check-in history.
//
// What these tests pin is the property that made them worth moving: the data behind does not move
// while you type, and an error keeps what you typed.
import { expect, test, type Page, type Route, emptyApi, openClientTab } from "./fixtures";

const client = {
  id: "c-maya", coachId: "c1", name: "Maya Patel", goal: "Fat loss", age: 29, weightKg: 58,
  heightCm: 165, level: "Beginner", focus: "", notes: "", goalDate: null, goalEvent: "",
  createdAt: "2026-10-01T00:00:00.000Z",
};

const measurement = (id: string, date: string) => ({
  id, clientId: "c-maya", date, waistCm: 80, chestCm: null, armCm: null, hipCm: null,
  bodyFatPercent: null, note: "", createdAt: `${date}T00:00:00.000Z`,
});

async function mock(page: Page, opts: { measurements?: unknown[]; failAdd?: boolean } = {}) {
  const calls: string[] = [];
  await page.route("**/api/**", (route: Route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    if (path === "/api/clients") return route.fulfill({ status: 200, json: [client] });
    if (path.endsWith("/measurements")) {
      if (method === "POST") {
        calls.push("POST measurement");
        if (opts.failAdd) return route.fulfill({ status: 400, json: { error: "waistCm must be more than 0." } });
        return route.fulfill({ status: 201, json: measurement("new", "2026-11-10") });
      }
      return route.fulfill({ status: 200, json: opts.measurements ?? [measurement("m1", "2026-11-01")] });
    }
    return route.fulfill({ status: 200, json: emptyApi(path) });
  });
  return { calls };
}

async function openCheckIns(page: Page) {
  await page.goto("/app");
  await openClientTab(page, "Check-ins");
}

test("the measurements table does not move while a measurement is being typed", async ({ page }) => {
  await mock(page, { measurements: Array.from({ length: 6 }, (_, i) => measurement(`m${i}`, `2026-10-0${i + 1}`)) });
  await openCheckIns(page);
  const section = page.getByRole("region", { name: "Body measurements" });
  const table = section.getByRole("table", { name: "Measurements" });
  // Document-relative, not viewport-relative: opening a modal locks the page scroll, and a scroll
  // change would otherwise look like a layout shift when nothing actually moved.
  const docTop = () => table.evaluate((el) => Math.round(el.getBoundingClientRect().top + window.scrollY));
  const before = await docTop();

  await section.getByRole("button", { name: "Add measurement" }).click();
  const dialog = page.getByRole("dialog", { name: "Add measurement" });
  await dialog.getByLabel("Waist (cm)").fill("81.5");
  // The old inline form grew as it was filled and shoved this table down the page.
  expect(await docTop()).toBe(before);
});

test("a rejected measurement keeps the dialog open with the typed value still there", async ({ page }) => {
  const { calls } = await mock(page, { failAdd: true });
  await openCheckIns(page);
  await page.getByRole("region", { name: "Body measurements" }).getByRole("button", { name: "Add measurement" }).click();
  const dialog = page.getByRole("dialog", { name: "Add measurement" });
  await dialog.getByLabel("Waist (cm)").fill("81.5");
  await dialog.getByRole("button", { name: "Save measurement" }).click();

  await expect(dialog.getByRole("alert")).toContainText("waistCm must be more than 0.");
  await expect(dialog).toBeVisible();
  // Nothing retyped: closing on failure is how a coach loses six numbers.
  await expect(dialog.getByLabel("Waist (cm)")).toHaveValue("81.5");
  expect(calls).toEqual(["POST measurement"]);
});

test("the measurement dialog opens with focus on the date, not on nothing", async ({ page }) => {
  await mock(page);
  await openCheckIns(page);
  await page.getByRole("region", { name: "Body measurements" }).getByRole("button", { name: "Add measurement" }).click();
  await expect(page.getByRole("dialog", { name: "Add measurement" }).getByLabel("Measurement date")).toBeFocused();
});

test("Escape closes the measurement dialog and focus returns to the trigger", async ({ page }) => {
  await mock(page);
  await openCheckIns(page);
  const trigger = page.getByRole("region", { name: "Body measurements" }).getByRole("button", { name: "Add measurement" });
  await trigger.click();
  await expect(page.getByRole("dialog", { name: "Add measurement" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Add measurement" })).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("the habit week grid does not move while a habit is being added", async ({ page }) => {
  await page.route("**/api/**", (route: Route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/clients") return route.fulfill({ status: 200, json: [client] });
    if (path.endsWith("/habits")) {
      return route.fulfill({ status: 200, json: {
        date: "2026-11-16",
        days: ["2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15", "2026-11-16"],
        habits: [{
          id: "h1", clientId: "c-maya", name: "Drink 3 litres of water", active: true, days: [],
          weekScheduled: [true, true, true, true, true, true, true],
          week: [true, true, false, false, false, false, false],
          currentStreak: 0, bestStreak: 2,
        }],
      } });
    }
    return route.fulfill({ status: 200, json: emptyApi(path) });
  });
  await openCheckIns(page);
  const section = page.getByRole("region", { name: "Habit tracker" });
  const grid = section.getByRole("table", { name: "Habit grid" });
  // Document-relative: the modal locks the page scroll, which would otherwise read as a shift.
  const docTop = () => grid.evaluate((el) => Math.round(el.getBoundingClientRect().top + window.scrollY));
  const before = await docTop();

  await section.getByRole("button", { name: "Add habit" }).click();
  const dialog = page.getByRole("dialog", { name: "Add a habit" });
  // Expanding the examples is what used to push the grid off the screen entirely.
  await dialog.getByRole("button", { name: "Pick from examples" }).click();
  await expect(dialog.getByRole("button", { name: "Train as planned" })).toBeVisible();
  expect(await docTop()).toBe(before);
});
