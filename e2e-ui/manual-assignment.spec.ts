// Manual assignment form in the Manual Planner (Prompt 20). Every /api call is mocked in the
// browser, so these run without a database. POST .../assignments saves into the mock and the
// list returns newest first, like the server.
import { expect, test, type Page, type Route } from "@playwright/test";

const client = (id: string, name: string, createdAt: string) => ({
  id,
  coachId: "default-coach",
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
type Mock = {
  assignments: Record<string, Assignment[]>;
  posts: Record<string, unknown>[];
  createBehaviour: "ok" | "fail";
};

let nextId = 1;
function assignment(clientId: string, fields: Partial<Assignment>): Assignment {
  return {
    id: `as${nextId++}`,
    coachId: "default-coach",
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
  const mock: Mock = { assignments: initial, posts: [], createBehaviour: "ok" };

  await page.route("**/api/**", async (route: Route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;

    if (req.method() === "GET" && path === "/api/clients") return route.fulfill({ json: CLIENTS });
    if (req.method() === "GET" && /^\/api\/clients\/[^/]+\/chat$/.test(path)) return route.fulfill({ json: [] });

    const list = path.match(/^\/api\/clients\/([^/]+)\/assignments$/);
    if (list && req.method() === "GET") {
      const clientId = decodeURIComponent(list[1]);
      return route.fulfill({ json: [...(mock.assignments[clientId] ?? [])].reverse() });
    }
    if (list && req.method() === "POST") {
      const clientId = decodeURIComponent(list[1]);
      const body = req.postDataJSON() as Record<string, unknown>;
      mock.posts.push(body);
      if (mock.createBehaviour === "fail") {
        return route.fulfill({ status: 400, json: { error: "Title must be 200 characters or fewer." } });
      }
      const saved = assignment(clientId, { reasoning: "", source: "manual", status: "Active", ...body });
      (mock.assignments[clientId] ??= []).push(saved);
      return route.fulfill({ status: 201, json: saved });
    }

    return route.fulfill({ status: 404, json: { error: "Not found" } });
  });

  return mock;
}

function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const panel = (page: Page) => page.getByRole("tabpanel");
const openPlanner = async (page: Page) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Manual Planner" }).click();
};
const form = (page: Page) => panel(page).getByRole("form", { name: "New assignment" });
const typePicker = (page: Page) => form(page).getByRole("group", { name: "Type" });
const title = (page: Page) => form(page).getByLabel("Title");
const details = (page: Page) => form(page).getByLabel("Details");
const reasoning = (page: Page) => form(page).getByLabel("Reasoning / why this plan (optional)");
const date = (page: Page) => form(page).getByLabel("Date");
const submit = (page: Page) => form(page).getByRole("button", { name: "Assign plan" });
const cards = (page: Page) => panel(page).getByRole("list", { name: "Assignments" }).getByRole("listitem");
const cardFor = (page: Page, text: string) => cards(page).filter({ hasText: text });

test("type picker: 4 buttons in the type colours, the chosen one ring-highlighted and the others dimmed", async ({ page }) => {
  await mockApi(page);
  await openPlanner(page);
  const buttons = typePicker(page).getByRole("button");
  await expect(buttons).toHaveText(["Workout", "Nutrition", "Habit", "Recovery"]);
  for (const type of ["Workout", "Nutrition", "Habit", "Recovery"]) {
    await expect(typePicker(page).getByRole("button", { name: type })).toHaveClass(new RegExp(`bg-type-${type.toLowerCase()}`));
  }

  await typePicker(page).getByRole("button", { name: "Nutrition" }).click();
  for (const type of ["Workout", "Nutrition", "Habit", "Recovery"]) {
    const button = typePicker(page).getByRole("button", { name: type });
    if (type === "Nutrition") {
      await expect(button).toHaveAttribute("aria-pressed", "true");
      await expect(button).toHaveClass(/ring-2/);
      await expect(button).not.toHaveClass(/opacity-50/);
    } else {
      await expect(button).toHaveAttribute("aria-pressed", "false");
      await expect(button).toHaveClass(/opacity-50/);
      await expect(button).not.toHaveClass(/ring-2/);
    }
  }
});

test("fields: title placeholder follows the type; details, reasoning and date (today) are there", async ({ page }) => {
  await mockApi(page);
  await openPlanner(page);
  const pick = (type: string) => typePicker(page).getByRole("button", { name: type }).click();

  await pick("Nutrition");
  await expect(title(page)).toHaveAttribute("placeholder", "e.g. 1800 kcal high-protein day");
  await pick("Workout");
  await expect(title(page)).toHaveAttribute("placeholder", "e.g. Push day - chest & shoulders");
  await pick("Habit");
  await expect(title(page)).toHaveAttribute("placeholder", "e.g. Daily 10k steps");

  await expect(details(page)).toHaveAttribute("placeholder", "Write the full plan - meals with portions, or habit steps.");
  expect(await details(page).evaluate((el) => el.tagName)).toBe("TEXTAREA");
  expect(await reasoning(page).evaluate((el) => el.tagName)).toBe("TEXTAREA");
  await expect(date(page)).toHaveAttribute("type", "date");
  await expect(date(page)).toHaveValue(localToday());
});

test("submit stays disabled until title AND details have text - empty details can't be submitted", async ({ page }) => {
  const mock = await mockApi(page);
  await openPlanner(page);
  await expect(submit(page)).toBeDisabled();
  await title(page).fill("Daily 10k steps");
  await expect(submit(page)).toBeDisabled();
  await details(page).fill("   ");
  await expect(submit(page)).toBeDisabled();
  await details(page).press("Enter");
  await expect(submit(page)).toBeDisabled();
  await title(page).fill("");
  await details(page).fill("Walk after lunch");
  await expect(submit(page)).toBeDisabled();
  await title(page).fill("Daily 10k steps");
  await expect(submit(page)).toBeEnabled();
  expect(mock.posts).toHaveLength(0);
});

test("create one Nutrition and one Habit: source manual, form clears, cards show Manual beside AI plans", async ({ page }) => {
  const mock = await mockApi(page, {
    "c-maya": [
      assignment("c-maya", { type: "Workout", title: "AI squat day", source: "ai", reasoning: "Strength goal." }),
      ...Array.from({ length: 8 }, (_, i) => assignment("c-maya", { title: `Older plan ${i + 1}`, details: "x\ny\nz" })),
    ],
  });
  await openPlanner(page);
  await expect(cards(page)).toHaveCount(9);

  await typePicker(page).getByRole("button", { name: "Nutrition" }).click();
  await title(page).fill("1800 kcal high-protein day");
  await details(page).fill("Breakfast: 3 eggs, oats 60g\nLunch: chicken 150g, rice 100g");
  await reasoning(page).fill("Supports fat loss while keeping protein high.");
  await date(page).fill("2026-11-12");
  await submit(page).click();

  await expect(cards(page)).toHaveCount(10);
  expect(mock.posts[0]).toEqual({
    type: "Nutrition",
    title: "1800 kcal high-protein day",
    details: "Breakfast: 3 eggs, oats 60g\nLunch: chicken 150g, rice 100g",
    reasoning: "Supports fat loss while keeping protein high.",
    source: "manual",
    date: "2026-11-12",
  });
  const nutrition = cardFor(page, "1800 kcal high-protein day");
  await expect(nutrition.getByText("Manual", { exact: true })).toBeVisible();
  await expect(nutrition.getByText("Nutrition", { exact: true })).toHaveClass(/bg-type-nutrition/);
  await expect(nutrition).toContainText("2026-11-12");
  await expect(nutrition).toBeInViewport();

  // Form cleared (date back to today).
  await expect(title(page)).toHaveValue("");
  await expect(details(page)).toHaveValue("");
  await expect(reasoning(page)).toHaveValue("");
  await expect(date(page)).toHaveValue(localToday());
  await expect(submit(page)).toBeDisabled();

  await typePicker(page).getByRole("button", { name: "Habit" }).click();
  await title(page).fill("Daily 10k steps");
  await details(page).fill("Walk after lunch\nTake the stairs");
  await submit(page).click();

  await expect(cards(page)).toHaveCount(11);
  expect(mock.posts[1]).toEqual({
    type: "Habit",
    title: "Daily 10k steps",
    details: "Walk after lunch\nTake the stairs",
    reasoning: "",
    source: "manual",
    date: localToday(),
  });
  const habit = cardFor(page, "Daily 10k steps");
  await expect(habit.getByText("Manual", { exact: true })).toBeVisible();
  await expect(habit).toBeInViewport();

  // Manual plans sit beside the AI plan in the same list, newest first.
  await expect(cards(page).getByRole("heading").first()).toHaveText("Daily 10k steps");
  await expect(cards(page).getByRole("heading").nth(1)).toHaveText("1800 kcal high-protein day");
  await expect(cardFor(page, "AI squat day").getByText("AI", { exact: true })).toBeVisible();
});

test("a server error shows a small red line above the button and keeps the typed text", async ({ page }) => {
  const mock = await mockApi(page);
  mock.createBehaviour = "fail";
  await openPlanner(page);
  await typePicker(page).getByRole("button", { name: "Recovery" }).click();
  await title(page).fill("Mobility flow");
  await details(page).fill("Hips 5 min\nThoracic 5 min");
  await reasoning(page).fill("Tight hips.");
  await date(page).fill("2026-11-15");
  await submit(page).click();

  const error = form(page).getByRole("alert");
  await expect(error).toContainText("Title must be 200 characters or fewer.");
  await expect(error).toHaveClass(/text-sm/);
  await expect(error).toHaveClass(/text-accent/);
  const errorBox = await error.boundingBox();
  const buttonBox = await submit(page).boundingBox();
  expect(errorBox!.y).toBeLessThan(buttonBox!.y);

  await expect(title(page)).toHaveValue("Mobility flow");
  await expect(details(page)).toHaveValue("Hips 5 min\nThoracic 5 min");
  await expect(reasoning(page)).toHaveValue("Tight hips.");
  await expect(date(page)).toHaveValue("2026-11-15");
  await expect(typePicker(page).getByRole("button", { name: "Recovery" })).toHaveAttribute("aria-pressed", "true");

  // Fixing the problem and retrying saves it and clears the error.
  mock.createBehaviour = "ok";
  await submit(page).click();
  await expect(cardFor(page, "Mobility flow")).toBeVisible();
  await expect(form(page).getByRole("alert")).toHaveCount(0);
});

test("the form shows for a client with nothing assigned, and the first plan replaces the empty state", async ({ page }) => {
  await mockApi(page);
  await openPlanner(page);
  await expect(panel(page)).toContainText("Nothing assigned yet.");
  await title(page).fill("Push day - chest & shoulders");
  await details(page).fill("Bench 4x8");
  await submit(page).click();
  await expect(cards(page)).toHaveCount(1);
  await expect(cardFor(page, "Push day - chest & shoulders").getByText("Workout", { exact: true })).toBeVisible();
});

test("switching client resets the draft, and a save goes only to the selected client", async ({ page }) => {
  const mock = await mockApi(page);
  await openPlanner(page);
  await title(page).fill("Plan typed for Maya");
  await details(page).fill("Maya-only details");
  await page.getByRole("group", { name: "Select client" }).getByRole("button", { name: /Leo/ }).click();
  await expect(panel(page)).toContainText("Selected: Leo Brooks");
  await expect(title(page)).toHaveValue("");
  await expect(details(page)).toHaveValue("");
  await title(page).fill("Plan for Leo");
  await details(page).fill("Leo details");
  await submit(page).click();
  await expect(cardFor(page, "Plan for Leo")).toHaveCount(1);
  expect(mock.assignments["c-leo"]).toHaveLength(1);
  expect(mock.assignments["c-maya"] ?? []).toHaveLength(0);
});
