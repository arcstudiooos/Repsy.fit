// Prompt 79: the client app - Today, This week, one plan (checklist, rest timer, Finish workout), Me -
// and the coach's "Done by client" label. Every /api call is mocked.
import { expect, test, type Page } from "@playwright/test";
import { openClientTab, emptyApi } from "./fixtures";

const pad = (n: number) => String(n).padStart(2, "0");
const key = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const TODAY = key(new Date());

type Plan = {
  id: string; type: string; title: string; details: string; reasoning: string; status: "Active" | "Done"; date: string;
  completedAt: string | null; completedBy: string | null; clientEffort: number | null; clientNote: string;
};
const plan = (id: string, type: string, title: string, over: Partial<Plan> = {}): Plan => ({
  id, type, title, details: "Walk 20 minutes", reasoning: "", status: "Active", date: TODAY,
  completedAt: null, completedBy: null, clientEffort: null, clientNote: "", ...over,
});
const WORKOUT = plan("w1", "Workout", "Lower body A", {
  details: "1. Back Squat — 4 sets × 6 reps · Rest 120s\n2. Romanian Deadlift — 3 sets × 8 reps · Rest 90s\nWarm up first.",
  reasoning: "Build your squat base before adding load.",
});

async function mock(page: Page, opts: { plans?: Plan[]; failPlansOnce?: boolean } = {}) {
  const plans = opts.plans ?? [WORKOUT, plan("n1", "Nutrition", "High-protein day"), plan("h1", "Habit", "10k steps")];
  const marks: unknown[] = [];
  let failures = opts.failPlansOnce ? 1 : 0;
  await page.route("**/api/**", (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    if (path === "/api/client-auth/me") {
      return route.fulfill({ json: { id: "c1", name: "Maya Patel", loginEmail: "maya@example.com", joinStatus: "active", coachName: "Anna Rivers", needsWelcome: false } });
    }
    if (path === "/api/client-auth/my-assignments") {
      if (failures-- > 0) return route.fulfill({ status: 400, json: { error: "from and to must be real dates in YYYY-MM-DD form." } });
      const from = url.searchParams.get("from")!;
      const to = url.searchParams.get("to")!;
      return route.fulfill({ json: plans.filter((p) => p.date >= from && p.date <= to) });
    }
    const one = path.match(/^\/api\/client-auth\/my-assignments\/([^/]+)(\/done)?$/);
    if (one) {
      const p = plans.find((x) => x.id === decodeURIComponent(one[1]));
      if (!p) return route.fulfill({ status: 404, json: { error: "Plan not found" } });
      if (one[2]) {
        const body = req.postDataJSON() as { done: boolean; effort?: number | null; note?: string };
        marks.push({ id: p.id, ...body });
        Object.assign(p, body.done
          ? { status: "Done", completedBy: "client", clientEffort: body.effort ?? null, clientNote: body.note ?? "" }
          : { status: "Active", completedBy: null, clientEffort: null, clientNote: "" });
      }
      return route.fulfill({ json: p });
    }
    if (path === "/api/client-auth/my-sessions") {
      return route.fulfill({ json: { sessions: [{ id: "s1", title: "Form check", type: "Session", startsAt: "2099-01-05T10:00:00.000Z", endsAt: "2099-01-05T10:30:00.000Z", location: "" }] } });
    }
    if (path === "/api/client-auth/my-streaks") return route.fulfill({ json: { date: TODAY, checkInStreak: 3, habitPercent: 50, workoutsThisWeek: 2, enoughData: true } });
    if (path === "/api/client-auth/my-habits") return route.fulfill({ json: { date: TODAY, days: [], habits: [] } });
    if (path.startsWith("/api/client-auth/my-checkins/")) return route.fulfill({ json: { checkIn: null } });
    if (path === "/api/client-auth/my-targets") return route.fulfill({ json: { calorieTarget: null, proteinTargetG: null, weeklyCheckInDay: 0 } });
    if (path === "/api/client-auth/my-plan") return route.fulfill({ json: { plan: { planName: "Monthly", status: "Active", nextDueDate: "2026-12-01" }, lastPaymentDate: null } });
    if (path === "/api/client-auth/logout") return route.fulfill({ status: 204 });
    return route.fulfill({ status: 404, json: { error: "Not found" } });
  });
  return { marks, plans };
}

test("Today lists today's plans in type order, and Mark done / Undo work", async ({ page }) => {
  const { marks } = await mock(page);
  await page.goto("/client");
  await expect(page.getByRole("heading", { level: 1, name: "Today" })).toBeVisible();
  await expect(page.getByText("Coached by Anna Rivers")).toBeVisible();
  const list = page.getByRole("region", { name: "Today's plans" }).getByRole("listitem");
  await expect(list).toHaveCount(3);
  await expect(list.nth(0)).toContainText("Lower body A");
  await expect(list.nth(1)).toContainText("High-protein day");
  // Grouped by type (chips on the cards; no repeated section headings since the client UI pass).
  await expect(page.getByRole("region", { name: "Today's plans" }).getByRole("heading", { level: 2 })).toHaveCount(0);
  await expect(page.getByText("Today: 0 of 3 plans")).toBeVisible();
  // The workout card starts the workout instead of a blind Mark done (finishing happens inside the plan).
  await expect(list.nth(0).getByRole("link", { name: "Start workout" })).toBeVisible();
  await expect(list.nth(0).getByRole("button", { name: /Mark Lower body A/ })).toHaveCount(0);
  await expect(list.nth(0)).toContainText("2 exercises · Back Squat");
  await page.getByRole("button", { name: "Mark 10k steps done" }).click();
  await expect(page.getByText("Today: 1 of 3 plans")).toBeVisible();
  await expect(page.getByRole("button", { name: "Mark 10k steps as not done" })).toHaveText("Undo");
  await page.getByRole("button", { name: "Mark 10k steps as not done" }).click();
  await expect(page.getByText("Today: 0 of 3 plans")).toBeVisible();
  expect(marks).toEqual([{ id: "h1", done: true }, { id: "h1", done: false }]);
  await expect(page.getByRole("region", { name: "Next session" })).toContainText("Form check");
  await expect(page.getByRole("region", { name: "Streaks" })).toContainText("3 days");
});

test("an empty day says so; a load error shows Retry", async ({ page }) => {
  await mock(page, { plans: [], failPlansOnce: true });
  await page.goto("/client");
  await expect(page.getByRole("alert")).toBeVisible();
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByText("Nothing planned for today.")).toBeVisible();
});

test("the week view shows Monday to Sunday with done marks, and moves between weeks", async ({ page }) => {
  await mock(page, { plans: [WORKOUT, plan("n1", "Nutrition", "High-protein day", { status: "Done" })] });
  await page.goto("/client/week");
  await expect(page.getByRole("heading", { level: 1, name: "This week" })).toBeVisible();
  const days = page.getByRole("listitem").filter({ has: page.getByRole("heading", { level: 2 }) });
  await expect(days).toHaveCount(7);
  await expect(days.first().getByRole("heading")).toContainText("Monday");
  await expect(days.last().getByRole("heading")).toContainText("Sunday");
  const today = days.filter({ hasText: "Today" });
  await expect(today).toContainText("1/2 done");
  await expect(today).toContainText("(done)");
  await page.getByRole("button", { name: "Next week" }).click();
  await expect(page.getByText("Rest day")).toHaveCount(7);
  await page.getByRole("button", { name: "Previous week" }).click();
  await expect(days.filter({ hasText: "Today" })).toContainText("Lower body A");
});

test("a workout opens with its exercises, a checklist kept on the device, the coach's why, and a rest timer", async ({ page }) => {
  await page.clock.install();
  await mock(page);
  await page.goto("/client");
  await page.getByRole("link", { name: "Lower body A" }).click();
  await expect(page).toHaveURL(/\/client\/plan\/w1$/);
  await expect(page.getByRole("heading", { level: 1, name: "Lower body A" })).toBeVisible();
  const ex = page.getByRole("region", { name: "Exercises" });
  await expect(ex.getByText("1. Back Squat")).toBeVisible();
  await expect(ex.getByText("4 sets × 6 reps")).toBeVisible();
  await expect(ex.getByText("Warm up first.")).toBeVisible();
  await expect(page.getByRole("region", { name: "Why this plan" })).toContainText("Build your squat base");

  // Set dots: ticking set 1 and 2 of 4 - the exercise is done only when all sets are.
  const squatSets = ex.getByRole("group", { name: "Sets for Back Squat" });
  await squatSets.getByRole("button", { name: "Back Squat set 2" }).click();
  await expect(page.getByText("0 of 2 exercises done")).toBeVisible();
  await expect(squatSets.getByRole("button", { name: "Back Squat set 1" })).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(squatSets.getByRole("button", { name: "Back Squat set 2" })).toHaveAttribute("aria-pressed", "true");
  await expect(squatSets.getByRole("button", { name: "Back Squat set 3" })).toHaveAttribute("aria-pressed", "false");

  // Ticking a set starts that exercise's rest automatically, in the pinned bar.
  const timer = page.getByRole("region", { name: "Rest timer" });
  await squatSets.getByRole("button", { name: "Back Squat set 3" }).click();
  await expect(timer).toContainText("Back Squat");
  await page.clock.runFor(30_000);
  await expect(timer).toContainText("1:30");
  await timer.getByRole("button", { name: "Pause" }).click();
  await page.clock.runFor(10_000);
  await expect(timer).toContainText("1:30");
  await timer.getByRole("button", { name: "+30 s" }).click();
  await expect(timer).toContainText("2:00");
  // The rest buttons show play + the time and also start at once.
  await page.getByRole("button", { name: "Rest 90 seconds after Romanian Deadlift" }).click();
  await expect(timer).toContainText("Romanian Deadlift");
  await page.clock.runFor(90_000);
  await expect(timer.getByRole("status")).toHaveText("Rest over");
  await timer.getByRole("button", { name: "Close the rest timer" }).click();
  await expect(timer).toHaveCount(0);
});

test("Finish workout saves effort and a note, then shows Done; Mark as not done undoes it", async ({ page }) => {
  const { marks } = await mock(page);
  await page.goto("/client/plan/w1");
  await page.getByRole("button", { name: "Finish workout" }).click();
  const form = page.getByRole("form", { name: "Finish workout" });
  await form.locator("label").filter({ hasText: /^7$/ }).click(); // the visible box is the radio's label
  await expect(form.getByRole("radio", { name: "7" })).toBeChecked();
  // Native radios: arrow keys move the choice.
  await form.getByRole("radio", { name: "7" }).press("ArrowRight");
  await expect(form.getByRole("radio", { name: "8" })).toBeChecked();
  await form.getByLabel("Note for your coach (optional)").fill("  Squats felt heavy ");
  await form.getByRole("button", { name: "Save as done" }).click();
  const doneBox = page.getByRole("region", { name: "Finished" });
  await expect(doneBox.getByRole("status")).toHaveText("✓ Done");
  await expect(doneBox).toContainText("Effort 8/10");
  await expect(doneBox).toContainText("Squats felt heavy");
  expect(marks[0]).toEqual({ id: "w1", done: true, effort: 8, note: "Squats felt heavy" });
  await doneBox.getByRole("button", { name: "Mark as not done" }).click();
  await expect(page.getByRole("button", { name: "Finish workout" })).toBeVisible();
});

test("undoing a plan that has an effort or note asks first", async ({ page }) => {
  const { marks } = await mock(page, { plans: [plan("h1", "Habit", "10k steps", { status: "Done", completedBy: "client", clientEffort: 6 })] });
  await page.goto("/client");
  page.once("dialog", (d) => void d.dismiss());
  await page.getByRole("button", { name: "Mark 10k steps as not done" }).click();
  expect(marks).toEqual([]);
  page.once("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: "Mark 10k steps as not done" }).click();
  await expect(page.getByRole("button", { name: "Mark 10k steps done" })).toBeVisible();
  expect(marks).toEqual([{ id: "h1", done: false }]);
});

test("the rest button resets the timer even for the same exercise; ticks from removed lines don't count", async ({ page }) => {
  await page.clock.install();
  await mock(page);
  await page.addInitScript(() => localStorage.setItem("repsy:client-checklist:w1", JSON.stringify([1, 7, 9])));
  await page.goto("/client/plan/w1");
  // The old saved list still counts: exercise 1 is fully done, ids 7 and 9 no longer exist.
  await expect(page.getByText("1 of 2 exercises done")).toBeVisible();
  await page.getByRole("button", { name: "Rest 90 seconds after Romanian Deadlift" }).click();
  const timer = page.getByRole("region", { name: "Rest timer" });
  await page.clock.runFor(30_000);
  await expect(timer).toContainText("1:00");
  // Picking a rest again resets and restarts it.
  await page.getByRole("button", { name: "Rest 120 seconds after Back Squat" }).click();
  await expect(timer).toContainText("2:00");
  await page.clock.runFor(10_000);
  await expect(timer).toContainText("1:50");
});

test("a plan without exercise lines shows its text and a simple Mark done", async ({ page }) => {
  const { marks } = await mock(page);
  await page.goto("/client/plan/n1");
  await expect(page.getByText("Walk 20 minutes")).toBeVisible();
  await expect(page.getByRole("region", { name: "Rest timer" })).toHaveCount(0);
  await page.getByRole("button", { name: "Mark done" }).click();
  await page.getByRole("button", { name: "Save as done" }).click();
  await expect(page.getByRole("region", { name: "Finished" })).toBeVisible();
  expect(marks).toEqual([{ id: "n1", done: true, effort: null }]);
});

test("a plan that isn't theirs (or is paused) is a plain error with a way back", async ({ page }) => {
  await mock(page);
  await page.goto("/client/plan/not-mine");
  await expect(page.getByRole("alert")).toHaveText("Plan not found");
  await expect(page.getByRole("link", { name: "← Back" })).toBeVisible();
});

test("Me shows the membership, sessions and streaks, and signs out", async ({ page }) => {
  await mock(page);
  await page.goto("/client/me");
  await expect(page.getByRole("heading", { level: 1, name: "Me" })).toBeVisible();
  await expect(page.getByRole("region", { name: "My plan" })).toContainText("Monthly");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/client\/login$/);
});

test("phone: bottom tab bar, no sideways scroll; desktop: tabs in the header", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mock(page);
  await page.goto("/client");
  const bar = page.getByRole("navigation", { name: "Client app tabs" });
  await expect(bar).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Client app", exact: true })).toBeHidden();
  await bar.getByRole("link", { name: "Week" }).click();
  await expect(page).toHaveURL(/\/client\/week$/);
  await expect(bar.getByRole("link", { name: "Week" })).toHaveAttribute("aria-current", "page");
  for (const url of ["/client", "/client/week", "/client/plan/w1", "/client/me"]) {
    await page.goto(url);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), url).toBeLessThanOrEqual(0);
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(page.getByRole("navigation", { name: "Client app", exact: true })).toBeVisible();
  await expect(bar).toBeHidden();
});

// ----- coach side -----
test("the coach's plan list says when the client finished it, with effort and note", async ({ page }) => {
  const CLIENT = { id: "c-maya", coachId: "coach-1", name: "Maya Patel", goal: "Fat loss", age: 29, weightKg: 68, heightCm: 165, level: "Intermediate", focus: "", notes: "", createdAt: "2026-10-01T00:00:00.000Z" };
  const base = { coachId: "coach-1", clientId: "c-maya", type: "Workout", details: "x", reasoning: "", source: "manual", date: "2026-11-12", createdAt: "2026-11-12T00:00:00.000Z", completedAt: "2026-11-12T10:00:00.000Z", clientNote: "" };
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/clients") return route.fulfill({ json: [CLIENT] });
    if (path === "/api/clients/c-maya/assignments") {
      return route.fulfill({
        json: [
          { ...base, id: "a1", title: "Client did it", status: "Done", completedBy: "client", clientEffort: 8, clientNote: "Squats felt heavy" },
          { ...base, id: "a2", title: "Coach ticked it", status: "Done", completedBy: "coach", clientEffort: null },
        ],
      });
    }
    return route.fulfill({ json: emptyApi(path) });
  });
  await page.goto("/app");
  await openClientTab(page, "Plans");
  const cards = page.getByRole("tabpanel").first().getByRole("list", { name: "Assignments" }).getByRole("listitem");
  const mine = cards.filter({ hasText: "Client did it" });
  await expect(mine).toContainText("Done by client");
  await expect(mine).toContainText("Effort 8/10");
  await expect(mine).toContainText("Squats felt heavy");
  await expect(cards.filter({ hasText: "Coach ticked it" })).not.toContainText("Done by client");
});

test("an AI plan over several days: day headings, loads, and ticks kept apart when numbering restarts", async ({ page }) => {
  const week = plan("w2", "Workout", "Push pull week", {
    details: [
      "Day 1 — Push",
      "1. Bench Press — 4 sets × 6 reps · 60 kg · Rest 120s",
      "Day 2 — Pull",
      "1. Deadlift — 3 sets × 5 reps · 100 kg · Rest 180s",
    ].join("\n"),
  });
  await mock(page, { plans: [week] });
  await page.goto("/client/plan/w2");
  const ex = page.getByRole("region", { name: "Exercises" });
  await expect(ex.getByText("Day 1 — Push")).toBeVisible();
  await expect(ex.getByText("Day 2 — Pull")).toBeVisible();
  await expect(ex.getByText("4 sets × 6 reps · 60 kg")).toBeVisible();
  await expect(ex.getByText("3 sets × 5 reps · 100 kg")).toBeVisible();
  const bench = ex.getByRole("group", { name: "Sets for Bench Press" });
  await bench.getByRole("button", { name: "Bench Press set 4" }).click();
  await expect(ex.getByRole("group", { name: "Sets for Deadlift" }).getByRole("button", { name: "Deadlift set 1" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await expect(page.getByText("1 of 2 exercises done")).toBeVisible();
});

