// Prompt 71: the Business tab's Engagement view (coach leaderboard) and the client's "My streaks" line. Mocked API.
import { expect, test } from "./fixtures";

const CLIENTS = [
  { id: "c-maya", coachId: "coach-test", name: "Maya Patel", goal: "Fat loss", age: 29, weightKg: 68, heightCm: 165, level: "Intermediate", focus: "", notes: "", createdAt: "2026-10-01T00:00:00.000Z" },
];

test("Business > Engagement ranks clients with the three numbers beside each rank; empty clients say Not enough data yet", async ({ page }) => {
  const seen: string[] = [];
  await page.route("**/api/**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/clients") return route.fulfill({ json: CLIENTS });
    if (url.pathname === "/api/business/engagement") {
      seen.push(url.search);
      return route.fulfill({
        json: {
          date: "2026-11-12",
          clients: [
            { clientId: "c-maya", clientName: "Maya Patel", rank: 1, checkInStreak: 6, habitPercent: 71, workoutsThisWeek: 3, enoughData: true },
            { clientId: "c-arjun", clientName: "Arjun Rao", rank: 2, checkInStreak: 1, habitPercent: null, workoutsThisWeek: 0, enoughData: true },
            { clientId: "c-new", clientName: "Neha New", rank: null, checkInStreak: 0, habitPercent: null, workoutsThisWeek: 0, enoughData: false },
          ],
        },
      });
    }
    return route.fulfill({ status: 404, json: { error: "Not found" } });
  });
  await page.goto("/app");
  await page.getByRole("tab", { name: "Business" }).click();
  await page.getByRole("button", { name: "Engagement" }).click();

  const rows = page.getByRole("list", { name: "Engagement leaderboard" }).getByRole("listitem");
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText("Maya Patel");
  await expect(rows.nth(0).getByLabel("Rank 1")).toBeVisible();
  await expect(rows.nth(0)).toContainText("6 days");
  await expect(rows.nth(0)).toContainText("71%");
  await expect(rows.nth(0)).toContainText("3");
  await expect(rows.nth(1).getByLabel("Rank 2")).toBeVisible();
  await expect(rows.nth(1)).toContainText("1 day");
  await expect(rows.nth(1)).toContainText("No habits");
  // Not enough data: no rank (never "0"), a plain note instead of numbers.
  await expect(rows.nth(2)).toContainText("Neha New");
  await expect(rows.nth(2)).toContainText("Not enough data yet");
  await expect(rows.nth(2).getByLabel("Not ranked")).toBeVisible();
  await expect(rows.nth(2)).not.toContainText("Check-in streak");
  expect(seen[0]).toMatch(/^\?date=\d{4}-\d{2}-\d{2}$/);
  // Explained, not a black box; no points or prizes.
  await expect(page.getByRole("region", { name: "Engagement" })).toContainText("ranked by their check-in streak, then by habit completion");
});

function mockClient(page: import("@playwright/test").Page, streaks: Record<string, unknown>) {
  return page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/client-auth/me") return route.fulfill({ json: { id: "c-maya", name: "Maya Patel", loginEmail: "maya@example.com" } });
    if (path === "/api/client-auth/my-plan") return route.fulfill({ json: { plan: null, lastPaymentDate: null } });
    if (path === "/api/client-auth/my-sessions") return route.fulfill({ json: { sessions: [] } });
    if (path === "/api/client-auth/my-streaks") return route.fulfill({ json: streaks });
    return route.fulfill({ status: 401, json: { error: "You are not signed in." } });
  });
}

test("/client shows My streaks with the client's own three numbers, and no rank", async ({ page }) => {
  await mockClient(page, { date: "2026-11-12", checkInStreak: 4, habitPercent: 57, workoutsThisWeek: 2, enoughData: true });
  await page.goto("/client");
  const mine = page.getByRole("region", { name: "My streaks" });
  await expect(mine).toContainText("Check-in streak 4 days");
  await expect(mine).toContainText("57%");
  await expect(mine).toContainText("Workouts this week 2");
  await expect(page.getByText(/rank|leaderboard/i)).toHaveCount(0);
});

test("/client My streaks says Not enough data yet for a new client", async ({ page }) => {
  await mockClient(page, { date: "2026-11-12", checkInStreak: 0, habitPercent: null, workoutsThisWeek: 0, enoughData: false });
  await page.goto("/client");
  await expect(page.getByRole("region", { name: "My streaks" })).toContainText("Not enough data yet");
});
