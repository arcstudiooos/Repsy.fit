// Assign from an AI suggestion (Prompt 17). Every /api call is mocked in the browser, so
// these run without a database or AI key. The mock stores assignments per client.
import { expect, test, type Page, type Route } from "./fixtures";

const CLIENTS = [
  {
    id: "c-maya",
    coachId: null,
    name: "Maya Patel",
    goal: "Fat loss + strength",
    age: 29,
    weightKg: 68,
    heightCm: 165,
    level: "Intermediate",
    focus: "Lower body strength",
    notes: "",
    createdAt: "2026-10-01T00:00:00.000Z",
  },
];

const SUGGESTION = {
  type: "Workout",
  title: "Lower-body strength session",
  details: "Back squat 4x6\nRomanian deadlift 3x8",
  reasoning: "Builds the lower-body strength Maya is focusing on.",
};

type Mock = {
  assignments: Record<string, Record<string, unknown>[]>;
  posts: { clientId: string; body: Record<string, unknown> }[];
  assignmentGets: number;
  assignBehaviour: "ok" | "fail" | "hold";
  release?: () => void;
};

async function mockApi(page: Page): Promise<Mock> {
  const mock: Mock = { assignments: {}, posts: [], assignmentGets: 0, assignBehaviour: "ok" };
  let nextId = 1;

  await page.route("**/api/**", async (route: Route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;

    if (req.method() === "GET" && path === "/api/clients") return route.fulfill({ json: CLIENTS });

    const chat = path.match(/^\/api\/clients\/([^/]+)\/chat$/);
    if (chat) {
      const clientId = decodeURIComponent(chat[1]);
      if (req.method() === "GET") return route.fulfill({ json: [] });
      if (req.method() === "POST") {
        const { question } = req.postDataJSON() as { question: string };
        const now = new Date().toISOString();
        const q = { id: `q${nextId++}`, clientId, role: "coach", content: question, createdAt: now };
        const r = { id: `r${nextId++}`, clientId, role: "ai", content: "Here is a plan.", createdAt: now };
        return route.fulfill({ status: 201, json: { question: q, reply: r, suggestion: SUGGESTION } });
      }
    }

    const assignments = path.match(/^\/api\/clients\/([^/]+)\/assignments$/);
    if (assignments) {
      const clientId = decodeURIComponent(assignments[1]);
      if (req.method() === "GET") {
        mock.assignmentGets++;
        return route.fulfill({ json: [...(mock.assignments[clientId] ?? [])].reverse() });
      }
      if (req.method() === "POST") {
        const body = req.postDataJSON() as Record<string, unknown>;
        mock.posts.push({ clientId, body });
        if (mock.assignBehaviour === "hold") await new Promise<void>((resolve) => (mock.release = resolve));
        if (mock.assignBehaviour === "fail") {
          return route.fulfill({ status: 400, json: { error: "details: details can't be empty." } });
        }
        const saved = {
          id: `as${nextId++}`,
          coachId: null,
          clientId,
          reasoning: "",
          source: "manual",
          status: "Active",
          createdAt: new Date().toISOString(),
          ...body,
        };
        (mock.assignments[clientId] ??= []).push(saved);
        return route.fulfill({ status: 201, json: saved });
      }
    }

    return route.fulfill({ status: 404, json: { error: "Not found" } });
  });

  return mock;
}

const panel = (page: Page) => page.getByRole("tabpanel").first();
const card = (page: Page) => panel(page).getByRole("region", { name: "AI suggestion" });

async function askForWorkout(page: Page) {
  await page.goto("/app");
  await panel(page).getByRole("button", { name: "Make a workout plan" }).click();
  await expect(card(page)).toContainText("Lower-body strength session");
}

/** The browser's local date as YYYY-MM-DD (what the coach sees as "today"). */
const browserToday = (page: Page) =>
  page.evaluate(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });

test("Dismiss hides the suggestion and saves nothing", async ({ page }) => {
  const mock = await mockApi(page);
  await askForWorkout(page);
  await card(page).getByRole("button", { name: "Dismiss" }).click();
  await expect(card(page)).toHaveCount(0);
  await page.waitForTimeout(300);
  expect(mock.posts).toHaveLength(0);
});

test("asking alone never saves an assignment", async ({ page }) => {
  const mock = await mockApi(page);
  await askForWorkout(page);
  await page.waitForTimeout(300);
  expect(mock.posts).toHaveLength(0);
});

test("Assign saves exactly one ai assignment with reasoning, then shows Assigned and a planner link", async ({ page }) => {
  const mock = await mockApi(page);
  await askForWorkout(page);
  await card(page).getByRole("button", { name: "Assign to client" }).click();

  await expect(card(page)).toContainText("Assigned");
  expect(mock.posts).toEqual([
    {
      clientId: "c-maya",
      body: { ...SUGGESTION, source: "ai", date: await browserToday(page) },
    },
  ]);
  expect(mock.assignments["c-maya"]).toHaveLength(1);
  expect(mock.assignments["c-maya"][0]).toMatchObject({ source: "ai", reasoning: SUGGESTION.reasoning });
  await expect(card(page).getByRole("button", { name: "Assign to client" })).toHaveCount(0);

  await card(page).getByRole("button", { name: "View in Plans" }).click();
  await expect(page.getByRole("tab", { name: "Plans", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(panel(page).getByRole("heading", { level: 2 })).toHaveText("Plans");
  expect(mock.posts).toHaveLength(1);
});

test("Assign is disabled while saving, so a double tap saves once", async ({ page }) => {
  const mock = await mockApi(page);
  mock.assignBehaviour = "hold";
  await askForWorkout(page);
  await card(page).getByRole("button", { name: "Assign to client" }).click();
  const saving = card(page).getByRole("button", { name: "Assigning..." });
  await expect(saving).toBeDisabled();
  await saving.click({ force: true });
  await expect.poll(() => mock.posts.length).toBe(1);
  mock.assignBehaviour = "ok";
  mock.release!();
  await expect(card(page)).toContainText("Assigned");
  expect(mock.posts).toHaveLength(1);
});

test("a failed assign shows the error on the card and keeps the suggestion", async ({ page }) => {
  const mock = await mockApi(page);
  mock.assignBehaviour = "fail";
  await askForWorkout(page);
  await card(page).getByRole("button", { name: "Assign to client" }).click();
  await expect(card(page).getByRole("alert")).toContainText("details can't be empty.");
  await expect(card(page)).toContainText("Lower-body strength session");
  await expect(card(page).getByRole("button", { name: "Assign to client" })).toBeEnabled();
  expect(mock.assignments["c-maya"] ?? []).toHaveLength(0);
});
