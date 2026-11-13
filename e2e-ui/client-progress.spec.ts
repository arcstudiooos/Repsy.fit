// Prompt 81: the client's Progress tab - charts from their own check-ins in their unit, empty states,
// measurements (add; delete only their own), the streak summary, and nothing coach-only.
import { expect, test, type Page } from "@playwright/test";

const pad = (n: number) => String(n).padStart(2, "0");
const TODAY = (() => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; })();

type M = { id: string; date: string; waistCm: number | null; chestCm: number | null; armCm: number | null; hipCm: number | null; bodyFatPercent: number | null; note: string; createdBy: "coach" | "client"; createdAt: string };

async function mock(page: Page, opts: { units?: "kg" | "lb"; logs?: unknown[]; measurements?: M[] } = {}) {
  const sent: { method: string; path: string; body: unknown }[] = [];
  let measurements: M[] = opts.measurements ?? [];
  await page.route("**/api/**", (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    const body = req.postData() ? req.postDataJSON() : undefined;
    if (req.method() !== "GET") sent.push({ method: req.method(), path, body });
    if (path === "/api/client-auth/me") return route.fulfill({ json: { id: "c1", name: "Maya Patel", loginEmail: "maya@example.com", joinStatus: "active", coachName: "Anna Rivers", needsWelcome: false } });
    if (path === "/api/client-auth/me/profile") return route.fulfill({ json: { goal: "Fat loss", age: 29, heightCm: 165, weightKg: 68, level: "Beginner", units: opts.units ?? "kg", injuries: "", weeklyCheckInDay: 0 } });
    if (path === "/api/client-auth/my-progress") return route.fulfill({ json: opts.logs ?? [] });
    if (path === "/api/client-auth/my-measurements" && req.method() === "GET") return route.fulfill({ json: measurements });
    if (path === "/api/client-auth/my-measurements" && req.method() === "POST") {
      const m = { id: `n${measurements.length}`, createdBy: "client" as const, createdAt: new Date().toISOString(), ...(body as Omit<M, "id" | "createdBy" | "createdAt">) };
      measurements = [m, ...measurements];
      return route.fulfill({ status: 201, json: m });
    }
    const del = path.match(/^\/api\/client-auth\/my-measurements\/(.+)$/);
    if (del) {
      measurements = measurements.filter((m) => m.id !== del[1]);
      return route.fulfill({ status: 204, body: "" });
    }
    if (path === "/api/client-auth/my-streaks") return route.fulfill({ json: { date: TODAY, checkInStreak: 3, habitPercent: 80, workoutsThisWeek: 2, enoughData: true } });
    return route.fulfill({ status: 404, json: { error: "Not found" } });
  });
  return { sent };
}

const LOGS = [
  { id: "l1", date: "2026-10-20", weightKg: 70, adherence: 70, workoutsDone: 3, note: "", createdAt: "2026-10-20T00:00:00Z" },
  { id: "l2", date: "2026-10-27", weightKg: 69.5, adherence: 85, workoutsDone: 4, note: "", createdAt: "2026-10-27T00:00:00Z" },
  { id: "l3", date: "2026-11-03", weightKg: 68.9, adherence: 90, workoutsDone: 4, note: "", createdAt: "2026-11-03T00:00:00Z" },
];

test("the Progress tab is in the client app's tabs and opens the page", async ({ page }) => {
  await mock(page, { logs: LOGS });
  await page.goto("/client");
  await page.getByRole("navigation", { name: "Client app", exact: true }).getByRole("link", { name: "Progress" }).click();
  await expect(page).toHaveURL(/\/client\/progress$/);
  await expect(page.getByRole("heading", { level: 1, name: "Progress" })).toBeVisible();
  await expect(page).toHaveTitle("Progress - Repsy");
});

test("weight and adherence charts from the client's own check-ins, in kg; no coach-only chart", async ({ page }) => {
  await mock(page, { logs: LOGS });
  await page.goto("/client/progress");
  await expect(page.getByRole("figure", { name: "Weight" }).locator("svg.recharts-surface")).toBeVisible();
  await expect(page.getByRole("figure", { name: "Adherence" }).locator("svg.recharts-surface")).toBeVisible();
  await expect(page.getByRole("figure", { name: "Weight" })).toContainText("kg");
  await expect(page.getByRole("figure", { name: "Assignments by type" })).toHaveCount(0);
  await expect(page.getByText(/at risk|engagement|private note/i)).toHaveCount(0);
});

test("weight shows in lb for a client who picked lb", async ({ page }) => {
  await mock(page, { logs: LOGS, units: "lb" });
  await page.goto("/client/progress");
  const fig = page.getByRole("figure", { name: "Weight" });
  await expect(fig.locator("svg.recharts-surface")).toBeVisible();
  await expect(fig).toContainText("(lb)");
  // 68.9-70 kg = 151.9-154.3 lb, so the axis runs around 150 (never around 70).
  await expect(fig.locator(".recharts-yAxis .recharts-cartesian-axis-tick-value").first()).toHaveText(/^1[45]\d(\.\d)?$/);
});

test("empty states: no check-ins yet, one check-in only, no measurements", async ({ page }) => {
  await mock(page);
  await page.goto("/client/progress");
  await expect(page.getByText(/No check-ins yet/)).toBeVisible();
  await expect(page.getByText("No measurements yet.")).toBeVisible();
  await page.unroute("**/api/**");
  await mock(page, { logs: LOGS.slice(0, 1) });
  await page.reload();
  await expect(page.getByRole("figure", { name: "Weight" })).toContainText("Add one more check-in to see the trend.");
});

test("add measurements; delete only the ones the client added", async ({ page }) => {
  const coachOne: M = { id: "cm1", date: "2026-11-01", waistCm: 84, chestCm: null, armCm: null, hipCm: null, bodyFatPercent: 24, note: "", createdBy: "coach", createdAt: "2026-11-01T00:00:00Z" };
  const { sent } = await mock(page, { measurements: [coachOne] });
  await page.goto("/client/progress");
  const list = page.getByRole("list", { name: "Measurements" });
  await expect(list.getByRole("listitem")).toHaveCount(1);
  await expect(list).toContainText("Added by your coach");
  await expect(list.getByRole("button", { name: /Delete/ })).toHaveCount(0);

  await page.getByRole("button", { name: "Add measurements" }).click();
  const form = page.getByRole("form", { name: "Add measurements" });
  await expect(form.getByLabel("Date")).toBeFocused();
  await form.getByRole("button", { name: "Save measurements" }).click();
  await expect(form.getByRole("alert")).toHaveText("Enter at least one measurement.");
  await form.getByLabel("Body fat (%)").fill("90");
  await form.getByRole("button", { name: "Save measurements" }).click();
  await expect(form.getByRole("alert")).toHaveText("Body fat (%): more than 0 and at most 75.");
  await expect(form.getByLabel("Body fat (%)")).toHaveAttribute("aria-invalid", "true");
  await form.getByLabel("Body fat (%)").fill("22.5");
  await form.getByLabel("Waist (cm)").fill("81");
  await form.getByRole("button", { name: "Save measurements" }).click();
  await expect(form).toHaveCount(0);
  expect(sent[0]).toEqual({ method: "POST", path: "/api/client-auth/my-measurements", body: { date: TODAY, waistCm: 81, chestCm: null, armCm: null, hipCm: null, bodyFatPercent: 22.5, note: "" } });
  await expect(list.getByRole("listitem")).toHaveCount(2);

  await expect(page.getByRole("status")).toHaveText("Measurements saved.");
  await expect(page.getByRole("button", { name: "Add measurements" })).toBeFocused();
  await list.getByRole("button", { name: `Delete measurements from ${TODAY}: Waist 81 cm · Body fat 22.5 %` }).click();
  const dialog = page.getByRole("dialog", { name: "Delete these measurements?" });
  await expect(dialog).toContainText("Waist 81 cm");
  await dialog.getByRole("button", { name: "Delete" }).click();
  await expect(list.getByRole("listitem")).toHaveCount(1);
  expect(sent[1]).toMatchObject({ method: "DELETE", path: "/api/client-auth/my-measurements/n1" });
});

test("the streak summary is on the Progress tab", async ({ page }) => {
  await mock(page, { logs: LOGS });
  await page.goto("/client/progress");
  await expect(page.getByRole("region", { name: "My streaks" })).toBeVisible();
});

test("if the unit setting can't load, the charts aren't drawn in the wrong unit", async ({ page }) => {
  await mock(page, { logs: LOGS });
  await page.route("**/api/client-auth/me/profile", (r) => r.fulfill({ status: 500, json: { error: "Something went wrong." } }));
  await page.goto("/client/progress");
  // (React Query retries a failed request a few times first.)
  await expect(page.getByRole("region", { name: "Charts" }).getByRole("alert")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("figure", { name: "Weight" })).toHaveCount(0);
});
