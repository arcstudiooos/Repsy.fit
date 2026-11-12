// Assignments list in the Manual Planner (Prompt 19). Every /api call is mocked in the
// browser, so these run without a database or AI key. AI drafts are assigned into the mock, and
// the assignments list returns newest first, like the server.
import { expect, test, type Page, type Route } from "./fixtures";

const client = (id: string, name: string, createdAt: string) => ({
  id,
  coachId: null,
  name,
  goal: "Fat loss + strength",
  age: 29,
  weightKg: 68,
  heightCm: 165,
  level: "Intermediate",
  focus: "",
  notes: "",
  createdAt,
});

const CLIENTS = [client("c-maya", "Maya Patel", "2026-10-01T00:00:00.000Z"), client("c-leo", "Leo Brooks", "2026-10-02T00:00:00.000Z")];

type Assignment = Record<string, unknown>;
type Mock = { assignments: Record<string, Assignment[]>; assignmentsBehaviour: "ok" | "missing" | "fail" };

let nextId = 1;
function assignment(clientId: string, fields: Partial<Assignment>): Assignment {
  return {
    id: `as${nextId++}`,
    coachId: null,
    clientId,
    type: "Workout",
    title: "Plan",
    details: "",
    reasoning: "",
    source: "manual",
    status: "Active",
    date: "2026-11-01",
    createdAt: new Date().toISOString(),
    ...fields,
  };
}

async function mockApi(page: Page, initial: Record<string, Assignment[]> = {}): Promise<Mock> {
  // Stored oldest first; GET returns newest first.
  const mock: Mock = { assignments: initial, assignmentsBehaviour: "ok" };

  await page.route("**/api/**", async (route: Route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;

    if (req.method() === "GET" && path === "/api/clients") return route.fulfill({ json: CLIENTS });
    if (req.method() === "GET" && /^\/api\/clients\/[^/]+\/chat$/.test(path)) return route.fulfill({ json: [] });

    const list = path.match(/^\/api\/clients\/([^/]+)\/assignments$/);
    if (list && req.method() === "GET") {
      if (mock.assignmentsBehaviour === "missing") return route.fulfill({ status: 404, json: { error: "Not found" } });
      if (mock.assignmentsBehaviour === "fail") {
        return route.fulfill({ status: 400, json: { error: "Could not load plans for this client." } });
      }
      const clientId = decodeURIComponent(list[1]);
      return route.fulfill({ json: [...(mock.assignments[clientId] ?? [])].reverse() });
    }

    const auto = path.match(/^\/api\/clients\/([^/]+)\/auto-assign$/);
    if (auto && req.method() === "POST") {
      const body = req.postDataJSON() as { type: string; date: string };
      return route.fulfill({
        json: {
          draft: {
            type: body.type,
            title: `${body.type} plan for Maya`,
            details: `${body.type} step 1\n${body.type} step 2`,
            reasoning: `Maya's goal is fat loss + strength (${body.type}).`,
            date: body.date,
          },
        },
      });
    }
    if (list && req.method() === "POST") {
      const clientId = decodeURIComponent(list[1]);
      const body = req.postDataJSON() as Partial<Assignment>;
      const saved = assignment(clientId, body);
      (mock.assignments[clientId] ??= []).push(saved);
      return route.fulfill({ status: 201, json: saved });
    }

    return route.fulfill({ status: 404, json: { error: "Not found" } });
  });

  return mock;
}

const panel = (page: Page) => page.getByRole("tabpanel");
const openTab = (page: Page, name: string) => page.getByRole("tab", { name }).click();
const filters = (page: Page) => panel(page).getByRole("group", { name: "Filter by type" });
const cards = (page: Page) => panel(page).getByRole("list", { name: "Assignments" }).getByRole("listitem");
const cardFor = (page: Page, title: string) => cards(page).filter({ hasText: title });

test("the 4 auto-assigned plans appear newest first with type chips, AI labels and Why lines", async ({ page }) => {
  await mockApi(page);
  await page.goto("/app");
  const autoRow = panel(page).getByRole("group", { name: "Draft a plan with AI" });
  for (const label of ["Workout", "Nutrition", "Habit", "Recovery"]) {
    await autoRow.getByRole("button", { name: label, exact: true }).click();
    const draft = panel(page).getByRole("region", { name: "AI draft" });
    await expect(draft).toContainText(`${label} plan for Maya`);
    await draft.getByRole("button", { name: "Assign to client" }).click();
    await expect(draft).toContainText("✓ Assigned");
  }

  await panel(page).getByRole("button", { name: "View in Manual Planner" }).click();
  await expect(panel(page).getByRole("heading", { level: 2 })).toHaveText("Manual Planner");
  await expect(panel(page)).toContainText("Selected: Maya Patel");
  await expect(cards(page)).toHaveCount(4);
  // Newest first.
  await expect(cards(page).getByRole("heading")).toHaveText([
    "Recovery plan for Maya",
    "Habit plan for Maya",
    "Nutrition plan for Maya",
    "Workout plan for Maya",
  ]);

  for (const type of ["Workout", "Nutrition", "Habit", "Recovery"]) {
    const card = cardFor(page, `${type} plan for Maya`);
    await expect(card.getByText(type, { exact: true })).toHaveClass(new RegExp(`bg-type-${type.toLowerCase()}`));
    await expect(card.getByText("AI", { exact: true })).toBeVisible();
    await expect(card.getByText("Manual", { exact: true })).toHaveCount(0);
    await expect(card.getByText("Active", { exact: true })).toBeVisible();
    await expect(card.getByText(`Why: Maya's goal is fat loss + strength (${type}).`)).toBeVisible();
  }
});

test("filter chips narrow the list instantly on the client", async ({ page }) => {
  await mockApi(page, {
    "c-maya": [
      assignment("c-maya", { type: "Workout", title: "Squat day" }),
      assignment("c-maya", { type: "Nutrition", title: "Protein plan" }),
      assignment("c-maya", { type: "Habit", title: "Sleep by 11" }),
      assignment("c-maya", { type: "Workout", title: "Pull day" }),
      assignment("c-maya", { type: "Recovery", title: "Mobility flow" }),
    ],
  });
  let gets = 0;
  page.on("request", (r) => {
    if (r.method() === "GET" && r.url().endsWith("/assignments")) gets++;
  });
  await page.goto("/app");
  await openTab(page, "Manual Planner");
  await expect(filters(page).getByRole("button")).toHaveText(["All", "Workout", "Nutrition", "Habit", "Recovery"]);
  await expect(filters(page).getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "true");
  await expect(cards(page)).toHaveCount(5);
  const getsBefore = gets;

  await filters(page).getByRole("button", { name: "Workout" }).click();
  await expect(cards(page).getByRole("heading")).toHaveText(["Pull day", "Squat day"]);
  await expect(filters(page).getByRole("button", { name: "Workout" })).toHaveAttribute("aria-pressed", "true");
  await filters(page).getByRole("button", { name: "Nutrition" }).click();
  await expect(cards(page).getByRole("heading")).toHaveText(["Protein plan"]);
  await filters(page).getByRole("button", { name: "Habit" }).click();
  await expect(cards(page).getByRole("heading")).toHaveText(["Sleep by 11"]);
  await filters(page).getByRole("button", { name: "Recovery" }).click();
  await expect(cards(page).getByRole("heading")).toHaveText(["Mobility flow"]);
  await filters(page).getByRole("button", { name: "All" }).click();
  await expect(cards(page)).toHaveCount(5);
  expect(gets).toBe(getsBefore); // filtering never refetches
});

test("cards show source, status, date, line breaks, and no Why line when reasoning is empty", async ({ page }) => {
  await mockApi(page, {
    "c-maya": [
      assignment("c-maya", {
        type: "Nutrition",
        title: "Meal prep",
        details: "Breakfast: oats\nLunch: lentils",
        reasoning: "  ",
        source: "manual",
        status: "Paused",
        date: "2026-11-03",
      }),
    ],
  });
  await page.goto("/app");
  await openTab(page, "Manual Planner");
  const card = cardFor(page, "Meal prep");
  await expect(card.getByText("Manual", { exact: true })).toBeVisible();
  await expect(card.getByText("AI", { exact: true })).toHaveCount(0);
  await expect(card.getByText("Paused", { exact: true })).toBeVisible();
  await expect(card).toContainText("Tue, 3 Nov");
  await expect(card).not.toContainText("Why:");
  const details = card.locator(".plan-details");
  expect(await details.innerText()).toBe("Breakfast: oats\nLunch: lentils");
});

test("a filter with no matches says so; an empty list offers the AI Coach", async ({ page }) => {
  await mockApi(page, { "c-maya": [assignment("c-maya", { type: "Workout", title: "Squat day" })] });
  await page.goto("/app");
  await openTab(page, "Manual Planner");
  await filters(page).getByRole("button", { name: "Habit" }).click();
  await expect(cards(page)).toHaveCount(0);
  await expect(panel(page)).toContainText("No Habit assignments");

  // Leo has nothing assigned.
  await panel(page).getByRole("button", { name: /^Leo/ }).click();
  await expect(panel(page)).toContainText("Selected: Leo Brooks");
  await expect(panel(page)).toContainText("Nothing assigned yet. Create the first plan below, or ask the AI Coach.");
  await panel(page).getByRole("button", { name: "Ask the AI Coach" }).click();
  await expect(page.getByRole("tab", { name: "AI Coach" })).toHaveAttribute("aria-selected", "true");
  await expect(panel(page)).toContainText("Selected: Leo Brooks");
});

test("a failed load shows an error with Retry", async ({ page }) => {
  const mock = await mockApi(page);
  mock.assignmentsBehaviour = "fail";
  await page.goto("/app");
  await openTab(page, "Manual Planner");
  await expect(panel(page)).toContainText("Could not load plans for this client.");
  mock.assignmentsBehaviour = "ok";
  await panel(page).getByRole("button", { name: "Retry" }).click();
  await expect(panel(page)).toContainText("Nothing assigned yet.");
});

test("client cards show the last check-in and adherence from GET /api/clients (no per-client requests)", async ({ page }) => {
  await mockApi(page);
  const d = new Date();
  d.setDate(d.getDate() - 3);
  const threeDaysAgo = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  await page.route("**/api/clients", (route) =>
    route.fulfill({
      json: [
        { ...CLIENTS[0], lastCheckIn: threeDaysAgo, adherence: 82 },
        { ...CLIENTS[1], lastCheckIn: null, adherence: null },
      ],
    }),
  );
  const assignmentGets: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "GET" && /\/assignments$/.test(new URL(r.url()).pathname)) assignmentGets.push(r.url());
  });
  await page.goto("/app");
  await openTab(page, "Clients");
  const maya = panel(page).getByRole("button", { name: "Maya Patel - open in AI Coach" });
  await expect(maya).toContainText("Checked in 3 days ago");
  await expect(maya).toContainText("Adherence 82%");
  await expect(maya).not.toContainText("assignments");
  const leo = panel(page).getByRole("button", { name: "Leo Brooks - open in AI Coach" });
  await expect(leo).toContainText("No check-ins yet");
  await expect(leo).not.toContainText("Adherence");
  expect(assignmentGets).toEqual([]);
  // "Client access" stays on the card; Delete moved into the ⋯ menu.
  await expect(panel(page).getByRole("button", { name: "Client access for Maya Patel" })).toHaveText("Client access");
  await expect(panel(page).getByRole("button", { name: "Delete Maya Patel" })).toHaveCount(0);
  const more = panel(page).getByRole("button", { name: "More actions for Maya Patel" });
  await expect(more).toHaveAttribute("aria-haspopup", "menu");
  await more.click();
  await expect(more).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("menuitem", { name: "Delete" })).toBeFocused();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await expect(page.getByRole("dialog")).toContainText("Delete Maya Patel?");
});
