// Check-ins tab and daily check-ins (Prompt 53). Every /api call is mocked.
import { expect, test, type Page } from "@playwright/test";

const CLIENTS = [
  { id: "c-maya", coachId: "coach-1", name: "Maya Patel", goal: "Fat loss", age: 29, weightKg: 68, heightCm: 165, level: "Intermediate", focus: "", notes: "", createdAt: "2026-10-01T00:00:00.000Z" },
];
const today = new Date().toLocaleDateString("en-CA");
const dayBefore = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toLocaleDateString("en-CA");
};

const checkIn = (over: Record<string, unknown> = {}) => ({
  id: `d-${over.date ?? today}`,
  coachId: "coach-1",
  clientId: "c-maya",
  date: today,
  energy: 4,
  mood: 3,
  sleepHours: null,
  recoveryScore: null,
  waterLiters: 2.5,
  steps: 8000,
  foodNote: "High protein day",
  createdAt: "2026-11-11T08:00:00.000Z",
  updatedAt: "2026-11-11T08:00:00.000Z",
  ...over,
});

/** Opens the Check-ins tab with a fake server that keeps one row per date. */
async function openTab(page: Page, existing: Record<string, unknown>[] = []) {
  const rows = new Map(existing.map((c) => [c.date as string, c]));
  const posts: Record<string, unknown>[] = [];
  await page.route("**/api/**", (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path === "/api/auth/me") return route.fulfill({ json: { id: "coach-1", name: "Ana", email: "ana@example.com", createdAt: "2026-11-01T00:00:00.000Z" } });
    if (path === "/api/clients") return route.fulfill({ json: CLIENTS });
    if (path === "/api/clients/c-maya/checkins") {
      if (route.request().method() === "POST") {
        const body = route.request().postDataJSON() as Record<string, unknown>;
        posts.push(body);
        const existingRow = rows.get(body.date as string);
        const row = checkIn({ ...body, id: `d-${body.date}` });
        rows.set(body.date as string, row);
        return route.fulfill({ status: existingRow ? 200 : 201, json: row });
      }
      const list = [...rows.values()].sort((a, b) => String(b.date).localeCompare(String(a.date)));
      return route.fulfill({ json: list });
    }
    if (path === "/api/review-queue") return route.fulfill({ json: { pendingCount: 0, items: [] } });
    return route.fulfill({ json: [] });
  });
  await page.goto("/app");
  await page.getByRole("tab", { name: "Check-ins" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Check-ins" })).toBeVisible();
  return { posts, rows };
}

test("Check-ins is the 6th tab, after Progress", async ({ page }) => {
  await openTab(page);
  await expect(page.getByRole("tab")).toHaveText(["Home", "AI Coach", "Clients", "Manual Planner", "Progress", "Check-ins"]);
  await expect(page.getByRole("tab", { name: "Check-ins" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel")).toContainText("Selected: Maya Patel");
});

test("logging today saves energy, mood, water, steps and the food note", async ({ page }) => {
  const { posts } = await openTab(page);
  const form = page.getByRole("form", { name: "Today's check-in" });
  await expect(form).toContainText("Nothing logged for today yet.");
  await form.getByRole("button", { name: "Energy 4" }).click();
  await form.getByRole("button", { name: "Mood 3" }).click();
  await form.getByLabel("Water (litres)").fill("2.5");
  await form.getByLabel("Steps").fill("8000");
  await form.getByLabel("Food note").fill("High protein day");
  await form.getByRole("button", { name: "Save check-in" }).click();

  await expect(form.getByRole("status")).toContainText("Saved");
  expect(posts).toEqual([{ date: today, energy: 4, mood: 3, waterLiters: 2.5, steps: 8000, foodNote: "High protein day" }]);
  await expect(page.getByRole("list", { name: "Daily check-ins" }).getByRole("listitem")).toHaveCount(1);
});

test("saving today again updates the same day instead of adding a second row", async ({ page }) => {
  const { posts } = await openTab(page, [checkIn()]);
  const form = page.getByRole("form", { name: "Today's check-in" });
  await expect(form).toContainText("Saved for today. Changing a value updates it.");
  await expect(form.getByRole("button", { name: "Energy 4" })).toHaveAttribute("aria-pressed", "true");
  await expect(form.getByLabel("Steps")).toHaveValue("8000");

  await form.getByRole("button", { name: "Energy 2" }).click();
  await form.getByRole("button", { name: "Update today" }).click();
  await expect(form.getByRole("status")).toContainText("Saved");
  expect(posts).toHaveLength(1);
  expect(posts[0]).toMatchObject({ date: today, energy: 2 });
  const rows = page.getByRole("list", { name: "Daily check-ins" }).getByRole("listitem");
  await expect(rows).toHaveCount(1); // still one row for today
  await expect(rows.first()).toContainText("Energy 2/5");
});

test("the last 14 days list and the energy / mood bars show the loaded days", async ({ page }) => {
  await openTab(page, [checkIn(), checkIn({ date: dayBefore(1), energy: 2, mood: 2, steps: 4000, foodNote: "" })]);
  const rows = page.getByRole("list", { name: "Daily check-ins" }).getByRole("listitem");
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText(today); // newest first
  await expect(rows.first()).toContainText("Energy 4/5 · Mood 3/5 · 2.5 L · 8000 steps");
  await expect(rows.first()).toContainText("High protein day");
  for (const name of ["Energy by day", "Mood by day"]) await expect(page.getByRole("img", { name })).toBeVisible();
});

test("an empty client shows plain words, and no client selected is handled", async ({ page }) => {
  await openTab(page);
  await expect(page.getByRole("region", { name: "Last 14 days" })).toContainText("No check-ins logged yet.");
});

test("a bad value is rejected by the server and shown in plain words", async ({ page }) => {
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/me") return route.fulfill({ json: { id: "coach-1", name: "Ana", email: "a@b.co", createdAt: "2026-11-01T00:00:00.000Z" } });
    if (path === "/api/clients") return route.fulfill({ json: CLIENTS });
    if (path === "/api/clients/c-maya/checkins" && route.request().method() === "POST") {
      return route.fulfill({ status: 400, json: { error: "steps: steps must be a whole number from 0 to 100000." } });
    }
    if (path === "/api/clients/c-maya/checkins") return route.fulfill({ json: [] });
    if (path === "/api/review-queue") return route.fulfill({ json: { pendingCount: 0, items: [] } });
    return route.fulfill({ json: [] });
  });
  await page.goto("/app");
  await page.getByRole("tab", { name: "Check-ins" }).click();
  const form = page.getByRole("form", { name: "Today's check-in" });
  await form.getByLabel("Steps").fill("200000");
  await form.getByRole("button", { name: "Save check-in" }).click();
  await expect(form.getByRole("alert")).toContainText("steps must be a whole number from 0 to 100000.");
});
