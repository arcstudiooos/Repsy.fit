// The client snapshot row (Inspo C4/C5, Nov 2026) above a client's workspace.
//
// The rule these protect: a snapshot is a glance, not the page. Missing data shows as a blank, never
// as a confident zero, and a failed or slow snapshot must never stop a coach using the workspace.
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

const FULL = {
  latestWeightKg: 67.4,
  latestWeightOn: "2026-11-14",
  adherencePercent: 82,
  adherenceDays: 14,
  lastWorkoutOn: "2026-11-14",
  lastWorkoutTitle: "Lower body",
  totalWorkoutsDone: 23,
  currentStreak: 5,
  longestStreak: 12,
};

const EMPTY = {
  latestWeightKg: null,
  latestWeightOn: null,
  adherencePercent: null,
  adherenceDays: 14,
  lastWorkoutOn: null,
  lastWorkoutTitle: null,
  totalWorkoutsDone: 0,
  currentStreak: 0,
  longestStreak: 0,
};

async function open(page: Page, snapshot: unknown, opts: { units?: "kg" | "lb"; status?: number } = {}) {
  await page.route("**/api/**", (route: Route) =>
    route.fulfill({ status: 200, json: emptyApi(new URL(route.request().url()).pathname) }),
  );
  await page.route("**/api/clients", (route: Route) => route.fulfill({ status: 200, json: [CLIENT] }));
  await page.route("**/api/auth/me", (route: Route) =>
    route.fulfill({
      status: 200,
      json: {
        id: "coach-test",
        name: "Coach",
        email: "c@example.com",
        createdAt: "2026-01-01T00:00:00.000Z",
        currency: "INR",
        units: opts.units ?? "kg",
        country: null,
      },
    }),
  );
  await page.route("**/api/clients/c-maya/snapshot", (route: Route) =>
    route.fulfill({ status: opts.status ?? 200, json: snapshot }),
  );
  await page.goto("/app");
  await openClientTab(page, "Plans");
}

test("the snapshot shows weight, adherence, last workout, streak and total", async ({ page }) => {
  await open(page, FULL);
  const row = page.getByRole("list", { name: "Client snapshot" });
  await expect(row).toBeVisible();
  await expect(row).toContainText("67.4 kg");
  await expect(row).toContainText("82%");
  await expect(row).toContainText("last 14 days");
  await expect(row).toContainText("14 Nov");
  await expect(row).toContainText("5 days");
  await expect(row).toContainText("best 12");
  await expect(row).toContainText("23");
});

// Unit conversion is covered in server/test/snapshot-format.test.ts: the e2e fixture pins
// /api/auth/me to one mock coach, so a browser test cannot change the coach's units.

test("a brand new client shows blanks, not zeroes", async ({ page }) => {
  await open(page, EMPTY);
  const row = page.getByRole("list", { name: "Client snapshot" });
  await expect(row).toContainText("not logged yet");
  await expect(row).toContainText("no logs yet");
  await expect(row).toContainText("none yet");
  await expect(row).toContainText("no streak yet");
  await expect(row).toContainText("none finished yet");
  // "0%" would be a lie about adherence nobody has measured.
  await expect(row).not.toContainText("0%");
});

test("a streak of one day reads 'day', not 'days'", async ({ page }) => {
  await open(page, { ...FULL, currentStreak: 1, longestStreak: 1 });
  await expect(page.getByRole("list", { name: "Client snapshot" })).toContainText("1 day");
});

test("a failed snapshot leaves the workspace fully usable", async ({ page }) => {
  await open(page, { error: "boom" }, { status: 500 });
  // No snapshot row...
  await expect(page.getByRole("list", { name: "Client snapshot" })).toHaveCount(0);
  // ...and no error shouting at the coach either: the plans below are what they came for.
  await expect(page.getByRole("heading", { name: "Plans", level: 2 })).toBeVisible();
  await expect(page.getByRole("button", { name: "New plan" })).toBeVisible();
});

test("junk in the snapshot does not crash the page", async ({ page }) => {
  // Same "fail small" rule the Account sections learned the hard way.
  await open(page, []);
  await expect(page.getByRole("heading", { name: "Plans", level: 2 })).toBeVisible();
});

test("the snapshot is not in the AI Coach tab", async ({ page }) => {
  await open(page, FULL);
  await expect(page.getByRole("list", { name: "Client snapshot" })).toBeVisible();
  await page.getByRole("tab", { name: "AI Coach" }).click();
  // AI Coach shares the client header but has no use for a stats row.
  await expect(page.getByRole("list", { name: "Client snapshot" })).toHaveCount(0);
});
