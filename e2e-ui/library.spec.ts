// Library tab and workout templates (Prompt 58). Every /api call is mocked, with a small fake server
// that keeps the templates and assignments so the list and the Manual Planner react like the real ones.
import { expect, test, type Page, openClientTab, openLibrary as goToLibrary, openNewPlanForm } from "./fixtures";

const client = (id: string, name: string) => ({
  id,
  coachId: null,
  name,
  goal: "Fat loss",
  age: 29,
  weightKg: 68,
  heightCm: 165,
  level: "Intermediate",
  focus: "",
  notes: "",
  createdAt: "2026-10-01T00:00:00.000Z",
});
const CLIENTS = [client("c-maya", "Maya Patel"), client("c-arjun", "Arjun Mehta")];

type T = {
  id: string;
  coachId: string;
  name: string;
  focus: string;
  exercises: { name: string; sets: number; reps: string; rest: number }[];
  notes: string;
  createdAt: string;
};
const tpl = (id: string, name: string, over: Partial<T> = {}): T => ({
  id,
  coachId: "coach-test",
  name,
  focus: "",
  exercises: [{ name: "Back Squat", sets: 4, reps: "6", rest: 120 }],
  notes: "",
  createdAt: "2026-11-11T08:00:00.000Z",
  ...over,
});

async function openLibrary(page: Page, initial: T[] = []) {
  const templates = [...initial];
  const calls: string[] = [];
  const assignments: Record<string, unknown>[] = [];
  await page.route("**/api/**", (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    const method = req.method();
    if (path === "/api/clients") return route.fulfill({ json: CLIENTS });
    if (path === "/api/review-queue") return route.fulfill({ json: { pendingCount: 0, items: [] } });
    if (path === "/api/meals") return route.fulfill({ json: [] }); // meal library has its own spec (meals.spec.ts)
    if (path === "/api/templates") {
      if (method === "POST") {
        const body = req.postDataJSON() as Partial<T>;
        calls.push(`POST ${JSON.stringify(body)}`);
        const created = tpl(`t${templates.length + 10}`, body.name ?? "", { focus: body.focus ?? "", exercises: body.exercises, notes: body.notes ?? "" });
        templates.push(created);
        return route.fulfill({ status: 201, json: created });
      }
      return route.fulfill({ json: [...templates].sort((a, b) => a.name.localeCompare(b.name)) });
    }
    const one = path.match(/^\/api\/templates\/([^/]+)$/);
    if (one && method === "PUT") {
      const body = req.postDataJSON() as Partial<T>;
      calls.push(`PUT ${one[1]} ${JSON.stringify(body)}`);
      const i = templates.findIndex((x) => x.id === one[1]);
      templates[i] = { ...templates[i], ...body } as T;
      return route.fulfill({ json: templates[i] });
    }
    if (one && method === "DELETE") {
      calls.push(`DELETE ${one[1]}`);
      const i = templates.findIndex((x) => x.id === one[1]);
      if (i >= 0) templates.splice(i, 1);
      return route.fulfill({ status: 204, body: "" });
    }
    const asg = path.match(/^\/api\/clients\/([^/]+)\/assignments$/);
    if (asg && method === "POST") {
      const body = req.postDataJSON() as Record<string, unknown>;
      calls.push(`ASSIGN ${asg[1]} ${JSON.stringify(body)}`);
      const created = { id: "a1", coachId: "coach-test", clientId: asg[1], status: "Active", createdAt: "2026-11-11T09:00:00.000Z", reasoning: "", ...body };
      assignments.push(created);
      return route.fulfill({ status: 201, json: created });
    }
    if (asg) return route.fulfill({ json: assignments });
    return route.fulfill({ status: 404, json: { error: "Not found" } });
  });
  await page.goto("/app");
  await goToLibrary(page);
  await expect(page.getByRole("heading", { level: 2, name: "Library" })).toBeVisible();
  return { templates, calls };
}

test("Library is a Business view and lists templates, with search by name", async ({ page }) => {
  await openLibrary(page, [
    tpl("t1", "Push day", { focus: "Upper body", notes: "Warm up first" }),
    tpl("t2", "Leg day", { exercises: [{ name: "Back Squat", sets: 4, reps: "6", rest: 120 }, { name: "Leg Press", sets: 3, reps: "12", rest: 90 }] }),
  ]);
  await expect(page.getByRole("group", { name: "Business view" }).getByRole("button", { name: "Library" })).toHaveAttribute("aria-pressed", "true");
  const list = page.getByRole("list", { name: "Templates" });
  await expect(list.getByRole("heading", { level: 3 })).toHaveText(["Leg day", "Push day"]);
  await expect(list).toContainText("Back Squat");
  await expect(list).toContainText("Rest 120s");
  await expect(list).toContainText("2 exercises");
  await page.getByLabel("Search templates").fill("PUSH");
  await expect(list.getByRole("heading", { level: 3 })).toHaveText(["Push day"]);
  await page.getByLabel("Search templates").fill("zzz");
  await expect(page.getByText('No template matches "zzz".')).toBeVisible();
});

test("shows an empty state, and works with zero clients", async ({ page }) => {
  await openLibrary(page);
  await expect(page.getByText("No templates yet")).toBeVisible();
});

test("creates a template with the exercise search, a custom exercise and sets / reps / rest", async ({ page }) => {
  const { calls } = await openLibrary(page);
  await page.getByRole("button", { name: "New template" }).click();
  const form = page.getByRole("form", { name: "New template" });

  // Needs a name and an exercise.
  await form.getByRole("button", { name: "Save template" }).click();
  await expect(form.getByRole("alert")).toContainText("Give the template a name.");
  await form.getByLabel("Template name").fill("  Leg day ");
  await form.getByRole("button", { name: "Save template" }).click();
  await expect(form.getByRole("alert")).toContainText("Add at least one exercise.");
  expect(calls).toEqual([]);

  await form.getByLabel("Focus (optional)").fill("Legs");
  await form.getByLabel("Search exercises").fill("back squat");
  await form.getByRole("list", { name: "Exercise results" }).getByRole("button", { name: /Back Squat/ }).click();
  await form.getByLabel("Search exercises").fill("Sled Push");
  await form.getByRole("button", { name: 'Add custom exercise "Sled Push"' }).click();
  await form.getByLabel("Sets for Back Squat").fill("5");
  await form.getByLabel("Reps for Back Squat").fill("5");
  await form.getByRole("group", { name: "Rest quick picks for Back Squat" }).getByRole("button", { name: "120s" }).click();
  await form.getByLabel("Reps for Sled Push").fill("20 m");
  await form.getByLabel("Notes (optional)").fill("Warm up first");
  await form.getByRole("button", { name: "Save template" }).click();

  await expect(page.getByRole("list", { name: "Templates" }).getByRole("heading", { level: 3 })).toHaveText(["Leg day"]);
  expect(calls).toEqual([
    `POST ${JSON.stringify({
      name: "Leg day",
      focus: "Legs",
      exercises: [
        { name: "Back Squat", sets: 5, reps: "5", rest: 120 },
        { name: "Sled Push", sets: 3, reps: "20 m", rest: 60 },
      ],
      notes: "Warm up first",
    })}`,
  ]);
});

test("edits a template: the form starts from it and saves with PUT", async ({ page }) => {
  const { calls } = await openLibrary(page, [tpl("t1", "Leg day", { focus: "Legs" })]);
  await page.getByRole("button", { name: "Edit Leg day" }).click();
  const form = page.getByRole("form", { name: "Edit template" });
  await expect(form.getByLabel("Template name")).toHaveValue("Leg day");
  await expect(form.getByLabel("Reps for Back Squat")).toHaveValue("6");
  await form.getByLabel("Template name").fill("Leg day B");
  await form.getByRole("button", { name: "Remove Back Squat" }).click();
  await form.getByLabel("Search exercises").fill("deadlift");
  await form.getByRole("list", { name: "Exercise results" }).getByRole("button", { name: /^Deadlift/ }).click();
  await form.getByRole("button", { name: "Save template" }).click();
  await expect(page.getByRole("list", { name: "Templates" }).getByRole("heading", { level: 3 })).toHaveText(["Leg day B"]);
  expect(calls).toEqual([
    `PUT t1 ${JSON.stringify({ name: "Leg day B", focus: "Legs", exercises: [{ name: "Deadlift", sets: 3, reps: "10", rest: 60 }], notes: "" })}`,
  ]);
});

test("delete asks first; Cancel keeps it, Delete removes it", async ({ page }) => {
  const { calls } = await openLibrary(page, [tpl("t1", "Leg day")]);
  await page.getByRole("button", { name: "Delete Leg day" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Delete this template?");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("heading", { level: 3, name: "Leg day" })).toBeVisible();
  expect(calls).toEqual([]);

  await page.getByRole("button", { name: "Delete Leg day" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("No templates yet")).toBeVisible();
  expect(calls).toEqual(["DELETE t1"]);
});

test("Assign to client: any client and a date open that client's Plans pre-filled and editable, then save a real Workout", async ({ page }) => {
  const { calls } = await openLibrary(page, [
    tpl("t1", "Leg day", { notes: "Warm up first", exercises: [{ name: "Back Squat", sets: 4, reps: "6", rest: 120 }, { name: "Leg Press", sets: 3, reps: "12", rest: 90 }] }),
  ]);
  await page.getByRole("button", { name: "Assign Leg day to client" }).click();
  const panel = page.getByRole("group", { name: "Assign Leg day" });
  await panel.getByLabel("Client").selectOption({ label: "Arjun Mehta" });
  await panel.getByLabel("Date").fill("2026-12-01");
  await panel.getByRole("button", { name: "Open in Plans" }).click();

  await expect(page.getByRole("tab", { name: "Plans", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("region", { name: "Selected client" })).toContainText("Arjun Mehta");
  const form = page.getByRole("form", { name: "New assignment" });
  await expect(form.getByLabel("Title")).toHaveValue("Leg day");
  await expect(form.getByLabel("Reasoning / why this plan (optional)")).toHaveValue("From template: Leg day");
  await expect(form.getByLabel("Date")).toHaveValue("2026-12-01");
  await expect(form.getByLabel("Extra notes (optional)")).toHaveValue("Warm up first");
  await expect(form.getByLabel("Reps for Leg Press")).toHaveValue("12");
  // Nothing is saved until the coach saves, and the form is still editable.
  expect(calls).toEqual([]);
  await form.getByLabel("Reasoning / why this plan (optional)").fill("From template: Leg day - lighter week");
  await form.getByLabel("Sets for Back Squat").fill("3");
  await form.getByRole("button", { name: "Assign plan" }).click();

  await expect(page.getByRole("list", { name: "Assignments" })).toContainText("Leg day");
  expect(calls).toEqual([
    `ASSIGN c-arjun ${JSON.stringify({
      type: "Workout",
      title: "Leg day",
      details: "1. Back Squat — 3 sets × 6 reps · Rest 120s\n2. Leg Press — 3 sets × 12 reps · Rest 90s\n\nWarm up first",
      reasoning: "From template: Leg day - lighter week",
      source: "manual",
      date: "2026-12-01",
    })}`,
  ]);

  // Leaving and coming back: the form is closed again, and opening it starts empty.
  await goToLibrary(page);
  await openClientTab(page, "Plans");
  await expect(page.getByRole("form", { name: "New assignment" })).toHaveCount(0);
  await expect((await openNewPlanForm(page)).getByLabel("Title")).toHaveValue("");
});
