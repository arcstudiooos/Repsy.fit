// Sleep & Recovery (Prompt 55): form fields, the card, the rule line and the At-Risk reason. Every /api call is mocked.
import { expect, test, type Page } from "@playwright/test";
import { openClientTab } from "./fixtures";

const CLIENTS = [
  { id: "c-maya", coachId: "coach-1", name: "Maya Patel", goal: "Fat loss", age: 29, weightKg: 68, heightCm: 165, level: "Intermediate", focus: "", notes: "", createdAt: "2026-10-01T00:00:00.000Z" },
];
const dayBefore = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toLocaleDateString("en-CA");
};
const today = dayBefore(0);

const checkIn = (over: Record<string, unknown> = {}) => ({
  id: `d-${over.date ?? today}`,
  coachId: "coach-1",
  clientId: "c-maya",
  date: today,
  energy: null,
  mood: null,
  sleepHours: null,
  recoveryScore: null,
  waterLiters: null,
  steps: null,
  foodNote: "",
  createdAt: "2026-11-11T08:00:00.000Z",
  updatedAt: "2026-11-11T08:00:00.000Z",
  ...over,
});

async function openTab(page: Page, existing: Record<string, unknown>[] = []) {
  const posts: Record<string, unknown>[] = [];
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/me") return route.fulfill({ json: { id: "coach-1", name: "Ana", email: "ana@example.com", createdAt: "2026-11-01T00:00:00.000Z" } });
    if (path === "/api/clients") return route.fulfill({ json: CLIENTS });
    if (path === "/api/clients/c-maya/checkins") {
      if (route.request().method() === "POST") {
        const body = route.request().postDataJSON() as Record<string, unknown>;
        posts.push(body);
        return route.fulfill({ status: 201, json: checkIn(body) });
      }
      return route.fulfill({ json: existing });
    }
    if (path === "/api/tasks/today") return route.fulfill({ json: { date: today, tasks: [] } });
    if (path === "/api/checkins/recent") return route.fulfill({ json: { items: [] } });
    if (path === "/api/review-queue") return route.fulfill({ json: { pendingCount: 0, items: [] } });
    if (path === "/api/at-risk") {
      return route.fulfill({
        json: {
          date: today,
          clients: [
            {
              clientId: "c-maya",
              clientName: "Maya Patel",
              reasons: [
                { rule: "inactive", text: "No check-in for 12 days" },
                { rule: "sleep", text: "Sleep under 6h average this week" },
              ],
            },
          ],
        },
      });
    }
    return route.fulfill({ json: [] });
  });
  await page.goto("/app");
  return { posts };
}

const openCheckIns = async (page: Page) => {
  await openClientTab(page, "Check-ins");
  await expect(page.getByRole("heading", { level: 2, name: "Check-ins" })).toBeVisible();
};

test("the form saves sleep hours and a recovery score", async ({ page }) => {
  const { posts } = await openTab(page);
  await openCheckIns(page);
  const form = page.getByRole("form", { name: "Today's check-in" });
  await form.getByLabel("Sleep (hours)").fill("7.5");
  await form.getByRole("button", { name: "Recovery 4" }).click();
  await form.getByRole("button", { name: "Save check-in" }).click();
  await expect(form.getByRole("status")).toContainText("Saved");
  expect(posts).toEqual([{ date: today, energy: null, mood: null, waterLiters: null, steps: null, foodNote: "", sleepHours: 7.5, recoveryScore: 4 }]);
});

test("the card shows the 14-day chart, 7-day averages and the plain rule line", async ({ page }) => {
  await openTab(page, [
    checkIn({ date: today, sleepHours: 5, recoveryScore: 2 }),
    checkIn({ date: dayBefore(1), sleepHours: 5.5, recoveryScore: 3 }),
    checkIn({ date: dayBefore(2), sleepHours: 6, recoveryScore: 4 }),
  ]);
  await openCheckIns(page);
  const card = page.getByRole("region", { name: "Sleep & Recovery" });
  await expect(card.getByRole("img", { name: "Sleep hours and recovery score by day" })).toBeVisible();
  await expect(card).toContainText("5.5 h"); // (5 + 5.5 + 6) / 3
  await expect(card).toContainText("3 of 7 nights logged");
  await expect(card).toContainText("3/5");
  await expect(card.getByText("Averaged under 6 hours this week")).toBeVisible();
  const row = page.getByRole("list", { name: "Daily check-ins" }).getByRole("listitem").first();
  await expect(row).toContainText("Sleep 5 h · Recovery 2/5");
});

test("no rule line when the average is 6 hours or more", async ({ page }) => {
  await openTab(page, [checkIn({ date: today, sleepHours: 7, recoveryScore: 4 })]);
  await openCheckIns(page);
  const card = page.getByRole("region", { name: "Sleep & Recovery" });
  await expect(card).toContainText("7 h");
  await expect(card.getByText("Averaged under 6 hours this week")).toHaveCount(0);
});

test("an empty card says so in plain words", async ({ page }) => {
  await openTab(page);
  await openCheckIns(page);
  await expect(page.getByRole("region", { name: "Sleep & Recovery" })).toContainText("No sleep or recovery logged");
});

test("the Needs attention card on Home shows the sleep reason line", async ({ page }) => {
  await openTab(page);
  await page.getByRole("tab", { name: "Home" }).click();
  await expect(page.getByText("Sleep under 6h average this week")).toBeVisible();
});
