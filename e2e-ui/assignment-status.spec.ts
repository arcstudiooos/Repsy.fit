// Assignment status buttons and delete in the Manual Planner (Prompt 24). Every /api call is
// mocked in the browser, so these run without a database. PATCH / DELETE change the mock, and
// the list and Clients tab counts must follow without a page reload.
import { expect, test, type Page, type Route, openSection } from "./fixtures";

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

type Assignment = Record<string, unknown> & { id: string; status: string };
type Mock = { assignments: Record<string, Assignment[]>; calls: string[]; failNext: boolean };

const assignment = (id: string, title: string, status = "Active"): Assignment => ({
  id,
  coachId: null,
  clientId: "c-maya",
  type: "Workout",
  title,
  details: "Squat 3x10",
  reasoning: "",
  source: "manual",
  status,
  date: "2026-11-01",
  createdAt: "2026-11-01T00:00:00.000Z",
});

async function mockApi(page: Page): Promise<Mock> {
  // Stored newest first, as the server lists them.
  const mock: Mock = {
    assignments: {
      "c-maya": [assignment("a3", "Mobility flow"), assignment("a2", "Protein plan"), assignment("a1", "Squat day")],
    },
    calls: [],
    failNext: false,
  };

  await page.route("**/api/**", async (route: Route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;

    if (req.method() === "GET" && path === "/api/clients") return route.fulfill({ json: CLIENTS });
    if (req.method() === "GET" && /^\/api\/clients\/[^/]+\/chat$/.test(path)) return route.fulfill({ json: [] });

    const list = path.match(/^\/api\/clients\/([^/]+)\/assignments$/);
    if (list && req.method() === "GET") {
      return route.fulfill({ json: mock.assignments[decodeURIComponent(list[1])] ?? [] });
    }

    const one = path.match(/^\/api\/clients\/([^/]+)\/assignments\/([^/]+)$/);
    if (one && (req.method() === "PATCH" || req.method() === "DELETE")) {
      mock.calls.push(`${req.method()} ${path}${req.method() === "PATCH" ? " " + req.postData() : ""}`);
      if (mock.failNext) {
        mock.failNext = false;
        return route.fulfill({ status: 500, json: { error: "Something went wrong on the server." } });
      }
      const rows = mock.assignments[decodeURIComponent(one[1])] ?? [];
      const row = rows.find((a) => a.id === decodeURIComponent(one[2]));
      if (!row) return route.fulfill({ status: 404, json: { error: "Assignment not found" } });
      if (req.method() === "DELETE") {
        rows.splice(rows.indexOf(row), 1);
        return route.fulfill({ status: 204 });
      }
      row.status = (req.postDataJSON() as { status: string }).status;
      return route.fulfill({ json: row });
    }

    return route.fulfill({ status: 404, json: { error: "Not found" } });
  });

  return mock;
}

const panel = (page: Page) => page.getByRole("tabpanel").first();
const openTab = (page: Page, name: string) => openSection(page, name);
const cards = (page: Page) => panel(page).getByRole("list", { name: "Assignments" }).getByRole("listitem");
const cardFor = (page: Page, title: string) => cards(page).filter({ hasText: title });
const statusGroup = (page: Page, title: string) => cardFor(page, title).getByRole("group", { name: "Status" });

test("each card has Active / Done / Paused buttons with the current one highlighted", async ({ page }) => {
  await mockApi(page);
  await page.goto("/app");
  await openTab(page, "Plans");
  const group = statusGroup(page, "Squat day");
  await expect(group.getByRole("button")).toHaveText(["Active", "Done", "Paused"]);
  await expect(group.getByRole("button", { name: "Active" })).toHaveAttribute("aria-pressed", "true");
  await expect(group.getByRole("button", { name: "Done" })).toHaveAttribute("aria-pressed", "false");
  await expect(group.getByRole("button", { name: "Paused" })).toHaveAttribute("aria-pressed", "false");
  // Delete lives in the card's ⋯ menu.
  await expect(cardFor(page, "Squat day").getByRole("button", { name: "More actions for Squat day" })).toBeVisible();
});

test("mark Done, pause, delete: the list updates without a reload", async ({ page }) => {
  const mock = await mockApi(page);
  await page.goto("/app");
  await openTab(page, "Plans");
  let navigations = 0;
  page.on("framenavigated", () => navigations++);

  // Done: highlighted, title dimmed, and a calm check in the status area.
  await statusGroup(page, "Squat day").getByRole("button", { name: "Done" }).click();
  await expect(statusGroup(page, "Squat day").getByRole("button", { name: "Done" })).toHaveAttribute("aria-pressed", "true");
  await expect(statusGroup(page, "Squat day").getByRole("button", { name: "Active" })).toHaveAttribute("aria-pressed", "false");
  await expect(cardFor(page, "Squat day").getByRole("heading", { name: "Squat day" })).toHaveClass(/text-dim/);
  await expect(cardFor(page, "Squat day").getByTitle("Done")).toBeVisible();
  // Other cards stay as they were.
  await expect(cardFor(page, "Protein plan").getByRole("heading", { name: "Protein plan" })).not.toHaveClass(/text-dim/);
  await expect(cardFor(page, "Protein plan").getByTitle("Done")).toHaveCount(0);

  // Paused.
  await statusGroup(page, "Protein plan").getByRole("button", { name: "Paused" }).click();
  await expect(statusGroup(page, "Protein plan").getByRole("button", { name: "Paused" })).toHaveAttribute("aria-pressed", "true");

  // Delete: cancelling the confirm keeps the card.
  let message = "";
  page.once("dialog", (d) => {
    message = d.message();
    void d.dismiss();
  });
  await cardFor(page, "Mobility flow").getByRole("button", { name: "More actions for Mobility flow" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  expect(message).toBe("Delete this assignment?");
  await expect(cards(page)).toHaveCount(3);

  page.once("dialog", (d) => void d.accept());
  await cardFor(page, "Mobility flow").getByRole("button", { name: "More actions for Mobility flow" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await expect(cards(page)).toHaveCount(2);
  await expect(cards(page).getByRole("heading")).toHaveText(["Protein plan", "Squat day"]);

  expect(mock.calls).toEqual([
    'PATCH /api/clients/c-maya/assignments/a1 {"status":"Done"}',
    'PATCH /api/clients/c-maya/assignments/a2 {"status":"Paused"}',
    "DELETE /api/clients/c-maya/assignments/a3",
  ]);

  // Back to Active.
  await statusGroup(page, "Squat day").getByRole("button", { name: "Active" }).click();
  await expect(statusGroup(page, "Squat day").getByRole("button", { name: "Active" })).toHaveAttribute("aria-pressed", "true");
  await expect(cardFor(page, "Squat day").getByRole("heading", { name: "Squat day" })).not.toHaveClass(/text-dim/);
  expect(navigations).toBe(0);
});

test("a failed status change shows the error on that card and keeps the old status", async ({ page }) => {
  const mock = await mockApi(page);
  await page.goto("/app");
  await openTab(page, "Plans");
  mock.failNext = true;
  await statusGroup(page, "Squat day").getByRole("button", { name: "Done" }).click();
  await expect(cardFor(page, "Squat day").getByRole("alert")).toContainText("The server had a problem. Please try again in a moment.");
  await expect(statusGroup(page, "Squat day").getByRole("button", { name: "Active" })).toHaveAttribute("aria-pressed", "true");
});
