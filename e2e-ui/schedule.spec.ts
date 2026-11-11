// Prompt 69: the Business tab's Schedule view (week view, add / edit / status / delete), the client's
// "My sessions", and today's appointments on Home. Mocked API. The browser runs in Asia/Kolkata (UTC+5:30)
// with the clock fixed to Thu 12 Nov 2026 11:30 local, so "stored in UTC, shown in local time" is checked for real.
import { expect, test, type Page } from "@playwright/test";

test.use({ timezoneId: "Asia/Kolkata", locale: "en-US" });

// Chrome may report the legacy alias for Kolkata.
const KOLKATA = /Asia\/(Kolkata|Calcutta)/;
const NOW = new Date("2026-11-12T06:00:00.000Z"); // Thu 12 Nov 2026, 11:30 in Kolkata

const ME = { id: "coach-1", name: "Ana", email: "ana@example.com", createdAt: "2026-11-01T00:00:00.000Z", currency: "INR" };
const client = (id: string, name: string) => ({
  id, coachId: "coach-1", name, goal: "Fat loss", age: 29, weightKg: 68, heightCm: 165, level: "Intermediate", focus: "", notes: "", createdAt: "2026-10-01T00:00:00.000Z",
});
const CLIENTS = [client("c-maya", "Maya Patel"), client("c-arjun", "Arjun Rao")];

type Appt = Record<string, unknown> & { id: string; startsAt: string; endsAt: string };
const appt = (over: Partial<Appt> = {}): Appt => ({
  id: "ap1",
  coachId: "coach-1",
  clientId: "c-maya",
  clientName: "Maya Patel",
  title: "Strength session",
  type: "Session",
  startsAt: "2026-11-12T04:30:00.000Z", // 10:00 AM in Kolkata
  endsAt: "2026-11-12T05:30:00.000Z",
  location: "",
  status: "Booked",
  note: "",
  createdAt: "2026-11-01T00:00:00.000Z",
  ...over,
});

/** A small fake server for appointments. */
async function mockSchedule(page: Page, initial: Appt[]) {
  await page.clock.setFixedTime(NOW);
  const state = { appts: structuredClone(initial), gets: [] as { from: string; to: string }[], posts: [] as Record<string, unknown>[], patches: [] as Record<string, unknown>[], deleted: [] as string[] };
  await page.route("**/api/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    if (path === "/api/auth/me") return route.fulfill({ json: ME });
    if (path === "/api/clients") return route.fulfill({ json: CLIENTS });
    if (path === "/api/appointments" && req.method() === "GET") {
      const from = url.searchParams.get("from")!;
      const to = url.searchParams.get("to")!;
      state.gets.push({ from, to });
      return route.fulfill({ json: state.appts.filter((a) => a.startsAt >= from && a.startsAt < to) });
    }
    if (path === "/api/appointments" && req.method() === "POST") {
      const body = req.postDataJSON() as Record<string, unknown>;
      state.posts.push(body);
      const c = CLIENTS.find((x) => x.id === body.clientId)!;
      const created = appt({ id: `ap-new-${state.posts.length}`, ...body, clientName: c.name, status: (body.status as string) ?? "Booked", location: (body.location as string) ?? "", note: (body.note as string) ?? "" } as Partial<Appt>);
      state.appts.push(created);
      return route.fulfill({ status: 201, json: created });
    }
    const one = /^\/api\/appointments\/([^/]+)$/.exec(path);
    if (one && req.method() === "PATCH") {
      const body = req.postDataJSON() as Record<string, unknown>;
      state.patches.push({ id: one[1], ...body });
      const row = state.appts.find((a) => a.id === one[1])!;
      Object.assign(row, body);
      return route.fulfill({ json: row });
    }
    if (one && req.method() === "DELETE") {
      state.deleted.push(one[1]);
      state.appts = state.appts.filter((a) => a.id !== one[1]);
      return route.fulfill({ status: 204 });
    }
    if (path === "/api/business/plans") return route.fulfill({ json: { currency: "INR", plans: [] } });
    if (path === "/api/review-queue") return route.fulfill({ json: { pendingCount: 0, items: [] } });
    return route.fulfill({ json: [] });
  });
  await page.goto("/app");
  await page.getByRole("tab", { name: "Business" }).click();
  await page.getByRole("group", { name: "Business view" }).getByRole("button", { name: "Schedule" }).click();
  await expect(page.getByRole("region", { name: "Schedule" })).toBeVisible();
  return state;
}

const day = (page: Page, name: string) => page.getByRole("group", { name });
const week = (page: Page) => page.getByRole("region", { name: "Schedule" });

test("Schedule lives inside the Business tab (no 10th tab); Payments stays the default view", async ({ page }) => {
  await mockSchedule(page, []);
  await expect(page.getByRole("tab")).toHaveText(["Home", "AI Coach", "Clients", "Manual Planner", "Progress", "Check-ins", "Library", "Messages", "Business"]);
  const view = page.getByRole("group", { name: "Business view" });
  await expect(view.getByRole("button", { name: "Payments" })).toHaveAttribute("aria-pressed", "false");
  await expect(view.getByRole("button", { name: "Schedule" })).toHaveAttribute("aria-pressed", "true");
  await view.getByRole("button", { name: "Payments" }).click();
  await expect(page.getByText("No plans yet.")).toBeVisible();
  await expect(week(page)).toHaveCount(0);
});

test("week view: 7 day columns Mon-Sun, today highlighted, times in the viewer's timezone", async ({ page }) => {
  const server = await mockSchedule(page, [appt()]);
  await expect(week(page)).toContainText("Nov 9 - Nov 15, 2026");
  // The note states the timezone handling.
  await expect(week(page)).toContainText(KOLKATA);
  await expect(week(page)).toContainText("stored in UTC");
  const days = week(page).getByRole("list", { name: "Week" }).getByRole("group");
  await expect(days).toHaveCount(7);
  await expect(days.first()).toHaveAccessibleName("Mon, Nov 9");
  await expect(days.last()).toHaveAccessibleName("Sun, Nov 15");
  // Today (Thu 12 Nov) is the only highlighted column.
  await expect(week(page).locator('[aria-current="date"]')).toHaveCount(1);
  await expect(day(page, "Thu, Nov 12")).toHaveAttribute("aria-current", "date");
  // 04:30 UTC is 10:00 AM in Kolkata, on Thursday.
  const block = day(page, "Thu, Nov 12").getByRole("listitem");
  await expect(block).toContainText(/10:00\sAM/);
  await expect(block).toContainText("Strength session");
  await expect(block).toContainText("Maya Patel");
  // The request for the week is the local week as UTC instants: Mon 00:00 IST = Sun 18:30 UTC.
  expect(server.gets[0]).toEqual({ from: "2026-11-08T18:30:00.000Z", to: "2026-11-15T18:30:00.000Z" });
});

test("appointment blocks use the type colours", async ({ page }) => {
  await mockSchedule(page, [
    appt({ id: "a1", type: "Session", title: "S" }),
    appt({ id: "a2", type: "Call", title: "C", startsAt: "2026-11-12T07:00:00.000Z", endsAt: "2026-11-12T07:30:00.000Z" }),
    appt({ id: "a3", type: "Check-in review", title: "R", startsAt: "2026-11-12T08:00:00.000Z", endsAt: "2026-11-12T08:30:00.000Z" }),
    appt({ id: "a4", type: "Other", title: "O", startsAt: "2026-11-12T09:00:00.000Z", endsAt: "2026-11-12T09:30:00.000Z" }),
  ]);
  const blocks = day(page, "Thu, Nov 12").getByRole("listitem");
  await expect(blocks).toHaveCount(4);
  // Each block names its type, so it can be found by it.
  const ofType = (type: string) => blocks.filter({ hasText: type });
  await expect(ofType("Session")).toHaveCSS("border-left-color", "rgb(255, 74, 31)"); // workout orange
  await expect(ofType("Call")).toHaveCSS("border-left-color", "rgb(14, 124, 107)"); // nutrition teal
  await expect(ofType("Check-in review")).toHaveCSS("border-left-color", "rgb(124, 92, 252)"); // recovery violet
  await expect(ofType("Other")).toHaveCSS("border-left-color", "rgb(217, 119, 6)"); // habit amber
});

test("previous / next week and back to today", async ({ page }) => {
  const server = await mockSchedule(page, [appt(), appt({ id: "far", title: "Next week call", type: "Call", startsAt: "2026-11-17T04:30:00.000Z", endsAt: "2026-11-17T05:00:00.000Z" })]);
  await week(page).getByRole("button", { name: "Next week" }).click();
  await expect(week(page)).toContainText("Nov 16 - Nov 22, 2026");
  await expect(week(page)).toContainText("Next week call");
  await expect(week(page)).not.toContainText("Strength session");
  // No highlighted day in a week that does not contain today.
  await expect(week(page).locator('[aria-current="date"]')).toHaveCount(0);
  await week(page).getByRole("button", { name: "Previous week" }).click();
  await week(page).getByRole("button", { name: "Previous week" }).click();
  await expect(week(page)).toContainText("Nov 2 - Nov 8, 2026");
  await expect(week(page)).toContainText("No appointments this week.");
  await week(page).getByRole("button", { name: "This week" }).click();
  await expect(week(page)).toContainText("Nov 9 - Nov 15, 2026");
  await expect(week(page)).toContainText("Strength session");
  expect(server.gets.some((g) => g.from === "2026-11-15T18:30:00.000Z")).toBe(true);
});

test("add: local times are sent as UTC", async ({ page }) => {
  const server = await mockSchedule(page, []);
  await week(page).getByRole("button", { name: "Add appointment" }).click();
  const form = page.getByRole("form", { name: "Add appointment" });
  await expect(form.getByLabel("Client").locator("option")).toHaveText(["Maya Patel", "Arjun Rao"]);
  await form.getByLabel("Client").selectOption({ label: "Arjun Rao" });
  await form.getByLabel("Title").fill("Form check call");
  await form.getByLabel("Type").selectOption("Call");
  await form.getByLabel("Starts").fill("2026-11-13T09:00");
  await form.getByLabel("Ends").fill("2026-11-13T09:45");
  await form.getByLabel("Location or link").fill("https://meet.example/abc");
  await form.getByLabel("Note").fill("Bring last week's log");
  await form.getByRole("button", { name: "Save appointment" }).click();
  await expect(form).toHaveCount(0);
  expect(server.posts[0]).toMatchObject({
    clientId: "c-arjun",
    title: "Form check call",
    type: "Call",
    startsAt: "2026-11-13T03:30:00.000Z", // 09:00 IST
    endsAt: "2026-11-13T04:15:00.000Z",
    location: "https://meet.example/abc",
    note: "Bring last week's log",
  });
  const block = day(page, "Fri, Nov 13").getByRole("listitem");
  await expect(block).toContainText("Form check call");
  await expect(block).toContainText(/9:00\sAM/);
});

test("the form refuses an end before the start, in plain words, without calling the server", async ({ page }) => {
  const server = await mockSchedule(page, []);
  await week(page).getByRole("button", { name: "Add appointment" }).click();
  const form = page.getByRole("form", { name: "Add appointment" });
  await form.getByLabel("Title").fill("Backwards");
  await form.getByLabel("Starts").fill("2026-11-13T10:00");
  await form.getByLabel("Ends").fill("2026-11-13T09:00");
  await form.getByRole("button", { name: "Save appointment" }).click();
  await expect(form.getByRole("alert")).toContainText("The end time must be after the start time.");
  expect(server.posts).toHaveLength(0);
});

test("edit: the form shows local times and PATCHes UTC", async ({ page }) => {
  const server = await mockSchedule(page, [appt()]);
  await day(page, "Thu, Nov 12").getByRole("button", { name: "Edit Strength session" }).click();
  const form = page.getByRole("form", { name: "Edit appointment" });
  await expect(form.getByLabel("Starts")).toHaveValue("2026-11-12T10:00");
  await expect(form.getByLabel("Ends")).toHaveValue("2026-11-12T11:00");
  await form.getByLabel("Title").fill("Strength + mobility");
  await form.getByLabel("Starts").fill("2026-11-12T11:00");
  await form.getByLabel("Ends").fill("2026-11-12T12:00");
  await form.getByRole("button", { name: "Save appointment" }).click();
  await expect(form).toHaveCount(0);
  expect(server.patches[0]).toMatchObject({ id: "ap1", title: "Strength + mobility", startsAt: "2026-11-12T05:30:00.000Z", endsAt: "2026-11-12T06:30:00.000Z" });
  await expect(day(page, "Thu, Nov 12").getByRole("listitem")).toContainText("Strength + mobility");
});

test("status can be changed from the block", async ({ page }) => {
  const server = await mockSchedule(page, [appt()]);
  const block = day(page, "Thu, Nov 12").getByRole("listitem");
  await block.getByLabel("Status for Strength session").selectOption("No-show");
  await expect.poll(() => server.patches.length).toBe(1);
  expect(server.patches[0]).toEqual({ id: "ap1", status: "No-show" });
  await expect(block.getByLabel("Status for Strength session")).toHaveValue("No-show");
});

test("delete asks first; Cancel keeps it, Delete removes it", async ({ page }) => {
  const server = await mockSchedule(page, [appt()]);
  const block = day(page, "Thu, Nov 12").getByRole("listitem");
  await block.getByRole("button", { name: "Delete Strength session" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Delete this appointment?");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(block).toHaveCount(1);
  expect(server.deleted).toEqual([]);
  await block.getByRole("button", { name: "Delete Strength session" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await expect(block).toHaveCount(0);
  expect(server.deleted).toEqual(["ap1"]);
});

test("client /client shows My sessions: their own upcoming sessions in local time, read-only, no note", async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/client-auth/me") return route.fulfill({ json: { id: "c-maya", name: "Maya Patel", loginEmail: "maya@example.com" } });
    if (path === "/api/client-auth/my-plan") return route.fulfill({ json: { plan: null, lastPaymentDate: null } });
    if (path === "/api/client-auth/my-sessions") {
      return route.fulfill({
        json: {
          sessions: [
            { id: "s1", title: "Strength session", type: "Session", startsAt: "2026-11-13T04:30:00.000Z", endsAt: "2026-11-13T05:30:00.000Z", location: "Gym 2" },
            { id: "s2", title: "Form check", type: "Call", startsAt: "2026-11-16T10:00:00.000Z", endsAt: "2026-11-16T10:30:00.000Z", location: "" },
          ],
        },
      });
    }
    return route.fulfill({ status: 401, json: { error: "You are not signed in." } });
  });
  await page.goto("/client");
  const mine = page.getByRole("region", { name: "My sessions" });
  const rows = mine.getByRole("listitem");
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText("Strength session");
  await expect(rows.first()).toContainText("Fri, Nov 13");
  await expect(rows.first()).toContainText(/10:00\sAM/);
  await expect(rows.first()).toContainText("Gym 2");
  await expect(rows.last()).toContainText(/3:30\sPM/); // 10:00 UTC
  await expect(mine.getByRole("button")).toHaveCount(0);
  await expect(mine.getByRole("link")).toHaveCount(0);
  await expect(mine).toContainText(KOLKATA);
});

test("client with no sessions sees a plain note", async ({ page }) => {
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/client-auth/me") return route.fulfill({ json: { id: "c-maya", name: "Maya Patel", loginEmail: "maya@example.com" } });
    if (path === "/api/client-auth/my-plan") return route.fulfill({ json: { plan: null, lastPaymentDate: null } });
    if (path === "/api/client-auth/my-sessions") return route.fulfill({ json: { sessions: [] } });
    return route.fulfill({ status: 401, json: { error: "You are not signed in." } });
  });
  await page.goto("/client");
  await expect(page.getByRole("region", { name: "My sessions" })).toContainText("No upcoming sessions.");
});

test("Home: today's appointments are the first rows of Today's Tasks, in local time", async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  const seen: string[] = [];
  await page.route("**/api/**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/auth/me") return route.fulfill({ json: ME });
    if (url.pathname === "/api/clients") return route.fulfill({ json: CLIENTS });
    if (url.pathname === "/api/tasks/today") {
      seen.push(url.search);
      return route.fulfill({
        json: {
          date: "2026-11-12",
          tasks: [
            { kind: "appointment", clientId: "c-maya", clientName: "Maya Patel", appointmentId: "ap1", appointmentType: "Session", startsAt: "2026-11-12T04:30:00.000Z", endsAt: "2026-11-12T05:30:00.000Z", text: "Session: Strength session" },
            { kind: "due", clientId: "c-arjun", clientName: "Arjun Rao", assignmentId: "as1", assignmentType: "Workout", text: "Workout due today: Squat day" },
          ],
        },
      });
    }
    if (url.pathname === "/api/review-queue") return route.fulfill({ json: { pendingCount: 0, items: [] } });
    if (url.pathname === "/api/checkins/recent") return route.fulfill({ json: { items: [] } });
    if (url.pathname === "/api/at-risk") return route.fulfill({ json: { date: "2026-11-12", clients: [] } });
    if (url.pathname === "/api/weekly-summary") return route.fulfill({ json: { weekStart: "2026-11-09", summary: null } });
    return route.fulfill({ status: 404, json: { error: "Not found" } });
  });
  await page.goto("/app");
  await page.getByRole("tab", { name: "Home" }).click();
  const rows = page.getByRole("list", { name: "Today's tasks" }).getByRole("listitem");
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText("Maya Patel");
  await expect(rows.first()).toContainText("Session: Strength session");
  await expect(rows.first()).toContainText(/10:00\sAM - 11:00\sAM/);
  await expect(rows.last()).toContainText("Squat day");
  // The browser tells the server its timezone offset so "today" is the coach's local day (Kolkata = -330).
  expect(seen[0]).toContain("tz=-330");
});
