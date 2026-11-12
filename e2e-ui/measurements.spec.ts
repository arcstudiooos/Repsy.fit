// Body measurements (Prompt 56), a section of the Check-ins tab. Every /api call is mocked, with a
// small fake server that keeps the measurements so the table and chart react like the real ones.
import { expect, test, type Page, openClientTab } from "./fixtures";

const CLIENTS = [
  { id: "c-maya", coachId: null, name: "Maya Patel", goal: "Fat loss", age: 29, weightKg: 68, heightCm: 165, level: "Intermediate", focus: "", notes: "", createdAt: "2026-10-01T00:00:00.000Z" },
];

type M = {
  id: string;
  coachId: string;
  clientId: string;
  date: string;
  waistCm: number | null;
  chestCm: number | null;
  armCm: number | null;
  hipCm: number | null;
  bodyFatPercent: number | null;
  note: string;
  createdAt: string;
};
const m = (id: string, date: string, over: Partial<M> = {}): M => ({
  id,
  coachId: "coach-1",
  clientId: "c-maya",
  date,
  waistCm: null,
  chestCm: null,
  armCm: null,
  hipCm: null,
  bodyFatPercent: null,
  note: "",
  createdAt: `${date}T08:00:00.000Z`,
  ...over,
});
const progress = (id: string, date: string, weightKg: number | null) => ({
  id,
  coachId: "coach-1",
  clientId: "c-maya",
  date,
  weightKg,
  adherence: null,
  workoutsDone: null,
  note: "",
  createdAt: `${date}T08:00:00.000Z`,
});

async function openTab(page: Page, initial: M[] = [], logs: ReturnType<typeof progress>[] = []) {
  const items = [...initial];
  const calls: string[] = [];
  await page.route("**/api/**", (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    const method = req.method();
    if (path === "/api/clients") return route.fulfill({ json: CLIENTS });
    if (path === "/api/review-queue") return route.fulfill({ json: { pendingCount: 0, items: [] } });
    if (path === "/api/clients/c-maya/checkins") return route.fulfill({ json: [] });
    if (path === "/api/clients/c-maya/habits") return route.fulfill({ json: { date: "2026-11-11", days: [], habits: [] } });
    if (path === "/api/clients/c-maya/progress") return route.fulfill({ json: logs });
    if (path === "/api/clients/c-maya/measurements") {
      if (method === "POST") {
        const body = req.postDataJSON() as Partial<M> & { date: string };
        if (body.bodyFatPercent !== undefined && body.bodyFatPercent !== null && body.bodyFatPercent >= 100) {
          return route.fulfill({ status: 400, json: { error: "bodyFatPercent must be more than 0 and at most 75." } });
        }
        const created = m(`m${items.length + 1}`, body.date, {
          waistCm: body.waistCm ?? null,
          chestCm: body.chestCm ?? null,
          armCm: body.armCm ?? null,
          hipCm: body.hipCm ?? null,
          bodyFatPercent: body.bodyFatPercent ?? null,
          note: body.note ?? "",
        });
        items.push(created);
        calls.push(`POST ${JSON.stringify(body)}`);
        return route.fulfill({ status: 201, json: created });
      }
      const newestFirst = [...items].sort((a, b) => b.date.localeCompare(a.date));
      return route.fulfill({ json: newestFirst });
    }
    const del = path.match(/^\/api\/clients\/c-maya\/measurements\/([^/]+)$/);
    if (del && method === "DELETE") {
      const i = items.findIndex((x) => x.id === del[1]);
      if (i >= 0) items.splice(i, 1);
      calls.push(`DELETE ${del[1]}`);
      return route.fulfill({ status: 204, body: "" });
    }
    return route.fulfill({ status: 404, json: { error: "Not found" } });
  });
  await page.goto("/app");
  await openClientTab(page, "Check-ins");
  await expect(page.getByRole("heading", { level: 2, name: "Check-ins" })).toBeVisible();
  return { items, calls, section: page.getByRole("region", { name: "Body measurements" }) };
}

test("lists measurements newest first in a table", async ({ page }) => {
  const { section } = await openTab(page, [
    m("m1", "2026-10-01", { waistCm: 84, bodyFatPercent: 20 }),
    m("m2", "2026-11-01", { waistCm: 82, armCm: 34.5, note: "after holiday" }),
  ]);
  const rows = section.getByRole("table", { name: "Measurements" }).getByRole("row");
  await expect(rows).toHaveCount(3); // header + 2
  await expect(rows.nth(1)).toContainText("2026-11-01");
  await expect(rows.nth(1)).toContainText("82");
  await expect(rows.nth(1)).toContainText("34.5");
  await expect(rows.nth(1)).toContainText("after holiday");
  await expect(rows.nth(2)).toContainText("2026-10-01");
  await expect(rows.nth(2)).toContainText("20");
});

test("adds a measurement with the exact API field names", async ({ page }) => {
  const { section, calls } = await openTab(page);
  await expect(section.getByText("No measurements yet")).toBeVisible();
  await section.getByLabel("Measurement date").fill("2026-11-10");
  await section.getByLabel("Waist (cm)").fill("81.5");
  await section.getByLabel("Body fat (%)").fill("19");
  await section.getByLabel("Measurement note").fill("morning");
  await section.getByRole("button", { name: "Add measurement" }).click();
  await expect(section.getByRole("table", { name: "Measurements" }).getByRole("row")).toHaveCount(2);
  expect(calls).toEqual([`POST ${JSON.stringify({ date: "2026-11-10", waistCm: 81.5, bodyFatPercent: 19, note: "morning" })}`]);
});

test("asks for at least one value, and shows the server's plain-words error", async ({ page }) => {
  const { section, calls } = await openTab(page);
  await section.getByRole("button", { name: "Add measurement" }).click();
  await expect(section.getByRole("alert")).toContainText("Enter at least one measurement");
  expect(calls).toEqual([]);
  await section.getByLabel("Body fat (%)").fill("120");
  await section.getByRole("button", { name: "Add measurement" }).click();
  await expect(section.getByRole("alert")).toContainText("bodyFatPercent must be more than 0 and at most 75.");
});

test("delete asks first; Cancel keeps it, Delete removes it", async ({ page }) => {
  const { section, calls } = await openTab(page, [m("m1", "2026-11-01", { waistCm: 82 })]);
  await section.getByRole("button", { name: "Delete measurement 2026-11-01" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Delete this measurement?");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(section.getByRole("table", { name: "Measurements" }).getByRole("row")).toHaveCount(2);
  expect(calls).toEqual([]);

  await section.getByRole("button", { name: "Delete measurement 2026-11-01" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await expect(section.getByText("No measurements yet")).toBeVisible();
  expect(calls).toEqual(["DELETE m1"]);
});

test("the chart dropdown picks the measurement; weight comes from progress logs", async ({ page }) => {
  const { section } = await openTab(
    page,
    [m("m1", "2026-10-01", { waistCm: 84, armCm: 33 }), m("m2", "2026-11-01", { waistCm: 82, armCm: 34 })],
    [progress("p1", "2026-10-01", 70), progress("p2", "2026-11-01", 68.5)],
  );
  const picker = section.getByLabel("Chart");
  await expect(picker.locator("option")).toHaveText(["Weight (kg)", "Waist (cm)", "Chest (cm)", "Arm (cm)", "Hip (cm)", "Body fat (%)"]);
  await picker.selectOption({ label: "Waist (cm)" });
  await expect(section.getByRole("img", { name: "Waist (cm) over time" })).toBeVisible();
  await picker.selectOption({ label: "Weight (kg)" });
  await expect(section.getByRole("img", { name: "Weight (kg) over time" })).toBeVisible();
  await picker.selectOption({ label: "Hip (cm)" });
  await expect(section.getByText("No hip values logged yet")).toBeVisible();
});

test("weight is not offered when the client has no progress weight", async ({ page }) => {
  const { section } = await openTab(page, [m("m1", "2026-11-01", { waistCm: 82 })], [progress("p1", "2026-11-01", null)]);
  await expect(section.getByLabel("Chart").locator("option").first()).toHaveText("Waist (cm)");
  await expect(section.getByLabel("Chart").locator("option", { hasText: "Weight" })).toHaveCount(0);
});
