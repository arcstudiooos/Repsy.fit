// Progress tab stat cards (Prompt 26). Every /api call is mocked in the browser.
// The numbers below are hand-checked against the raw logs/assignments in each test.
import { expect, test, type Page, type Route, openClientTab, selectClient } from "./fixtures";

const client = (id: string, name: string, createdAt: string) => ({
  id,
  coachId: null,
  name,
  goal: "Fat loss + strength",
  age: 29,
  weightKg: 68,
  heightCm: 165,
  level: "Intermediate",
  focus: "",
  notes: "",
  createdAt,
});
const CLIENTS = [client("c-maya", "Maya Patel", "2026-10-01T00:00:00.000Z"), client("c-leo", "Leo Brooks", "2026-10-02T00:00:00.000Z")];

type Log = { date: string; weightKg: number | null; adherence: number | null; workoutsDone: number | null };
const log = (clientId: string, i: number, l: Log) => ({
  id: `log-${clientId}-${i}`,
  coachId: null,
  clientId,
  note: "",
  createdAt: `${l.date}T09:00:00.000Z`,
  ...l,
});
const assignment = (clientId: string, i: number, status: string) => ({
  id: `as-${clientId}-${i}`,
  coachId: null,
  clientId,
  type: "Workout",
  title: `Plan ${i}`,
  details: "Squat 3x10",
  reasoning: "",
  source: "manual",
  status,
  date: "2026-11-01",
  createdAt: `2026-11-0${i}T00:00:00.000Z`,
});

type Data = { logs: Record<string, Log[]>; statuses: Record<string, string[]> };

async function mockApi(page: Page, data: Data, progressFails = false) {
  await page.route("**/api/**", async (route: Route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (req.method() === "GET" && path === "/api/clients") return route.fulfill({ json: CLIENTS });
    if (req.method() === "GET" && /\/chat$/.test(path)) return route.fulfill({ json: [] });
    const progress = path.match(/^\/api\/clients\/([^/]+)\/progress$/);
    if (progress && req.method() === "GET") {
      if (progressFails) return route.fulfill({ status: 500, json: { error: "Something went wrong on the server." } });
      const id = decodeURIComponent(progress[1]);
      // Server order: oldest first.
      return route.fulfill({ json: (data.logs[id] ?? []).map((l, i) => log(id, i, l)) });
    }
    const assignments = path.match(/^\/api\/clients\/([^/]+)\/assignments$/);
    if (assignments && req.method() === "GET") {
      const id = decodeURIComponent(assignments[1]);
      return route.fulfill({ json: (data.statuses[id] ?? []).map((s, i) => assignment(id, i + 1, s)) });
    }
    return route.fulfill({ status: 404, json: { error: "Not found" } });
  });
}

// The 3 logs from the Prompt 25 curl test (oldest first) plus 4 assignments, 1 Done.
const PROMPT_25_LOGS: Log[] = [
  { date: "2026-10-26", weightKg: 68.4, adherence: 72, workoutsDone: 3 },
  { date: "2026-11-02", weightKg: 67.8, adherence: 81, workoutsDone: 4 },
  { date: "2026-11-09", weightKg: 67.2, adherence: 86, workoutsDone: 4 },
];

const panel = (page: Page) => page.getByRole("tabpanel").first();
const stat = (page: Page, label: string) => panel(page).getByRole("group", { name: label });
const openProgress = async (page: Page) => {
  await page.goto("/app");
  await openClientTab(page, "Progress");
};

test("keeps the Progress heading and the Selected line", async ({ page }) => {
  await mockApi(page, { logs: {}, statuses: {} });
  await openProgress(page);
  await expect(panel(page).getByRole("heading", { level: 2 })).toHaveText("Progress");
  await expect(page.getByRole("region", { name: "Selected client" })).toContainText("Maya Patel");
});

test("the four cards match a hand check of the Prompt 25 logs", async ({ page }) => {
  await mockApi(page, { logs: { "c-maya": PROMPT_25_LOGS }, statuses: { "c-maya": ["Done", "Active", "Active", "Paused"] } });
  await openProgress(page);
  // Current weight: latest log 67.2 kg; change vs first log 67.2 - 68.4 = -1.2 kg.
  await expect(stat(page, "Current weight")).toContainText("67.2 kg");
  await expect(stat(page, "Current weight")).toContainText("-1.2 kg overall");
  // Average adherence: (72 + 81 + 86) / 3 = 79.67 -> 80%.
  await expect(stat(page, "Average adherence")).toContainText("80%");
  // Total workouts: 3 + 4 + 4 = 11.
  await expect(stat(page, "Total workouts")).toContainText("11");
  // Plan completion: 1 Done / 4 assignments = 25%.
  await expect(stat(page, "Plan completion")).toContainText("25%");
  await expect(panel(page)).not.toContainText("No progress logged yet");
});

test("cards show the label in small uppercase under a big serif number, in a 14px card", async ({ page }) => {
  await mockApi(page, { logs: { "c-maya": PROMPT_25_LOGS }, statuses: {} });
  await openProgress(page);
  const card = stat(page, "Total workouts");
  await expect(card).toHaveCSS("border-top-left-radius", "14px");
  await expect(card).toHaveCSS("background-color", "rgb(255, 255, 255)");
  const value = card.getByText("11", { exact: true });
  await expect(value).toHaveCSS("font-family", /Instrument Serif/);
  const label = card.getByText("Total workouts", { exact: true });
  await expect(label).toHaveCSS("text-transform", "uppercase");
  expect((await label.boundingBox())!.y).toBeGreaterThan((await value.boundingBox())!.y);
});

test("a weight gain shows with a plus sign", async ({ page }) => {
  await mockApi(page, {
    logs: {
      "c-maya": [
        { date: "2026-10-01", weightKg: 62, adherence: null, workoutsDone: null },
        { date: "2026-11-01", weightKg: 63.5, adherence: null, workoutsDone: null },
      ],
    },
    statuses: {},
  });
  await openProgress(page);
  await expect(stat(page, "Current weight")).toContainText("63.5 kg");
  await expect(stat(page, "Current weight")).toContainText("+1.5 kg overall");
});

test("no logs and no assignments: the empty card and '-' everywhere, never 0 or NaN", async ({ page }) => {
  await mockApi(page, { logs: {}, statuses: {} });
  await openProgress(page);
  await expect(panel(page)).toContainText("No progress logged yet. Add the first weekly check-in below.");
  for (const label of ["Current weight", "Average adherence", "Total workouts", "Plan completion"]) {
    await expect(stat(page, label)).toContainText("-");
    await expect(stat(page, label)).not.toContainText("NaN");
    await expect(stat(page, label)).not.toContainText(/\b0\b/);
  }
});

test("missing values are skipped: null adherence and weights are ignored, one weight shows no change line", async ({ page }) => {
  await mockApi(page, {
    logs: {
      "c-maya": [
        { date: "2026-10-01", weightKg: 70, adherence: 90, workoutsDone: 2 },
        { date: "2026-10-08", weightKg: null, adherence: null, workoutsDone: null },
      ],
    },
    statuses: { "c-maya": ["Active", "Active"] },
  });
  await openProgress(page);
  // Only one log has a weight: show it, with no overall change.
  await expect(stat(page, "Current weight")).toContainText("70 kg");
  await expect(stat(page, "Current weight")).not.toContainText("overall");
  // Mean of the non-null adherence values only: 90%.
  await expect(stat(page, "Average adherence")).toContainText("90%");
  await expect(stat(page, "Total workouts")).toContainText("2");
  // 0 Done of 2 assignments is a real 0%.
  await expect(stat(page, "Plan completion")).toContainText("0%");
});

test("each client sees only their own numbers", async ({ page }) => {
  await mockApi(page, {
    logs: { "c-maya": PROMPT_25_LOGS, "c-leo": [{ date: "2026-11-01", weightKg: 80, adherence: 60, workoutsDone: 5 }] },
    statuses: { "c-maya": ["Done"], "c-leo": ["Active"] },
  });
  await openProgress(page);
  await expect(stat(page, "Total workouts")).toContainText("11");
  await selectClient(page, "Leo");
  await expect(page.getByRole("region", { name: "Selected client" })).toContainText("Leo Brooks");
  await expect(stat(page, "Current weight")).toContainText("80 kg");
  await expect(stat(page, "Average adherence")).toContainText("60%");
  await expect(stat(page, "Total workouts")).toContainText("5");
  await expect(stat(page, "Plan completion")).toContainText("0%");
});

// Prompt 54: habit completion feeds Plan completion (average of assignments % and this week's habit %).
test("habit completion feeds Plan completion", async ({ page }) => {
  await mockApi(page, { logs: { "c-maya": PROMPT_25_LOGS }, statuses: { "c-maya": ["Done", "Active", "Active", "Paused"] } });
  const days = ["2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08", "2026-11-09", "2026-11-10", "2026-11-11"];
  const habit = (id: string, week: boolean[]) => ({
    id,
    coachId: "coach-1",
    clientId: "c-maya",
    name: id,
    active: true,
    createdAt: "2026-11-01T00:00:00.000Z",
    week,
    currentStreak: 0,
    bestStreak: 0,
  });
  await page.route("**/api/clients/c-maya/habits**", (route) =>
    route.fulfill({ json: { date: "2026-11-11", days, habits: [habit("h1", days.map(() => true)), habit("h2", days.map(() => true))] } }),
  );
  await openProgress(page);
  // Assignments: 1 Done / 4 = 25%. Habits: 14 ticks / 14 possible = 100%. Average 62.5 -> 63%.
  await expect(stat(page, "Plan completion")).toContainText("63%");
});

test("with habits but no assignments, Plan completion is the habit %", async ({ page }) => {
  await mockApi(page, { logs: {}, statuses: {} });
  const days = ["2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08", "2026-11-09", "2026-11-10", "2026-11-11"];
  await page.route("**/api/clients/c-maya/habits**", (route) =>
    route.fulfill({
      json: {
        date: "2026-11-11",
        days,
        habits: [{ id: "h1", coachId: "coach-1", clientId: "c-maya", name: "Walk", active: true, createdAt: "2026-11-01T00:00:00.000Z", week: [true, true, true, false, false, false, false], currentStreak: 0, bestStreak: 3 }],
      },
    }),
  );
  await openProgress(page);
  await expect(stat(page, "Plan completion")).toContainText("43%"); // 3 of 7
});

test("a failed load shows an error with Retry", async ({ page }) => {
  await mockApi(page, { logs: {}, statuses: {} }, true);
  await openProgress(page);
  await expect(panel(page).getByRole("alert")).toContainText("The server had a problem", { timeout: 15_000 });
  await expect(panel(page).getByRole("button", { name: "Retry" })).toBeVisible();
});
