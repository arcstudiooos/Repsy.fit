// Business > Reports and CSV export (Prompt 70). Every /api call is mocked in the browser.
import { expect, test, type Page } from "./fixtures";

const client = (id: string, name: string) => ({
  id, coachId: "coach-1", name, goal: "Fat loss", age: 29, weightKg: 68, heightCm: 165, level: "Intermediate", focus: "", notes: "", createdAt: "2026-10-01T00:00:00.000Z",
});
const CLIENTS = [client("c-maya", "Maya Patel"), client("c-arjun", "Arjun Rao")];

const REPORT = {
  client: { name: "Arjun Rao", goal: "Fat loss", age: 29, weightKg: 68, heightCm: 165, level: "Intermediate" },
  range: { from: "2026-10-01", to: "2026-10-31" },
  logs: [
    { date: "2026-10-05", weightKg: 70, adherence: 70, workoutsDone: 3 },
    { date: "2026-10-12", weightKg: 69, adherence: 80, workoutsDone: 4 },
    { date: "2026-10-19", weightKg: 68.5, adherence: 90, workoutsDone: 4 },
  ],
  measurements: [
    { date: "2026-10-05", waistCm: 84, chestCm: null, armCm: null, hipCm: null, bodyFatPercent: 24 },
    { date: "2026-10-26", waistCm: 81.5, chestCm: null, armCm: null, hipCm: null, bodyFatPercent: 22 },
  ],
  assignments: { total: 5, done: 3, byType: [{ type: "Workout", count: 3 }, { type: "Nutrition", count: 2 }, { type: "Habit", count: 0 }, { type: "Recovery", count: 0 }] },
  checkIns: { count: 4, energy: 3.5, mood: 4, sleepHours: 7.2, recoveryScore: null, waterLiters: 2.1, steps: 8123 },
};

async function mockApi(page: Page) {
  const seen: string[] = [];
  await page.route("**/api/**", (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    seen.push(path + url.search);
    if (path === "/api/clients") return route.fulfill({ json: CLIENTS });
    if (path === "/api/business/plans") return route.fulfill({ json: { currency: "INR", plans: [] } });
    if (path === "/api/review-queue") return route.fulfill({ json: { pendingCount: 0, items: [] } });
    if (path === "/api/reports/clients/c-arjun/progress-report") return route.fulfill({ json: REPORT });
    if (path === "/api/reports/roster") {
      return route.fulfill({ status: 200, headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="roster-2026-11-11.csv"' }, body: "﻿name\r\n" });
    }
    const csv = /^\/api\/reports\/clients\/([^/]+)\/export\/([^/]+)$/.exec(path);
    if (csv) {
      return route.fulfill({ status: 200, headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="arjun-rao-${csv[2]}.csv"` }, body: "﻿date\r\n" });
    }
    return route.fulfill({ status: 404, json: { error: "Not found" } });
  });
  await page.goto("/app");
  await page.getByRole("tab", { name: "Business" }).click();
  await page.getByRole("group", { name: "Business view" }).getByRole("button", { name: "Reports" }).click();
  await expect(page.getByRole("region", { name: "Reports" })).toBeVisible();
  return seen;
}

test("Business has a Reports view; generating a report shows the printable progress report", async ({ page }) => {
  await mockApi(page);
  await expect(page.getByRole("tab")).toHaveCount(9); // still 9 tabs, no 10th
  await page.getByLabel("Client", { exact: true }).selectOption("c-arjun");
  await page.getByLabel("From (optional)").fill("2026-10-01");
  await page.getByLabel("To (optional)").fill("2026-10-31");
  await page.getByRole("button", { name: "Generate progress report" }).click();

  const report = page.getByRole("article", { name: "Progress report" });
  await expect(report.getByRole("heading", { name: "Progress report: Arjun Rao" })).toBeVisible();
  await expect(report).toContainText("2026-10-01 to 2026-10-31");
  await expect(report).toContainText("Fat loss");
  // Measurements summary: first, latest, change.
  const waist = report.getByRole("row", { name: /Waist/ });
  await expect(waist).toContainText("84 cm");
  await expect(waist).toContainText("81.5 cm");
  await expect(waist).toContainText("-2.5 cm");
  // Reused Progress charts and the counts.
  await expect(report.getByRole("figure", { name: "Weight" })).toBeVisible();
  await expect(report.getByRole("figure", { name: "Adherence" })).toBeVisible();
  await expect(report).toContainText("3 of 5 assignments marked Done");
  await expect(report).toContainText("Average of 4 daily check-ins");
  await expect(report).toContainText("8,123");
  // No coach notes or AI chat in the report.
  await expect(report).not.toContainText(/coach notes|AI chat|notes for AI/i);
  // The PDF method is stated, and the print button is there.
  await expect(page.getByText("choose \"Save as PDF\"")).toBeVisible();
  await expect(page.getByRole("button", { name: "Print or save as PDF" })).toBeVisible();
});

test("print view hides the app chrome and the report controls", async ({ page }) => {
  await mockApi(page);
  await page.getByLabel("Client", { exact: true }).selectOption("c-arjun");
  await page.getByRole("button", { name: "Generate progress report" }).click();
  await expect(page.getByRole("article", { name: "Progress report" })).toBeVisible();
  await page.emulateMedia({ media: "print" });
  await expect(page.getByRole("tablist")).toBeHidden();
  await expect(page.getByRole("button", { name: "Generate progress report" })).toBeHidden();
  // Only the report prints: not the Business heading or the Payments / Schedule / Reports switch.
  await expect(page.getByRole("heading", { level: 2, name: "Business" })).toBeHidden();
  await expect(page.getByRole("group", { name: "Business view" })).toBeHidden();
  await expect(page.getByRole("article", { name: "Progress report" })).toBeVisible();
});

test("a start date after the end date is refused before any request", async ({ page }) => {
  const seen = await mockApi(page);
  await page.getByLabel("From (optional)").fill("2026-11-10");
  await page.getByLabel("To (optional)").fill("2026-11-01");
  await page.getByRole("button", { name: "Generate progress report" }).click();
  await expect(page.getByRole("alert")).toContainText("The start date can't be after the end date.");
  expect(seen.some((p) => p.includes("progress-report"))).toBe(false);
  // Fixing a date clears the message.
  await page.getByLabel("To (optional)").fill("2026-11-20");
  await expect(page.getByRole("alert")).toHaveCount(0);
});

for (const [label, type] of [
  ["Progress logs", "progress"],
  ["Measurements", "measurements"],
  ["Payments", "payments"],
  ["Assignments", "assignments"],
] as const) {
  test(`CSV export: ${label} downloads one ${type} file for the chosen client and range`, async ({ page }) => {
    const seen = await mockApi(page);
    await page.getByLabel("Client", { exact: true }).selectOption("c-arjun");
    await page.getByLabel("From (optional)").fill("2026-10-01");
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("group", { name: "CSV exports" }).getByRole("button", { name: label }).click(),
    ]);
    expect(download.suggestedFilename()).toBe(`arjun-rao-${type}.csv`);
    expect(seen).toContain(`/api/reports/clients/c-arjun/export/${type}?from=2026-10-01`);
  });
}

test("the Payments view has a roster CSV download", async ({ page }) => {
  await mockApi(page);
  await page.getByRole("group", { name: "Business view" }).getByRole("button", { name: "Payments" }).click();
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download roster CSV" }).click()]);
  expect(download.suggestedFilename()).toBe("roster-2026-11-11.csv");
});
