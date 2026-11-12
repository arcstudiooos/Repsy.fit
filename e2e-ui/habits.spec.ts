// Habit tracker (Prompt 54), a section of the Check-ins tab. Every /api call is mocked, with a small
// fake server that keeps the habits and ticks so the grid reacts like the real one.
import { expect, test, type Page, openClientTab } from "./fixtures";

const CLIENTS = [
  { id: "c-maya", coachId: null, name: "Maya Patel", goal: "Fat loss", age: 29, weightKg: 68, heightCm: 165, level: "Intermediate", focus: "", notes: "", createdAt: "2026-10-01T00:00:00.000Z" },
];
const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const today = new Date().toLocaleDateString("en-CA");
const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));

type H = { id: string; name: string; active: boolean; ticks: Set<string> };

/** Current and best streak the way the server counts them (today not yet logged does not break it). */
function streaks(ticks: Set<string>) {
  let current = 0;
  for (let d = ticks.has(today) ? today : addDays(today, -1); ticks.has(d); d = addDays(d, -1)) current++;
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of [...ticks].sort()) {
    run = prev && addDays(prev, 1) === d ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return { currentStreak: current, bestStreak: best };
}

async function openTab(page: Page, initial: { name: string; ticks?: string[] }[] = []) {
  const habits: H[] = initial.map((h, i) => ({ id: `h${i + 1}`, name: h.name, active: true, ticks: new Set(h.ticks ?? []) }));
  const calls: string[] = [];
  const row = (h: H) => ({ id: h.id, coachId: "coach-1", clientId: "c-maya", name: h.name, active: h.active, createdAt: "2026-11-01T00:00:00.000Z" });
  await page.route("**/api/**", (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    const method = req.method();
    if (path === "/api/clients") return route.fulfill({ json: CLIENTS });
    if (path === "/api/review-queue") return route.fulfill({ json: { pendingCount: 0, items: [] } });
    if (path === "/api/clients/c-maya/checkins") return route.fulfill({ json: [] });
    if (path === "/api/clients/c-maya/habits") {
      if (method === "POST") {
        const { name } = req.postDataJSON() as { name: string };
        if (habits.filter((h) => h.active).length >= 8) {
          return route.fulfill({ status: 400, json: { error: "A client can have up to 8 habits. Archive one to add another." } });
        }
        const h: H = { id: `h${habits.length + 1}`, name, active: true, ticks: new Set() };
        habits.push(h);
        calls.push(`POST ${name}`);
        return route.fulfill({ status: 201, json: row(h) });
      }
      const active = habits.filter((h) => h.active);
      return route.fulfill({ json: { date: today, days, habits: active.map((h) => ({ ...row(h), week: days.map((d) => h.ticks.has(d)), ...streaks(h.ticks) })) } });
    }
    const patch = path.match(/^\/api\/clients\/c-maya\/habits\/([^/]+)$/);
    if (patch && method === "PATCH") {
      const h = habits.find((x) => x.id === patch[1])!;
      const body = req.postDataJSON() as { name?: string; active?: boolean };
      if (body.name !== undefined) h.name = body.name;
      if (body.active !== undefined) h.active = body.active;
      calls.push(`PATCH ${JSON.stringify(body)}`);
      return route.fulfill({ json: row(h) });
    }
    const log = path.match(/^\/api\/clients\/c-maya\/habits\/([^/]+)\/logs\/([^/]+)$/);
    if (log && method === "PUT") {
      const h = habits.find((x) => x.id === log[1])!;
      const { done } = req.postDataJSON() as { done: boolean };
      if (done) h.ticks.add(log[2]);
      else h.ticks.delete(log[2]);
      calls.push(`PUT ${log[2]} ${done}`);
      return route.fulfill({ json: { habitId: h.id, date: log[2], done } });
    }
    return route.fulfill({ status: 404, json: { error: "Not found" } });
  });
  await page.goto("/app");
  await openClientTab(page, "Check-ins");
  await expect(page.getByRole("heading", { level: 2, name: "Check-ins" })).toBeVisible();
  return { habits, calls, section: page.getByRole("region", { name: "Habit tracker" }) };
}

test("shows habits as rows and the last 7 days as columns, with streaks", async ({ page }) => {
  const { section } = await openTab(page, [{ name: "Drink water", ticks: [addDays(today, -2), addDays(today, -1)] }]);
  const grid = section.getByRole("table", { name: "Habit grid" });
  await expect(grid.getByRole("columnheader")).toHaveCount(9); // Habit + 7 days + Streak
  await expect(grid.getByRole("row", { name: /Drink water/ })).toContainText("Streak 2");
  await expect(grid.getByRole("row", { name: /Drink water/ })).toContainText("Best 2");
  await expect(grid.getByRole("button", { name: `Drink water on ${addDays(today, -1)}` })).toHaveAttribute("aria-pressed", "true");
  await expect(grid.getByRole("button", { name: `Drink water on ${today}` })).toHaveAttribute("aria-pressed", "false");
});

test("tapping a day toggles it done and back, and the streak follows", async ({ page }) => {
  const { section, calls } = await openTab(page, [{ name: "Walk", ticks: [addDays(today, -1)] }]);
  const todayCell = section.getByRole("button", { name: `Walk on ${today}` });
  await todayCell.click();
  await expect(todayCell).toHaveAttribute("aria-pressed", "true");
  await expect(section.getByRole("row", { name: /Walk/ })).toContainText("Streak 2");
  await todayCell.click();
  await expect(todayCell).toHaveAttribute("aria-pressed", "false");
  await expect(section.getByRole("row", { name: /Walk/ })).toContainText("Streak 1"); // today not logged does not break it
  expect(calls).toEqual([`PUT ${today} true`, `PUT ${today} false`]);
});

test("adds, renames and archives a habit", async ({ page }) => {
  const { section, calls } = await openTab(page, [{ name: "Stretch" }]);
  await expect(section.getByRole("button", { name: "Add habit" })).toBeVisible();
  await section.getByLabel("New habit").fill("Sleep by 11");
  await section.getByRole("button", { name: "Add habit" }).click();
  await expect(section.getByRole("row", { name: /Sleep by 11/ })).toBeVisible();

  await section.getByRole("button", { name: "Rename Stretch" }).click();
  await section.getByLabel("Habit name").fill("Stretch 10 min");
  await section.getByRole("button", { name: "Save", exact: true }).click();
  await expect(section.getByRole("row", { name: /Stretch 10 min/ })).toBeVisible();

  await section.getByRole("button", { name: "Archive Stretch 10 min" }).click();
  await expect(section.getByRole("row", { name: /Stretch 10 min/ })).toHaveCount(0);
  expect(calls).toEqual(["POST Sleep by 11", 'PATCH {"name":"Stretch 10 min"}', 'PATCH {"active":false}']);
});

test("at 8 habits the add box is disabled with a plain-words note", async ({ page }) => {
  const { section } = await openTab(page, Array.from({ length: 8 }, (_, i) => ({ name: `Habit ${i + 1}` })));
  await expect(section.getByLabel("New habit")).toBeDisabled();
  await expect(section.getByRole("button", { name: "Add habit" })).toBeDisabled();
  await expect(section).toContainText("Archive one to add another.");
});

test("an empty client shows plain words", async ({ page }) => {
  const { section } = await openTab(page);
  await expect(section).toContainText("No habits yet.");
});
