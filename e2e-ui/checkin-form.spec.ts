// Weekly check-in form (Prompt 28). Every /api call is mocked in the browser; the mock stores
// POSTed logs and supports DELETE, like the server.
import { expect, test, type Page, type Route } from "@playwright/test";

const CLIENTS = [
  {
    id: "c-maya",
    coachId: "default-coach",
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

type Log = Record<string, unknown> & { id: string; date: string };

function localDate(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const START: Log[] = [
  { id: "l1", date: localDate(-14), weightKg: 68.4, adherence: 72, workoutsDone: 3, note: "" },
  { id: "l2", date: localDate(-7), weightKg: 67.8, adherence: 81, workoutsDone: 4, note: "" },
];

type Mock = { logs: Log[]; posts: Record<string, unknown>[]; holdPost: boolean; release?: () => void };

async function mockApi(page: Page, logs: Log[] = START): Promise<Mock> {
  const mock: Mock = { logs: [...logs], posts: [], holdPost: false };
  let next = 100;
  await page.route("**/api/**", async (route: Route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (req.method() === "GET" && path === "/api/clients") return route.fulfill({ json: CLIENTS });
    if (req.method() === "GET" && /\/chat$/.test(path)) return route.fulfill({ json: [] });
    if (req.method() === "GET" && /\/assignments$/.test(path)) return route.fulfill({ json: [] });
    if (path === "/api/clients/c-maya/progress") {
      if (req.method() === "GET") {
        const sorted = [...mock.logs].sort((a, b) => a.date.localeCompare(b.date));
        return route.fulfill({
          json: sorted.map((l) => ({ coachId: "default-coach", clientId: "c-maya", createdAt: `${l.date}T09:00:00.000Z`, note: "", weightKg: null, adherence: null, workoutsDone: null, ...l })),
        });
      }
      if (req.method() === "POST") {
        const body = req.postDataJSON() as Record<string, unknown>;
        mock.posts.push(body);
        if (mock.holdPost) await new Promise<void>((r) => (mock.release = r));
        const saved = { id: `n${next++}`, note: "", ...body } as Log;
        mock.logs.push(saved);
        return route.fulfill({ status: 201, json: { coachId: "default-coach", clientId: "c-maya", createdAt: new Date().toISOString(), ...saved } });
      }
    }
    const del = path.match(/^\/api\/clients\/c-maya\/progress\/([^/]+)$/);
    if (del && req.method() === "DELETE") {
      mock.logs = mock.logs.filter((l) => l.id !== del[1]);
      return route.fulfill({ status: 204, body: "" });
    }
    return route.fulfill({ status: 404, json: { error: "Not found" } });
  });
  return mock;
}

const panel = (page: Page) => page.getByRole("tabpanel");
const form = (page: Page) => panel(page).getByRole("form", { name: "Weekly check-in" });
const field = (page: Page, label: string) => form(page).getByLabel(label, { exact: true });
const submit = (page: Page) => form(page).getByRole("button", { name: "Add check-in" });
const checkIns = (page: Page) => panel(page).getByRole("list", { name: "Check-ins" }).getByRole("listitem");
const weightCard = (page: Page) => panel(page).getByRole("group", { name: "Current weight" });
const weightDots = (page: Page) => panel(page).getByRole("figure", { name: "Weight" }).locator(".recharts-line-dots circle");
const openProgress = async (page: Page) => {
  await page.goto("/app");
  await page.getByRole("tab", { name: "Progress" }).click();
};

test("the form sits under the charts with today's date and the default values", async ({ page }) => {
  await mockApi(page);
  await openProgress(page);
  await expect(field(page, "Date")).toHaveValue(localDate());
  await expect(field(page, "Weight kg")).toHaveValue("");
  await expect(field(page, "Adherence %")).toHaveValue("85");
  await expect(field(page, "Workouts done")).toHaveValue("4");
  await expect(field(page, "Note")).toHaveAttribute("placeholder", "e.g. Solid week, sleep better");
  const charts = (await panel(page).getByRole("figure", { name: "Assignments by type" }).boundingBox())!;
  expect((await form(page).boundingBox())!.y).toBeGreaterThan(charts.y);
});

test("a new weight updates the card, chart and list without a refresh; deleting it reverts them", async ({ page }) => {
  const mock = await mockApi(page);
  await openProgress(page);
  await expect(weightCard(page)).toContainText("67.8 kg");
  await expect(weightDots(page)).toHaveCount(2);

  await field(page, "Weight kg").fill("66.9");
  await field(page, "Note").fill("Solid week");
  await submit(page).click();

  await expect(weightCard(page)).toContainText("66.9 kg");
  await expect(weightDots(page)).toHaveCount(3);
  await expect(checkIns(page).nth(0)).toContainText(localDate());
  await expect(checkIns(page).nth(0)).toContainText("66.9 kg");
  await expect(checkIns(page).nth(0)).toContainText("Solid week");
  expect(mock.posts).toEqual([{ date: localDate(), weightKg: 66.9, adherence: 85, workoutsDone: 4, note: "Solid week" }]);

  await checkIns(page).nth(0).getByRole("button", { name: `Delete check-in ${localDate()}` }).click();
  await expect(weightCard(page)).toContainText("67.8 kg");
  await expect(weightDots(page)).toHaveCount(2);
  await expect(checkIns(page)).toHaveCount(2);
});

test("weight is optional: an empty weight is not sent", async ({ page }) => {
  const mock = await mockApi(page);
  await openProgress(page);
  await submit(page).click();
  await expect.poll(() => mock.posts.length).toBe(1);
  expect(mock.posts[0]).toEqual({ date: localDate(), adherence: 85, workoutsDone: 4, note: "" });
});

test("adherence outside 0-100 shows the plain message and can't be submitted", async ({ page }) => {
  const mock = await mockApi(page);
  await openProgress(page);
  await field(page, "Adherence %").fill("120");
  await expect(form(page)).toContainText("Adherence must be a whole number between 0 and 100");
  await expect(submit(page)).toBeDisabled();
  await field(page, "Adherence %").fill("-5");
  await expect(form(page)).toContainText("Adherence must be a whole number between 0 and 100");
  await field(page, "Adherence %").fill("90");
  await expect(form(page)).not.toContainText("Adherence must be a whole number between 0 and 100");
  await expect(submit(page)).toBeEnabled();
  expect(mock.posts).toHaveLength(0);
});

test("a future date is flagged but still allowed", async ({ page }) => {
  const mock = await mockApi(page);
  await openProgress(page);
  await field(page, "Date").fill(localDate(3));
  await expect(form(page)).toContainText("This date is in the future - is that right?");
  await expect(submit(page)).toBeEnabled();
  await submit(page).click();
  await expect.poll(() => mock.posts.length).toBe(1);
  expect(mock.posts[0].date).toBe(localDate(3));
});

test("the button is disabled while saving", async ({ page }) => {
  const mock = await mockApi(page);
  mock.holdPost = true;
  await openProgress(page);
  await submit(page).click();
  await expect(form(page).getByRole("button", { name: "Saving..." })).toBeDisabled();
  await expect.poll(() => mock.posts.length).toBe(1);
  mock.release!();
  await expect(submit(page)).toBeEnabled();
  expect(mock.posts).toHaveLength(1);
});

test("with no logs yet, the first check-in replaces the empty card", async ({ page }) => {
  await mockApi(page, []);
  await openProgress(page);
  await expect(panel(page)).toContainText("No progress logged yet. Add the first weekly check-in below.");
  await field(page, "Weight kg").fill("70");
  await submit(page).click();
  await expect(weightCard(page)).toContainText("70 kg");
  await expect(panel(page)).not.toContainText("No progress logged yet");
});

test("decimal adherence, workouts outside 0-14, weight 0 and an empty date are caught in plain words", async ({ page }) => {
  const mock = await mockApi(page);
  await openProgress(page);
  await field(page, "Adherence %").fill("85.5");
  await expect(form(page)).toContainText("Adherence must be a whole number between 0 and 100");
  await field(page, "Adherence %").fill("85");
  await field(page, "Workouts done").fill("15");
  await expect(form(page)).toContainText("Workouts must be a whole number between 0 and 14");
  await expect(submit(page)).toBeDisabled();
  await field(page, "Workouts done").fill("4");
  await field(page, "Weight kg").fill("0");
  await expect(form(page)).toContainText("Weight must be more than 0 kg");
  await expect(submit(page)).toBeDisabled();
  await field(page, "Weight kg").fill("70");
  await field(page, "Date").fill("");
  await expect(form(page)).toContainText("Pick a date for this check-in");
  await expect(submit(page)).toBeDisabled();
  expect(mock.posts).toHaveLength(0);
});

test("the future-date warning is announced and linked to the date field", async ({ page }) => {
  await mockApi(page);
  await openProgress(page);
  await field(page, "Date").fill(localDate(3));
  const note = form(page).getByRole("status");
  await expect(note).toHaveText("This date is in the future - is that right?");
  await expect(field(page, "Date")).toHaveAttribute("aria-describedby", (await note.getAttribute("id"))!);
});
