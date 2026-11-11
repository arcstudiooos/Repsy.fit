// Progress charts + check-in list (Prompt 27). Every /api call is mocked in the browser;
// the mock keeps logs per client and supports DELETE, like the server.
import { expect, test, type Page, type Route } from "./fixtures";

const CLIENTS = [
  {
    id: "c-maya",
    coachId: null,
    name: "Maya Patel",
    goal: "Fat loss + strength",
    age: 29,
    weightKg: 68,
    heightCm: 165,
    level: "Intermediate",
    focus: "",
    notes: "",
    createdAt: "2026-10-01T00:00:00.000Z",
  },
];

type Log = { id: string; date: string; weightKg: number | null; adherence: number | null; workoutsDone: number | null; note: string };
const full = (l: Log) => ({ coachId: null, clientId: "c-maya", createdAt: `${l.date}T09:00:00.000Z`, ...l });

const PROMPT_25_LOGS: Log[] = [
  { id: "l1", date: "2026-10-26", weightKg: 68.4, adherence: 72, workoutsDone: 3, note: "Starting week" },
  { id: "l2", date: "2026-11-02", weightKg: 67.8, adherence: 81, workoutsDone: 4, note: "Better consistency" },
  { id: "l3", date: "2026-11-09", weightKg: 67.2, adherence: 86, workoutsDone: 4, note: "On track" },
];

// 2 Workout, 1 Nutrition, 0 Habit, 1 Recovery - the Planner would list exactly these 4.
const ASSIGNMENTS = [
  ["a1", "Workout"],
  ["a2", "Nutrition"],
  ["a3", "Workout"],
  ["a4", "Recovery"],
].map(([id, type]) => ({
  id,
  coachId: null,
  clientId: "c-maya",
  type,
  title: `${type} plan ${id}`,
  details: "Details",
  reasoning: "",
  source: "manual",
  status: "Active",
  date: "2026-11-01",
  createdAt: "2026-11-01T00:00:00.000Z",
}));

type Mock = { logs: Log[]; deletes: string[]; deleteFails: boolean };

async function mockApi(page: Page, logs: Log[], assignments = ASSIGNMENTS): Promise<Mock> {
  const mock: Mock = { logs: [...logs], deletes: [], deleteFails: false };
  await page.route("**/api/**", async (route: Route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (req.method() === "GET" && path === "/api/clients") return route.fulfill({ json: CLIENTS });
    if (req.method() === "GET" && /\/chat$/.test(path)) return route.fulfill({ json: [] });
    if (req.method() === "GET" && path === "/api/clients/c-maya/progress") {
      const sorted = [...mock.logs].sort((a, b) => a.date.localeCompare(b.date));
      return route.fulfill({ json: sorted.map(full) });
    }
    const del = path.match(/^\/api\/clients\/c-maya\/progress\/([^/]+)$/);
    if (del && req.method() === "DELETE") {
      mock.deletes.push(del[1]);
      if (mock.deleteFails) return route.fulfill({ status: 500, json: { error: "Something went wrong on the server." } });
      mock.logs = mock.logs.filter((l) => l.id !== del[1]);
      return route.fulfill({ status: 204, body: "" });
    }
    if (req.method() === "GET" && path === "/api/clients/c-maya/assignments") return route.fulfill({ json: assignments });
    return route.fulfill({ status: 404, json: { error: "Not found" } });
  });
  return mock;
}

const panel = (page: Page) => page.getByRole("tabpanel");
const chart = (page: Page, name: string) => panel(page).getByRole("figure", { name });
const checkIns = (page: Page) => panel(page).getByRole("list", { name: "Check-ins" }).getByRole("listitem");
const openProgress = async (page: Page) => {
  await page.goto("/app");
  await page.getByRole("tab", { name: "Progress" }).click();
};

test("weight chart: accent line, MM-DD dates, Date and kg axis labels", async ({ page }) => {
  await mockApi(page, PROMPT_25_LOGS);
  await openProgress(page);
  const weight = chart(page, "Weight");
  await expect(weight.locator(".recharts-line-curve")).toHaveAttribute("stroke", "#FF4A1F");
  await expect(weight.locator(".recharts-cartesian-grid")).toHaveCount(1);
  for (const tick of ["10-26", "11-02", "11-09"]) await expect(weight.locator(".recharts-xAxis")).toContainText(tick);
  await expect(weight.locator(".recharts-xAxis")).not.toContainText("2026");
  await expect(weight).toContainText("Date");
  await expect(weight).toContainText("kg");
});

test("the weight tooltip shows the full date and the weight", async ({ page }) => {
  await mockApi(page, PROMPT_25_LOGS);
  await openProgress(page);
  const weight = chart(page, "Weight");
  await weight.locator(".recharts-line-dots circle").nth(1).hover();
  const tooltip = weight.locator(".recharts-tooltip-wrapper");
  await expect(tooltip).toContainText("2026-11-02");
  await expect(tooltip).toContainText("67.8 kg");
});

test("adherence chart: teal line with the y-axis fixed at 0-100", async ({ page }) => {
  await mockApi(page, PROMPT_25_LOGS);
  await openProgress(page);
  const adherence = chart(page, "Adherence");
  await expect(adherence.locator(".recharts-line-curve")).toHaveAttribute("stroke", "#0E7C6B");
  const yTicks = adherence.locator(".recharts-yAxis .recharts-cartesian-axis-tick-value");
  await expect(yTicks.first()).toHaveText("0");
  await expect(yTicks.last()).toHaveText("100");
});

test("assignments-by-type bars match the Planner list and use the type colours", async ({ page }) => {
  await mockApi(page, PROMPT_25_LOGS);
  await openProgress(page);
  const bars = chart(page, "Assignments by type");
  const labels = bars.locator(".recharts-label-list text");
  // Workout 2, Nutrition 1, Habit 0, Recovery 1 - the same 4 assignments the Planner shows.
  await expect(labels).toHaveText(["2", "1", "0", "1"]);
  const fills = await bars.locator(".recharts-bar-rectangle path").evaluateAll((els) => els.map((e) => e.getAttribute("fill")));
  expect(fills).toEqual(["#FF4A1F", "#0E7C6B", "#7C5CFC"]); // the 0-height Habit bar draws no path
  for (const type of ["Workout", "Nutrition", "Habit", "Recovery"]) await expect(bars.locator(".recharts-xAxis")).toContainText(type);
});

test("fewer than 2 points: the chart area says 'Add one more check-in to see the trend.'", async ({ page }) => {
  await mockApi(page, [PROMPT_25_LOGS[0]]);
  await openProgress(page);
  for (const name of ["Weight", "Adherence"]) {
    await expect(chart(page, name)).toContainText("Add one more check-in to see the trend.");
    await expect(chart(page, name).locator(".recharts-line-curve")).toHaveCount(0);
  }
});

test("only logs with that value count: two logs but one weight shows the message for weight only", async ({ page }) => {
  await mockApi(page, [
    { id: "x1", date: "2026-10-01", weightKg: 70, adherence: 80, workoutsDone: 3, note: "" },
    { id: "x2", date: "2026-10-08", weightKg: null, adherence: 90, workoutsDone: 4, note: "" },
  ]);
  await openProgress(page);
  await expect(chart(page, "Weight")).toContainText("Add one more check-in to see the trend.");
  await expect(chart(page, "Adherence").locator(".recharts-line-curve")).toHaveCount(1);
});

test("the check-in list is newest first with date, weight, adherence, workouts and note", async ({ page }) => {
  await mockApi(page, PROMPT_25_LOGS);
  await openProgress(page);
  await expect(checkIns(page)).toHaveCount(3);
  await expect(checkIns(page).nth(0)).toContainText("2026-11-09");
  await expect(checkIns(page).nth(0)).toContainText("67.2 kg");
  await expect(checkIns(page).nth(0)).toContainText("86%");
  await expect(checkIns(page).nth(0)).toContainText("4 workouts");
  await expect(checkIns(page).nth(0)).toContainText("On track");
  await expect(checkIns(page).nth(2)).toContainText("2026-10-26");
});

test("deleting a check-in removes it and the cards and chart follow", async ({ page }) => {
  const mock = await mockApi(page, PROMPT_25_LOGS);
  await openProgress(page);
  await expect(panel(page).getByRole("group", { name: "Current weight" })).toContainText("67.2 kg");
  await checkIns(page).nth(0).getByRole("button", { name: "Delete check-in 2026-11-09" }).click();
  await expect(checkIns(page)).toHaveCount(2);
  expect(mock.deletes).toEqual(["l3"]);
  await expect(panel(page).getByRole("group", { name: "Current weight" })).toContainText("67.8 kg");
  await expect(chart(page, "Weight").locator(".recharts-line-dots circle")).toHaveCount(2);
});

test("a failed delete shows the error and keeps the check-in", async ({ page }) => {
  const mock = await mockApi(page, PROMPT_25_LOGS);
  mock.deleteFails = true;
  await openProgress(page);
  await checkIns(page).nth(0).getByRole("button", { name: "Delete check-in 2026-11-09" }).click();
  await expect(panel(page).getByRole("alert")).toContainText("The server had a problem");
  await expect(checkIns(page)).toHaveCount(3);
});

test("charts stay inside a phone-width screen", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await mockApi(page, PROMPT_25_LOGS);
  await openProgress(page);
  await expect(chart(page, "Weight").locator(".recharts-line-curve")).toHaveCount(1);
  const pageScrolls = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(pageScrolls).toBe(false);
  for (const name of ["Weight", "Adherence", "Assignments by type"]) {
    const box = (await chart(page, name).boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(375);
  }
});
