// The unsaved-changes banner (Inspo W13, Nov 2026).
//
// The behaviour worth protecting: unsaved work announces itself wherever the coach goes, but never
// traps them. No modal, no blocked navigation - just a way back, and a way to throw it away.
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

const ASSIGNMENT = {
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
};

const SECTIONS = [
  {
    protocol: "Regular",
    sets: 1,
    restSec: 0,
    durationSec: null,
    notes: "",
    exercises: [
      {
        exerciseId: null,
        name: "Back Squat",
        repsPerSet: [6, 6, 6, 6],
        loadPerSet: [],
        durationSec: null,
        distanceM: null,
        rpe: null,
        restSec: 120,
        notes: "",
        recordFields: [],
      },
    ],
  },
];

async function openBuilder(page: Page) {
  let saved = false;
  await page.route("**/api/**", (route: Route) =>
    route.fulfill({ status: 200, json: emptyApi(new URL(route.request().url()).pathname) }),
  );
  await page.route("**/api/clients", (route: Route) => route.fulfill({ status: 200, json: [CLIENT] }));
  await page.route("**/api/exercises**", (route: Route) => route.fulfill({ status: 200, json: [] }));
  await page.route("**/api/clients/c-maya/assignments**", (route: Route) =>
    route.fulfill({ status: 200, json: [ASSIGNMENT] }),
  );
  await page.route("**/api/clients/c-maya/assignments/a1/structure", (route: Route) => {
    if (route.request().method() === "PUT") {
      saved = true;
      return route.fulfill({ status: 200, json: { stored: true, sections: SECTIONS, estimatedSeconds: 432, details: "x" } });
    }
    return route.fulfill({ status: 200, json: { stored: true, sections: SECTIONS, estimatedSeconds: 432 } });
  });

  await page.goto("/app");
  await openClientTab(page, "Plans");
  await page.getByRole("button", { name: /^More actions for/ }).first().click();
  await page.getByRole("menuitem", { name: "Build sets and reps" }).click();
  await expect(page.getByRole("region", { name: "Workout builder" })).toBeVisible();
  return { wasSaved: () => saved };
}

const banner = (page: Page) => page.getByRole("status", { name: "Unsaved changes" });

test("opening the builder alone is not 'unsaved changes'", async ({ page }) => {
  await openBuilder(page);
  await expect(banner(page)).toHaveCount(0);
});

test("changing something raises the banner, naming the plan", async ({ page }) => {
  await openBuilder(page);
  await page.getByLabel("Reps per set").fill("12, 12, 10");
  await expect(banner(page)).toBeVisible();
  await expect(banner(page)).toContainText("Lower body");
  await expect(banner(page)).toContainText("workout");
});

test("putting the value back takes the banner away again", async ({ page }) => {
  await openBuilder(page);
  await page.getByLabel("Reps per set").fill("12, 12, 10");
  await expect(banner(page)).toBeVisible();
  // Back to what the server sent: there is nothing unsaved any more.
  await page.getByLabel("Reps per set").fill("6, 6, 6, 6");
  await expect(banner(page)).toHaveCount(0);
});

test("the banner does not trap the coach: navigation still works, and Continue brings them back", async ({ page }) => {
  await openBuilder(page);
  await page.getByLabel("Reps per set").fill("12, 12, 10");
  await expect(banner(page)).toBeVisible();

  // Navigate away - nothing blocks it, and the banner follows.
  await page.getByRole("tab", { name: "Messages" }).click();
  await expect(page.getByRole("region", { name: "Workout builder" })).toHaveCount(0);
  await expect(banner(page)).toBeVisible();

  // And back to the work in one click.
  await banner(page).getByRole("button", { name: "Continue editing" }).click();
  await expect(page.getByRole("region", { name: "Workout builder" })).toBeVisible();
  await expect(page.getByLabel("Reps per set")).toHaveValue("12, 12, 10");
});

test("Discard throws the draft away and clears the banner", async ({ page }) => {
  const { wasSaved } = await openBuilder(page);
  await page.getByLabel("Reps per set").fill("12, 12, 10");
  await banner(page).getByRole("button", { name: "Discard" }).click();
  await expect(banner(page)).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Workout builder" })).toHaveCount(0);
  // Discarding must never quietly save.
  expect(wasSaved()).toBe(false);
});

test("saving clears the banner", async ({ page }) => {
  const { wasSaved } = await openBuilder(page);
  await page.getByLabel("Reps per set").fill("12, 12, 10");
  await expect(banner(page)).toBeVisible();
  await page.getByRole("button", { name: "Save workout" }).click();
  await expect(banner(page)).toHaveCount(0);
  expect(wasSaved()).toBe(true);
});

test("cancelling the builder leaves no banner pointing at nothing", async ({ page }) => {
  await openBuilder(page);
  await page.getByLabel("Reps per set").fill("12, 12, 10");
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(banner(page)).toHaveCount(0);
});
