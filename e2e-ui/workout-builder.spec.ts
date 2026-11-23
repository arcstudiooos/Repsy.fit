// The structured workout builder (Inspo W3, Nov 2026), in Plans -> "Build sets and reps".
//
// What matters here: a legacy plan opens on what the coach already wrote (parsed from its text),
// per-set reps round-trip as "12, 12, 10", the estimate moves as you type, reordering works by
// button (no drag needed), and only a Workout offers the builder at all.
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

const assignment = (over: Record<string, unknown> = {}) => ({
  id: "a1",
  coachId: "coach-test",
  clientId: "c-maya",
  type: "Workout",
  title: "Lower body",
  details: "1. Back Squat - 4 sets x 6 reps · Rest 120s",
  reasoning: "",
  source: "manual",
  status: "Active",
  date: "2026-11-15",
  createdAt: "2026-11-15T08:00:00.000Z",
  completedAt: null,
  completedBy: null,
  clientEffort: null,
  clientNote: "",
  mealIds: [],
  ...over,
});

const EXERCISES = [
  { id: "stk_back_squat", name: "Back Squat", equipment: "Barbell", muscleGroup: "Legs", mediaUrl: "", instructions: "", stock: true },
  { id: "stk_plank", name: "Plank", equipment: "Bodyweight", muscleGroup: "Core", mediaUrl: "", instructions: "", stock: true },
];

type Saved = { sections: unknown[] } | null;

async function openBuilder(
  page: Page,
  opts: { stored?: boolean; sections?: unknown[]; assignments?: unknown[]; skipOpen?: boolean } = {},
) {
  const saved: { body: Saved } = { body: null };

  // The catch-all goes FIRST: Playwright matches the LAST-registered route first, so the specific
  // routes below must come after it. emptyApi gives each Home card a reply of the right shape -
  // a bare [] is not a real server answer and leaves the shell unrenderable.
  await page.route("**/api/**", (route: Route) =>
    route.fulfill({ status: 200, json: emptyApi(new URL(route.request().url()).pathname) }),
  );
  await page.route("**/api/clients", (route: Route) => route.fulfill({ status: 200, json: [CLIENT] }));
  await page.route("**/api/exercises**", (route: Route) => route.fulfill({ status: 200, json: EXERCISES }));
  // Trailing ** so a query string (?from=&to=) still matches; without it the list came back empty.
  await page.route("**/api/clients/c-maya/assignments**", (route: Route) =>
    route.fulfill({ status: 200, json: opts.assignments ?? [assignment()] }),
  );
  await page.route("**/api/clients/c-maya/assignments/a1/structure", async (route: Route) => {
    if (route.request().method() === "PUT") {
      saved.body = route.request().postDataJSON() as Saved;
      return route.fulfill({ status: 200, json: { stored: true, sections: (saved.body as { sections: unknown[] }).sections, estimatedSeconds: 600, details: "rewritten" } });
    }
    return route.fulfill({
      status: 200,
      json: {
        stored: opts.stored ?? false,
        // Default: what parsing "4 sets x 6 reps" from the plan text gives.
        sections:
          opts.sections ??
          [{ protocol: "Regular", sets: 1, restSec: 0, durationSec: null, notes: "", exercises: [{ exerciseId: null, name: "Back Squat", repsPerSet: [6, 6, 6, 6], loadPerSet: [], durationSec: null, distanceM: null, rpe: null, restSec: 120, notes: "", recordFields: [] }] }],
        estimatedSeconds: 432,
      },
    });
  });

  await page.goto("/app");
  await openClientTab(page, "Plans");
  if (opts.skipOpen) return saved;
  // Nov 2026: a visible card button, not a line in the "..." menu.
  await page.getByRole("button", { name: "Build sets and reps" }).first().click();
  await expect(page.getByRole("region", { name: "Workout builder" })).toBeVisible();
  return saved;
}

test("a plan written as text opens on what the coach already wrote", async ({ page }) => {
  await openBuilder(page);
  // Parsed from "4 sets x 6 reps": four sets of six, shown the way they are written.
  await expect(page.getByLabel("Reps per set")).toHaveValue("6, 6, 6, 6");
  await expect(page.getByLabel("Exercise")).toHaveValue("Back Squat");
  await expect(page.getByText(/Read from the plan text/)).toBeVisible();
  await expect(page.getByText("4 sets")).toBeVisible();
});

test("the estimated time is shown and moves as the coach types", async ({ page }) => {
  await openBuilder(page);
  const estimate = page.locator("[data-estimate]");
  await expect(estimate).toContainText("Estimated time");
  const before = await estimate.textContent();
  // More reps per set = more time.
  await page.getByLabel("Reps per set").fill("20, 20, 20, 20");
  await expect(estimate).not.toHaveText(before ?? "");
});

test("per-set reps are saved as an array, and a section's protocol with it", async ({ page }) => {
  const saved = await openBuilder(page);
  await page.getByLabel("Reps per set").fill("12, 12, 10");
  await expect(page.getByText("3 sets")).toBeVisible();
  await page.getByLabel("How it runs").selectOption("Superset");
  await page.getByLabel("Rounds").fill("3");
  await page.getByRole("button", { name: "Save workout" }).click();

  await expect.poll(() => saved.body).not.toBeNull();
  const body = saved.body as { sections: { protocol: string; sets: number; exercises: { repsPerSet: number[] }[] }[] };
  expect(body.sections[0].protocol).toBe("Superset");
  expect(body.sections[0].sets).toBe(3);
  expect(body.sections[0].exercises[0].repsPerSet).toEqual([12, 12, 10]);
});

test("the advanced fields are hidden until asked for, and record the client's metrics", async ({ page }) => {
  const saved = await openBuilder(page);
  await expect(page.getByLabel("Target effort (RPE 1-10)")).toHaveCount(0);
  await page.getByRole("button", { name: "More options" }).click();
  await page.getByLabel("Target effort (RPE 1-10)").fill("8");
  await page.getByLabel("Load per set").fill("60 kg, 60 kg, 65 kg");
  // Inspo W8: what the coach prescribes vs what the client logs back.
  await page.getByRole("button", { name: "reps", exact: true }).click();
  await page.getByRole("button", { name: "weight", exact: true }).click();
  await page.getByRole("button", { name: "Save workout" }).click();

  await expect.poll(() => saved.body).not.toBeNull();
  const ex = (saved.body as { sections: { exercises: Record<string, unknown>[] }[] }).sections[0].exercises[0];
  expect(ex.rpe).toBe(8);
  expect(ex.loadPerSet).toEqual(["60 kg", "60 kg", "65 kg"]);
  expect(ex.recordFields).toEqual(["reps", "weight"]);
});

test("sections and exercises reorder by button, with no dragging", async ({ page }) => {
  const saved = await openBuilder(page);
  await page.getByRole("button", { name: "Add exercise" }).click();
  const names = page.getByLabel("Exercise");
  await names.nth(1).fill("Plank");
  // Move the second exercise up; it should come first when saved.
  // Exact, because "Up" would also match the section's "Move up".
  await page.getByRole("button", { name: "Up", exact: true }).nth(1).click();
  await expect(names.first()).toHaveValue("Plank");
  await page.getByRole("button", { name: "Save workout" }).click();
  await expect.poll(() => saved.body).not.toBeNull();
  const exs = (saved.body as { sections: { exercises: { name: string }[] }[] }).sections[0].exercises;
  expect(exs.map((e) => e.name)).toEqual(["Plank", "Back Squat"]);
});

test("a nameless exercise cannot be saved", async ({ page }) => {
  const saved = await openBuilder(page);
  await page.getByLabel("Exercise").fill("");
  await expect(page.getByRole("alert")).toContainText("Every exercise needs a name");
  await expect(page.getByRole("button", { name: "Save workout" })).toBeDisabled();
  expect(saved.body).toBeNull();
});

test("picking from the library links the exercise, free typing does not", async ({ page }) => {
  const saved = await openBuilder(page);
  // The catalogue is offered through a datalist, so there is no custom dropdown to maintain.
  const options = page.locator("datalist option");
  await expect(options.first()).toHaveAttribute("value", "Back Squat");
  await page.getByLabel("Exercise").fill("Plank");
  await page.getByRole("button", { name: "Save workout" }).click();
  await expect.poll(() => saved.body).not.toBeNull();
  const ex = (saved.body as { sections: { exercises: { exerciseId: string | null }[] }[] }).sections[0].exercises[0];
  // "Plank" is a catalogue name, so it links to the library row.
  expect(ex.exerciseId).toBe("stk_plank");
});

test("clearing the structure sends an empty list", async ({ page }) => {
  const saved = await openBuilder(page, { stored: true });
  await page.getByRole("button", { name: "Clear structure" }).click();
  await page.getByRole("button", { name: "Save workout" }).click();
  await expect.poll(() => saved.body).not.toBeNull();
  expect((saved.body as { sections: unknown[] }).sections).toEqual([]);
});

test("cancelling changes nothing", async ({ page }) => {
  const saved = await openBuilder(page);
  await page.getByLabel("Reps per set").fill("1, 1, 1");
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("region", { name: "Workout builder" })).toHaveCount(0);
  expect(saved.body).toBeNull();
});

test("a time-boxed protocol asks for its window", async ({ page }) => {
  await openBuilder(page);
  await expect(page.getByLabel("Window (min)")).toHaveCount(0);
  await page.getByLabel("How it runs").selectOption("AMRAP");
  await expect(page.getByLabel("Window (min)")).toBeVisible();
});

test("only a workout offers the builder", async ({ page }) => {
  // Sections and sets mean nothing for a meal plan, so the action is not offered at all.
  await openBuilder(page, {
    skipOpen: true,
    assignments: [assignment({ id: "a1", type: "Nutrition", title: "Meal plan" })],
  });
  // The builder button is a workout-only affordance, so a meal plan does not show it at all.
  await expect(page.getByRole("button", { name: "Build sets and reps" })).toHaveCount(0);
  await page.getByRole("button", { name: /^More actions for/ }).first().click();
  await expect(page.getByRole("menuitem", { name: "Edit" })).toBeVisible();
});

test("Duplicate copies an exercise in place, and Duplicate section copies the whole block", async ({ page }) => {
  await openBuilder(page);
  await expect(page.getByLabel("Exercise")).toHaveCount(1);
  // One tap duplicates the exercise with its reps.
  await page.getByRole("button", { name: "Duplicate Back Squat" }).click();
  await expect(page.getByLabel("Exercise")).toHaveCount(2);
  await expect(page.getByLabel("Exercise").nth(0)).toHaveValue("Back Squat");
  await expect(page.getByLabel("Exercise").nth(1)).toHaveValue("Back Squat");
  await expect(page.getByLabel("Reps per set").nth(1)).toHaveValue("6, 6, 6, 6");
  // Duplicating the section copies both exercises into a new block below.
  await page.getByRole("button", { name: /Duplicate the .* section/ }).first().click();
  await expect(page.getByLabel("Exercise")).toHaveCount(4);
});
