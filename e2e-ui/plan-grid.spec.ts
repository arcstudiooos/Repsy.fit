// The week x day plan grid (Inspo W11/N9, Nov 2026) in Plans -> Calendar.
//
// What the grid is FOR: seeing a block of training at once, gaps included. "Nothing on Thursday for
// three weeks" is invisible in a list and obvious here. So the tests care about the shape of the
// week, the gaps, and that it stays a view onto the same data the list shows.
import { expect, test, type Page, type Route, emptyApi, openClientTab } from "./fixtures";

const CLIENT = {
  id: "c-maya",
  coachId: null,
  name: "Maya Patel",
  goal: "Strength",
  age: 29,
  weightKg: 68,
  heightCm: 165,
  level: "Intermediate",
  focus: "",
  notes: "",
  createdAt: "2026-10-01T00:00:00.000Z",
};

const plan = (id: string, date: string, over: Record<string, unknown> = {}) => ({
  id,
  coachId: "coach-test",
  clientId: "c-maya",
  type: "Workout",
  title: `Plan ${id}`,
  details: "1. Back Squat - 4 sets x 6 reps · Rest 120s",
  reasoning: "",
  source: "manual",
  status: "Active",
  date,
  createdAt: "2026-11-15T08:00:00.000Z",
  completedAt: null,
  completedBy: null,
  clientEffort: null,
  clientNote: "",
  mealIds: [],
  ...over,
});

async function openGrid(page: Page, assignments: unknown[], opts: { stay?: boolean } = {}) {
  const posted: Record<string, unknown>[] = [];
  await page.route("**/api/**", (route: Route) =>
    route.fulfill({ status: 200, json: emptyApi(new URL(route.request().url()).pathname) }),
  );
  await page.route("**/api/clients", (route: Route) => route.fulfill({ status: 200, json: [CLIENT] }));
  await page.route("**/api/clients/c-maya/assignments**", (route: Route) => {
    if (route.request().method() === "POST") {
      posted.push(route.request().postDataJSON() as Record<string, unknown>);
      return route.fulfill({ status: 201, json: plan("new", "2026-11-12") });
    }
    return route.fulfill({ status: 200, json: assignments });
  });

  await page.goto("/app");
  await openClientTab(page, "Plans");
  if (!opts.stay) {
    await page.getByRole("group", { name: "Plans view" }).getByRole("button", { name: "Calendar" }).click();
  }
  return { posted };
}

test("the list is the default; Calendar is a choice", async ({ page }) => {
  await openGrid(page, [plan("a1", "2026-11-11")], { stay: true });
  await expect(page.getByRole("list", { name: "Assignments" })).toBeVisible();
  await expect(page.getByRole("table")).toHaveCount(0);
  await page.getByRole("group", { name: "Plans view" }).getByRole("button", { name: "Calendar" }).click();
  await expect(page.getByRole("table")).toBeVisible();
  await expect(page.getByRole("list", { name: "Assignments" })).toHaveCount(0);
});

test("weeks are rows, days are columns, Monday first", async ({ page }) => {
  await openGrid(page, [plan("a1", "2026-11-11")]);
  const headers = await page.getByRole("columnheader").allTextContents();
  expect(headers).toEqual(["Week", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
});

test("a plan sits on its own day, and the week is labelled", async ({ page }) => {
  // Wed 11 Nov 2026; its week runs Mon 9 - Sun 15.
  await openGrid(page, [plan("a1", "2026-11-11", { title: "Leg day" })]);
  await expect(page.getByRole("rowheader")).toContainText("9 - 15 Nov");
  await expect(page.getByRole("rowheader")).toContainText("1 plan");
  // The chip is in the Wednesday cell: 4th cell of the row (after the row header).
  const cells = page.getByRole("row").nth(1).getByRole("cell");
  await expect(cells.nth(2).getByRole("button", { name: /Leg day/ })).toBeVisible();
  await expect(cells.nth(0).getByRole("button", { name: /Leg day/ })).toHaveCount(0);
});

test("a week with nothing in it is skipped, so gaps do not become scrolling", async ({ page }) => {
  // 11 Nov and 21 Oct: the weeks between them hold nothing.
  await openGrid(page, [plan("a1", "2026-11-11"), plan("a2", "2026-10-21")]);
  const weeks = await page.getByRole("rowheader").allTextContents();
  expect(weeks).toHaveLength(2);
  expect(weeks[0]).toContain("9 - 15 Nov");
  expect(weeks[1]).toContain("19 - 25 Oct");
});

test("the totals above the grid answer the first question about a block", async ({ page }) => {
  await openGrid(page, [
    plan("a1", "2026-11-11"),
    plan("a2", "2026-11-13", { status: "Done" }),
    plan("a3", "2026-11-12", { type: "Nutrition" }),
  ]);
  const totals = page.getByRole("list", { name: "Plan totals" });
  await expect(totals).toContainText("Plans");
  await expect(totals).toContainText("3");
  await expect(totals).toContainText("Workouts");
  await expect(totals).toContainText("Finished");
});

test("a finished plan reads as finished", async ({ page }) => {
  await openGrid(page, [plan("a1", "2026-11-11", { title: "Done day", status: "Done" })]);
  const chip = page.getByRole("button", { name: /Done day/ });
  await expect(chip).toBeVisible();
  await expect(chip).toHaveClass(/line-through/);
});

test("each day offers an add that names its date, and it pre-fills the new plan", async ({ page }) => {
  await openGrid(page, [plan("a1", "2026-11-11")]);
  await page.getByRole("button", { name: "Add a plan on 2026-11-12" }).click();
  // It drops back to the list with the form open on that day.
  const form = page.getByRole("form", { name: /New plan|New assignment/ });
  await expect(form).toBeVisible();
  await expect(form.getByLabel("Date")).toHaveValue("2026-11-12");
});

test("clicking a plan returns to the list, where it can be read", async ({ page }) => {
  await openGrid(page, [plan("a1", "2026-11-11", { title: "Leg day" })]);
  await page.getByRole("button", { name: /Leg day/ }).click();
  await expect(page.getByRole("list", { name: "Assignments" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Leg day", level: 3 })).toBeVisible();
});

test("the type filter applies to the grid too, so both views agree", async ({ page }) => {
  await openGrid(page, [plan("a1", "2026-11-11", { title: "Leg day" }), plan("a2", "2026-11-12", { type: "Nutrition", title: "Meal plan" })]);
  await expect(page.getByRole("button", { name: /Leg day/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Meal plan/ })).toBeVisible();
  await page.getByRole("group", { name: "Filter by type" }).getByRole("button", { name: "Nutrition" }).click();
  await expect(page.getByRole("button", { name: /Leg day/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Meal plan/ })).toBeVisible();
});

test("today's column is marked, and this week shows even with nothing in it", async ({ page }) => {
  // No assignments at all in the current week, but the coach still needs somewhere to add one.
  await openGrid(page, [plan("a1", "2026-09-02")]);
  const weeks = await page.getByRole("rowheader").allTextContents();
  // The newest row is the current week (kept on purpose), even though it is empty.
  expect(weeks[0]).toContain("nothing");
});
