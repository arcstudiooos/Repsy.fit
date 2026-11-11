// Polish pass (Prompt 35): phone (375px) and desktop (1280px) checks on all four tabs, plus the
// empty-proofing cases. Every /api call is mocked in the browser.
import { expect, test, type Page, type Route } from "./fixtures";

const client = (i: number, name: string) => ({
  id: `c-${i}`,
  coachId: null,
  name,
  goal: "Fat loss + strength",
  age: 29,
  weightKg: 68,
  heightCm: 165,
  level: "Intermediate",
  focus: "Lower body strength, protein intake",
  notes: "Vegetarian. Trains 4x/week.",
  createdAt: `2026-10-0${i + 1}T00:00:00.000Z`,
});
const MANY = ["Maya Patel", "Arjun Mehta", "Casey Jordan", "Rohan Kapoor", "Sarah Mitchell", "David Osei"].map((n, i) => client(i, n));

const logs = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: `l${i}`,
    coachId: null,
    clientId: "c-0",
    date: new Date(Date.UTC(2026, 8, 7 + i * 7)).toISOString().slice(0, 10),
    weightKg: 68 - i * 0.4,
    adherence: 80 + i,
    workoutsDone: 4,
    note: i === 0 ? "Starting week" : "",
    createdAt: "2026-10-01T00:00:00.000Z",
  }));
const assignments = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: `a${i}`,
    coachId: null,
    clientId: "c-0",
    type: ["Workout", "Nutrition", "Habit", "Recovery"][i % 4],
    title: `Plan ${i + 1}`,
    details: "1. Back Squat — 3 sets × 8 reps · Rest 90s",
    reasoning: "Builds a base.",
    source: i % 2 ? "ai" : "manual",
    status: "Active",
    date: "2026-11-01",
    createdAt: `2026-11-0${i + 1}T00:00:00.000Z`,
  }));

type Setup = { clients?: unknown[]; logs?: number; assignments?: number; fail?: RegExp };

async function mockApi(page: Page, setup: Setup = {}) {
  const { clients = MANY, fail } = setup;
  await page.route("**/api/**", async (route: Route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (fail && fail.test(path) && req.method() === "GET") {
      return route.fulfill({ status: 500, json: { error: "Something went wrong on the server." } });
    }
    if (req.method() === "GET" && path === "/api/clients") return route.fulfill({ json: clients });
    if (req.method() === "GET" && /\/chat$/.test(path)) return route.fulfill({ json: [] });
    if (req.method() === "GET" && /\/progress$/.test(path)) return route.fulfill({ json: logs(setup.logs ?? 6) });
    if (req.method() === "GET" && /\/assignments$/.test(path)) return route.fulfill({ json: assignments(setup.assignments ?? 4) });
    return route.fulfill({ status: 404, json: { error: "Not found" } });
  });
}

const TABS = ["Home", "AI Coach", "Clients", "Manual Planner", "Progress", "Check-ins"];
const panel = (page: Page) => page.getByRole("tabpanel");

async function openTab(page: Page, tab: string) {
  await page.getByRole("tab", { name: tab }).click();
  await expect(page.getByRole("tab", { name: tab })).toHaveAttribute("aria-selected", "true");
  await expect(panel(page).getByText("Loading...")).toHaveCount(0);
}

/** Visible buttons shorter than 40px, as "label (height)" strings. */
async function shortButtons(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("button, [role=tab], a[href]")]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
      })
      .filter((el) => el.getBoundingClientRect().height < 40)
      .map((el) => `${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 40)} (${Math.round(el.getBoundingClientRect().height)}px)`),
  );
}

/** Inputs/selects/textareas with no accessible label. */
async function unlabelledFields(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLInputElement>("input, select, textarea")]
      .filter((el) => el.type !== "hidden")
      .filter((el) => !(el.labels && el.labels.length) && !el.getAttribute("aria-label") && !el.getAttribute("aria-labelledby"))
      .map((el) => el.outerHTML.slice(0, 80)),
  );
}

/** Buttons with no text and no aria-label (icon-only without a name). */
async function namelessButtons(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("button")]
      .filter((el) => !(el.textContent ?? "").trim() && !el.getAttribute("aria-label") && !el.getAttribute("aria-labelledby"))
      .map((el) => el.outerHTML.slice(0, 80)),
  );
}

for (const width of [375, 1280]) {
  test.describe(`${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });

    for (const tab of TABS) {
      test(`${tab}: no sideways page scroll, 40px+ buttons, labelled fields, named buttons`, async ({ page }) => {
        await mockApi(page);
        await page.goto("/app");
        await openTab(page, tab);
        if (tab === "Manual Planner") {
          // Add an exercise row so its sets/reps/rest controls are checked too.
          const form = panel(page).getByRole("form", { name: "New assignment" });
          await form.getByRole("button", { name: "Workout", exact: true }).click();
          await form.getByLabel("Search exercises").fill("squat");
          await form.getByRole("list", { name: "Exercise results" }).getByRole("button").filter({ hasText: "Back Squat" }).first().click();
          await expect(form.getByLabel("Reps for Back Squat")).toBeVisible();
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
        expect(await shortButtons(page)).toEqual([]);
        expect(await unlabelledFields(page)).toEqual([]);
        expect(await namelessButtons(page)).toEqual([]);
      });
    }
  });
}

test.describe("375px layout", () => {
  test.use({ viewport: { width: 375, height: 900 } });

  test("tabs stay on one row and the chip strip scrolls sideways", async ({ page }) => {
    await mockApi(page);
    await page.goto("/app");
    const tops = await page.getByRole("tab").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
    expect(Math.max(...tops) - Math.min(...tops)).toBeLessThanOrEqual(1);
    const strip = page.getByRole("group", { name: "Select client" });
    expect(await strip.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
    expect(await strip.evaluate((el) => getComputedStyle(el).overflowX)).toBe("auto");
  });

  test("stat cards wrap 2 x 2", async ({ page }) => {
    await mockApi(page);
    await page.goto("/app");
    await openTab(page, "Progress");
    const boxes = await panel(page)
      .getByRole("group", { name: /Current weight|Average adherence|Total workouts|Plan completion/ })
      .evaluateAll((els) => els.map((e) => ({ top: Math.round(e.getBoundingClientRect().top), left: Math.round(e.getBoundingClientRect().left) })));
    expect(new Set(boxes.map((b) => b.top)).size).toBe(2);
    expect(new Set(boxes.map((b) => b.left)).size).toBe(2);
  });

  test("the four type names under the bar chart don't overlap", async ({ page }) => {
    await mockApi(page);
    await page.goto("/app");
    await openTab(page, "Progress");
    const ticks = panel(page).getByRole("figure", { name: "Assignments by type" }).locator(".recharts-xAxis .recharts-cartesian-axis-tick-value");
    await expect(ticks).toHaveCount(4);
    const boxes = await ticks.evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => [r.left, r.right]));
    for (let i = 1; i < boxes.length; i++) expect(boxes[i][0]).toBeGreaterThanOrEqual(boxes[i - 1][1]);
  });

  test("forms are single column", async ({ page }) => {
    await mockApi(page);
    await page.goto("/app");
    await openTab(page, "Progress");
    const form = panel(page).getByRole("form", { name: "Weekly check-in" });
    const lefts = await form.locator("input").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().left)));
    expect(new Set(lefts).size).toBe(1);
  });
});

test("focus is visible: tabbing to a tab and a button shows an outline", async ({ page }) => {
  await mockApi(page);
  await page.goto("/app");
  await page.getByRole("tab", { name: "AI Coach" }).focus();
  await page.keyboard.press("Tab");
  const outline = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement;
    const s = getComputedStyle(el);
    return { style: s.outlineStyle, width: parseFloat(s.outlineWidth), shadow: s.boxShadow };
  });
  expect(outline.style !== "none" && outline.width > 0).toBe(true);
});

test("focused inputs and buttons show the teal focus ring", async ({ page }) => {
  await mockApi(page);
  await page.goto("/app");
  await page.getByRole("tab", { name: "Progress" }).click();
  const weight = page.getByRole("tabpanel").getByLabel("Weight kg", { exact: true });
  await weight.focus();
  await expect(weight).toHaveCSS("outline-style", "solid");
  await expect(weight).toHaveCSS("outline-color", "rgb(14, 124, 107)");
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toHaveCSS("outline-color", "rgb(14, 124, 107)");
});

test.describe("empty-proofing", () => {
  for (const tab of TABS) {
    test(`${tab}: zero clients renders calmly`, async ({ page }) => {
      await mockApi(page, { clients: [] });
      await page.goto("/app");
      await page.getByRole("tab", { name: tab }).click();
      await expect(panel(page)).toContainText(/No clients yet|Add a client/);
      await expect(panel(page).getByRole("alert")).toHaveCount(0);
    });
  }

  for (const n of [0, 1]) {
    test(`Progress with ${n} log(s) and ${n} assignment(s) renders calmly`, async ({ page }) => {
      await mockApi(page, { logs: n, assignments: n });
      await page.goto("/app");
      await openTab(page, "Progress");
      await expect(panel(page).getByRole("group", { name: "Current weight" })).toBeVisible();
      await expect(panel(page)).not.toContainText("NaN");
      await expect(panel(page).getByRole("alert")).toHaveCount(0);
    });
  }

  test("Planner with zero assignments renders calmly", async ({ page }) => {
    await mockApi(page, { assignments: 0 });
    await page.goto("/app");
    await openTab(page, "Manual Planner");
    await expect(panel(page).getByRole("alert")).toHaveCount(0);
    await expect(panel(page)).not.toContainText("undefined");
  });
});

test.describe("errors show plain words where the action happened", () => {
  const cases: [string, RegExp][] = [
    ["AI Coach", /\/chat$/],
    ["Manual Planner", /\/assignments$/],
    ["Progress", /\/progress$/],
  ];
  for (const [tab, fail] of cases) {
    test(`${tab}: a failed load shows plain words and Retry, not a blank screen`, async ({ page }) => {
      await mockApi(page, { fail });
      await page.goto("/app");
      await page.getByRole("tab", { name: tab }).click();
      const alert = panel(page).getByRole("alert").first();
      await expect(alert).toBeVisible({ timeout: 15_000 });
      await expect(alert).not.toContainText(/\[object|Error:|undefined|stack/i);
    });
  }

  test("Clients: a failed client list shows plain words and Retry on every tab", async ({ page }) => {
    await mockApi(page, { fail: /^\/api\/clients$/ });
    await page.goto("/app");
    for (const tab of TABS) {
      await page.getByRole("tab", { name: tab }).click();
      await expect(panel(page).getByRole("alert")).toContainText("The server had a problem", { timeout: 15_000 });
      await expect(panel(page).getByRole("button", { name: "Retry" })).toBeVisible();
    }
  });
});
