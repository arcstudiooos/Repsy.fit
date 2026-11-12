// Prompt 80: the client's habits on Today, the daily and weekly check-ins, the Nutrition plan's targets
// and meals, the weekly check-in day - and the coach's meal picker and "save as daily targets".
import { expect, test, type Page } from "@playwright/test";
import { openClientTab, openLibrary } from "./fixtures";

const pad = (n: number) => String(n).padStart(2, "0");
const key = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const TODAY = key(new Date());
const YESTERDAY = key(new Date(Date.now() - 86_400_000));

async function mock(page: Page, opts: { checkInDay?: number; units?: "kg" | "lb"; existing?: Record<string, unknown> | null } = {}) {
  const sent: { method: string; path: string; body: unknown }[] = [];
  const habits = [
    { id: "h1", name: "10k steps", week: [false, false, false, false, false, true, false], currentStreak: 1, bestStreak: 4 },
    { id: "h2", name: "2 L water", week: [false, false, false, false, false, false, true], currentStreak: 3, bestStreak: 3 },
  ];
  await page.route("**/api/**", (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const body = req.postData() ? req.postDataJSON() : undefined;
    if (req.method() !== "GET") sent.push({ method: req.method(), path, body });
    if (path === "/api/client-auth/me") return route.fulfill({ json: { id: "c1", name: "Maya Patel", loginEmail: "maya@example.com", joinStatus: "active", coachName: "Anna Rivers", needsWelcome: false } });
    if (path === "/api/client-auth/my-assignments") return route.fulfill({ json: [] });
    if (path === "/api/client-auth/my-assignments/n1") {
      return route.fulfill({ json: { id: "n1", type: "Nutrition", title: "High-protein day", details: "Hit your protein.", reasoning: "", status: "Active", date: TODAY, completedAt: null, completedBy: null, clientEffort: null, clientNote: "",
        meals: [{ id: "m1", name: "Overnight oats", mealType: "Breakfast", calories: 420, proteinG: 25, carbsG: 55, fatG: 10 }, { id: "m2", name: "Chicken bowl", mealType: "Lunch", calories: 650, proteinG: 50, carbsG: 60, fatG: 18 }] } });
    }
    if (path === "/api/client-auth/my-habits") return route.fulfill({ json: { date: TODAY, days: [], habits } });
    const tick = path.match(/^\/api\/client-auth\/my-habits\/([^/]+)\/([^/]+)$/);
    if (tick) {
      const h = habits.find((x) => x.id === tick[1])!;
      h.week[6] = (body as { done: boolean }).done;
      return route.fulfill({ json: { habitId: h.id, date: tick[2], done: h.week[6] } });
    }
    const ci = path.match(/^\/api\/client-auth\/my-checkins\/([^/]+)$/);
    if (ci) {
      if (req.method() === "GET") return route.fulfill({ json: { checkIn: ci[1] === YESTERDAY ? (opts.existing ?? null) : null } });
      return route.fulfill({ status: 201, json: { date: ci[1], ...(body as object) } });
    }
    if (path === "/api/client-auth/my-progress") {
      return route.fulfill({ status: req.method() === "POST" ? 201 : 200, json: req.method() === "POST" ? { id: "l1", ...(body as object) } : [
        { id: "l0", date: "2026-11-01", weightKg: 81.65, adherence: 90, workoutsDone: 4, note: "", createdAt: "2026-11-01T00:00:00Z" },
      ] });
    }
    if (path === "/api/client-auth/my-targets") return route.fulfill({ json: { calorieTarget: 2100, proteinTargetG: 140, weeklyCheckInDay: opts.checkInDay ?? 0 } });
    if (path === "/api/client-auth/me/profile") {
      if (req.method() === "PATCH") return route.fulfill({ status: 204 });
      return route.fulfill({ json: { goal: "Fat loss", age: 29, heightCm: 165, weightKg: 68, level: "Beginner", units: opts.units ?? "kg", injuries: "", weeklyCheckInDay: opts.checkInDay ?? 0 } });
    }
    if (path === "/api/client-auth/my-sessions") return route.fulfill({ json: { sessions: [] } });
    if (path === "/api/client-auth/my-streaks") return route.fulfill({ json: { date: TODAY, checkInStreak: 0, habitPercent: null, workoutsThisWeek: 0, enoughData: false } });
    if (path === "/api/client-auth/my-plan") return route.fulfill({ json: { plan: null, lastPaymentDate: null } });
    return route.fulfill({ status: 404, json: { error: "Not found" } });
  });
  return { sent };
}

test("Today shows the client's habits to tick off for today", async ({ page }) => {
  const { sent } = await mock(page);
  await page.goto("/client");
  const box = page.getByRole("region", { name: "Today's habits" });
  await expect(box.getByRole("checkbox", { name: /10k steps/ })).not.toBeChecked();
  await expect(box.getByRole("checkbox", { name: /2 L water/ })).toBeChecked();
  await expect(box).toContainText("3-day streak");
  await box.getByRole("checkbox", { name: /10k steps/ }).check();
  await expect(box.getByRole("checkbox", { name: /10k steps/ })).toBeChecked();
  expect(sent).toEqual([{ method: "PUT", path: `/api/client-auth/my-habits/h1/${TODAY}`, body: { done: true } }]);
});

test("Today highlights the weekly check-in on the client's chosen day", async ({ page }) => {
  await mock(page, { checkInDay: new Date().getDay() });
  await page.goto("/client");
  await expect(page.getByRole("link", { name: /It's weekly check-in day/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /How was today\?/ })).toBeVisible();
});

test("daily check-in: today or yesterday, the coach's fields, loads an existing day", async ({ page }) => {
  const { sent } = await mock(page, { existing: { date: YESTERDAY, energy: 2, mood: 3, sleepHours: 6.5, recoveryScore: null, waterLiters: null, steps: 4000, foodNote: "pizza" } });
  await page.goto("/client");
  await page.getByRole("link", { name: /How was today\?/ }).click();
  await expect(page).toHaveURL(/\/client\/checkin$/);
  const form = page.getByRole("form", { name: "Daily check-in" });
  await form.getByRole("group", { name: "Energy" }).locator("label").filter({ hasText: /^4$/ }).click();
  await form.getByRole("group", { name: "Mood" }).locator("label").filter({ hasText: /^5$/ }).click();
  await form.getByLabel("Sleep (h)").fill("7.5");
  await form.getByLabel("Steps").fill("9000");
  await form.getByRole("button", { name: "Save check-in" }).click();
  await expect(form.getByRole("status")).toHaveText("Saved. Your coach can see it.");
  expect(sent[0]).toEqual({
    method: "PUT",
    path: `/api/client-auth/my-checkins/${TODAY}`,
    body: { energy: 4, mood: 5, recoveryScore: null, sleepHours: 7.5, waterLiters: null, steps: 9000, foodNote: "" },
  });
  await page.getByText("Yesterday", { exact: true }).click();
  await expect(page.getByRole("radio", { name: "Yesterday" })).toBeChecked();
  await expect(form.getByLabel("Steps")).toHaveValue("4000");
  await expect(form.getByLabel("What did you eat? (optional)")).toHaveValue("pizza");
  await expect(form.getByRole("group", { name: "Energy" }).getByRole("radio", { name: "2" })).toBeChecked();
  await form.getByLabel("Sleep (h)").fill("30");
  await form.getByRole("button", { name: "Save check-in" }).click();
  await expect(form.getByRole("alert")).toHaveText("Sleep: hours from 0 to 16, with at most one decimal.");
  await form.getByLabel("Sleep (h)").fill("7.25");
  await form.getByRole("button", { name: "Save check-in" }).click();
  await expect(form.getByRole("alert")).toHaveText("Sleep: hours from 0 to 16, with at most one decimal.");
  // A picked score can be cleared.
  await form.getByRole("button", { name: "Clear energy" }).click();
  await expect(form.getByRole("group", { name: "Energy" }).getByRole("radio", { checked: true })).toHaveCount(0);
});

test("weekly check-in: weight in the client's unit (lb -> kg), sent to the coach", async ({ page }) => {
  const { sent } = await mock(page, { units: "lb" });
  await page.goto("/client/weekly");
  await page.getByLabel("Weight (lb)").fill("150");
  await page.getByLabel("Plan followed (%)").fill("85");
  await page.getByLabel("Workouts done").fill("3");
  await page.getByLabel("How did the week go? (optional)").fill("Busy week");
  await page.getByRole("button", { name: "Send to my coach" }).click();
  await expect(page.getByRole("status")).toHaveText("Sent to your coach. Thanks!");
  expect(sent[0]).toEqual({ method: "POST", path: "/api/client-auth/my-progress", body: { date: TODAY, weightKg: 68.04, adherence: 85, workoutsDone: 3, note: "Busy week" } });
});

test("weekly check-in: past check-ins show in the client's unit; every request carries the local date", async ({ page }) => {
  await mock(page, { units: "lb" });
  const dates: (string | undefined)[] = [];
  page.on("request", (r) => { if (r.url().includes("/my-progress")) dates.push(r.headers()["x-client-date"]); });
  await page.goto("/client/weekly");
  await expect(page.getByRole("region", { name: "Past check-ins" })).toContainText("180 lb");
  expect(dates[0]).toBe(TODAY);
});

test("weekly check-in needs something, and checks ranges", async ({ page }) => {
  const { sent } = await mock(page);
  await page.goto("/client/weekly");
  await page.getByRole("button", { name: "Send to my coach" }).click();
  await expect(page.getByRole("alert")).toHaveText("Fill in at least one thing.");
  await page.getByLabel("Plan followed (%)").fill("120");
  await page.getByRole("button", { name: "Send to my coach" }).click();
  await expect(page.getByRole("alert")).toContainText("from 0 to 100");
  expect(sent).toEqual([]);
});

test("a Nutrition plan shows the client's targets and the coach's meals with macros", async ({ page }) => {
  await mock(page);
  await page.goto("/client/plan/n1");
  await expect(page.getByRole("region", { name: "Daily targets" })).toContainText("2100 kcal · 140 g protein");
  const meals = page.getByRole("region", { name: "Meals" });
  await expect(meals.getByRole("listitem")).toHaveCount(2);
  await expect(meals).toContainText("Overnight oats");
  await expect(meals).toContainText("420 kcal · P 25g · C 55g · F 10g");
  await expect(meals).toContainText("1070 kcal · 75 g protein");
});

test("Me: choose the weekly check-in day", async ({ page }) => {
  const { sent } = await mock(page);
  await page.goto("/client/me");
  await page.getByRole("combobox", { name: "Weekly check-in day" }).selectOption("Wednesday");
  await expect(page.getByRole("region", { name: "Weekly check-in day" }).getByRole("status")).toHaveText("Saved.");
  expect(sent).toEqual([{ method: "PATCH", path: "/api/client-auth/me/profile", body: { weeklyCheckInDay: 3 } }]);
});

// ----- coach side -----
const CLIENT = { id: "c-maya", coachId: "coach-1", name: "Maya Patel", goal: "Fat loss", age: 29, weightKg: 68, heightCm: 165, level: "Intermediate", focus: "", notes: "", createdAt: "2026-10-01T00:00:00.000Z" };

test("coach: a Nutrition plan can carry meals from the library", async ({ page }) => {
  const posts: unknown[] = [];
  await page.route("**/api/**", (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (path === "/api/clients") return route.fulfill({ json: [CLIENT] });
    if (path === "/api/meals") return route.fulfill({ json: [
      { id: "m1", coachId: "coach-1", name: "Overnight oats", mealType: "Breakfast", calories: 420, proteinG: 25, carbsG: 55, fatG: 10, ingredients: "", steps: "", createdAt: "2026-11-01T00:00:00Z" },
      { id: "m2", coachId: "coach-1", name: "Chicken bowl", mealType: "Lunch", calories: 650, proteinG: 50, carbsG: 60, fatG: 18, ingredients: "", steps: "", createdAt: "2026-11-01T00:00:00Z" },
    ] });
    if (path === "/api/clients/c-maya/assignments" && req.method() === "POST") {
      posts.push(req.postDataJSON());
      return route.fulfill({ status: 201, json: { id: "a1", ...(req.postDataJSON() as object), clientId: "c-maya", coachId: "coach-1", reasoning: "", source: "manual", status: "Active", createdAt: "2026-11-12T00:00:00Z" } });
    }
    return route.fulfill({ json: [] });
  });
  await page.goto("/app");
  await openClientTab(page, "Plans");
  const form = page.getByRole("form", { name: "New assignment" });
  await form.getByRole("button", { name: "Nutrition" }).click();
  const picker = form.getByRole("group", { name: "Add meals from library (optional)" });
  await picker.getByRole("checkbox", { name: /Chicken bowl/ }).check();
  await picker.getByRole("checkbox", { name: /Overnight oats/ }).check();
  await expect(picker).toContainText("2 meals attached");
  await form.getByLabel("Title").fill("High-protein day");
  await form.getByLabel("Details").fill("Hit your protein.");
  await form.getByRole("button", { name: "Assign plan" }).click();
  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0]).toMatchObject({ type: "Nutrition", mealIds: ["m2", "m1"] });
  // Switching to Workout hides the picker.
  await form.getByRole("button", { name: "Workout" }).click();
  await expect(form.getByRole("group", { name: "Add meals from library (optional)" })).toHaveCount(0);
});

test("coach: save the macro result as the client's daily targets", async ({ page }) => {
  const patches: unknown[] = [];
  await page.route("**/api/**", (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (path === "/api/clients") return route.fulfill({ json: [CLIENT] });
    if (path === "/api/macros") return route.fulfill({ json: { bmr: 1400, tdee: 2100, calories: 1800, proteinG: 136, carbsG: 170, fatG: 60 } });
    if (path === "/api/clients/c-maya/targets") {
      patches.push(req.postDataJSON());
      return route.fulfill({ json: { ...CLIENT, calorieTarget: 1800, proteinTargetG: 136 } });
    }
    return route.fulfill({ json: [] });
  });
  await page.goto("/app");
  await openLibrary(page);
  const calc = page.getByRole("form", { name: "Macro calculator" });
  await calc.getByLabel("Client (optional)").selectOption("c-maya");
  await calc.getByLabel("Sex").selectOption("Female");
  await calc.getByLabel("Activity level").selectOption({ index: 2 });
  await calc.getByRole("button", { name: "Calculate" }).click();
  const result = page.getByRole("region", { name: "Macro result" });
  await result.getByRole("button", { name: "Save as Maya Patel's daily targets" }).click();
  await expect(result.getByRole("status")).toHaveText("Saved as Maya Patel's daily targets: 1800 kcal, 136 g protein.");
  expect(patches).toEqual([{ calorieTarget: 1800, proteinTargetG: 136 }]);
});
