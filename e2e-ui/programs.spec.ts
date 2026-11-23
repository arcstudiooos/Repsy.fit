// Programs: reusable multi-week plans (Inspo W10, Nov 2026) in Business -> Programs.
//
// The behaviour worth protecting: assigning ALWAYS goes through a preview, the preview saves
// nothing, and the start date is honoured as written rather than snapped to a Monday.
import { expect, test, type Page, type Route, emptyApi } from "./fixtures";

const CLIENTS = [
  { id: "c-maya", coachId: null, name: "Maya Patel", goal: "Strength", age: 29, weightKg: 68, heightCm: 165, level: "Intermediate", focus: "", notes: "", createdAt: "2026-10-01T00:00:00.000Z" },
  { id: "c-dev", coachId: null, name: "Dev Rao", goal: "Fat loss", age: 34, weightKg: 82, heightCm: 178, level: "Beginner", focus: "", notes: "", createdAt: "2026-10-02T00:00:00.000Z" },
];

const PROGRAM = {
  id: "p1",
  name: "8 week strength",
  description: "Base then build",
  phases: [
    {
      id: "ph1",
      name: "Base",
      weeks: 4,
      items: [
        { id: "i1", week: 1, weekday: 1, type: "Workout", title: "Lower body", details: "" },
        { id: "i2", week: 1, weekday: 4, type: "Workout", title: "Upper body", details: "" },
      ],
    },
    { id: "ph2", name: "Build", weeks: 4, items: [{ id: "i3", week: 1, weekday: 1, type: "Workout", title: "Heavy day", details: "" }] },
  ],
  totalWeeks: 8,
  totalItems: 3,
  createdAt: "2026-11-15T00:00:00.000Z",
};

const PREVIEW = {
  startDate: "2026-11-18",
  count: 3,
  items: [
    { date: "2026-11-23", type: "Workout", title: "Lower body", details: "", phaseName: "Base" },
    { date: "2026-11-19", type: "Workout", title: "Upper body", details: "", phaseName: "Base" },
    { date: "2026-12-21", type: "Workout", title: "Heavy day", details: "", phaseName: "Build" },
  ],
};

async function openPrograms(page: Page, programs: unknown[] = [PROGRAM]) {
  const posted: { url: string; body: unknown }[] = [];
  await page.route("**/api/**", (route: Route) =>
    route.fulfill({ status: 200, json: emptyApi(new URL(route.request().url()).pathname) }),
  );
  await page.route("**/api/clients", (route: Route) => route.fulfill({ status: 200, json: CLIENTS }));
  await page.route("**/api/programs**", (route: Route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (req.method() === "GET") return route.fulfill({ status: 200, json: programs });
    posted.push({ url: path, body: req.postDataJSON() });
    if (path.endsWith("/preview")) return route.fulfill({ status: 200, json: PREVIEW });
    if (path.endsWith("/assign")) return route.fulfill({ status: 201, json: { created: 3, startDate: "2026-11-18" } });
    if (path.endsWith("/copy")) return route.fulfill({ status: 201, json: { ...PROGRAM, id: "p2", name: "8 week strength (copy)" } });
    return route.fulfill({ status: 201, json: { ...PROGRAM, id: "new" } });
  });

  await page.goto("/app");
  await page.getByRole("tab", { name: "Business" }).click();
  // Nov 2026: Programs is a Library view - reusable programming, not business.
  await page.getByRole("tab", { name: "Library" }).click();
  await page.getByRole("group", { name: "Library view" }).getByRole("button", { name: "Programs" }).click();
  await expect(page.getByRole("region", { name: "Programs" })).toBeVisible();
  return { posted };
}

test("a program shows the numbers a coach wants before opening it", async ({ page }) => {
  await openPrograms(page);
  const card = page.getByRole("listitem").filter({ hasText: "8 week strength" });
  await expect(card).toContainText("8 weeks");
  await expect(card).toContainText("2 phases");
  await expect(card).toContainText("3 plans");
});

test("the empty state explains what a program is for", async ({ page }) => {
  await openPrograms(page, []);
  await expect(page.getByText(/No programs yet/)).toBeVisible();
});

test("a program is built from phases, each with its own week count", async ({ page }) => {
  const { posted } = await openPrograms(page, []);
  await page.getByRole("button", { name: "New program" }).click();
  const builder = page.getByRole("form", { name: "New program" });
  await builder.getByLabel("Program name").fill("Off season");
  await builder.getByLabel("Phase 1").fill("Base");
  await builder.getByLabel("Weeks").fill("3");
  // The running total is the thing a coach checks while writing.
  await expect(builder.getByText("3 weeks in total.")).toBeVisible();

  await builder.getByRole("button", { name: "Add to this phase" }).click();
  await builder.getByLabel("Title").fill("Lower body");
  await builder.getByLabel("Day").selectOption("3");
  await builder.getByRole("button", { name: "Save program" }).click();

  const body = posted.find((p) => p.url === "/api/programs")?.body as {
    name: string;
    phases: { name: string; weeks: number; items: { week: number; weekday: number; title: string }[] }[];
  };
  expect(body.name).toBe("Off season");
  expect(body.phases[0]).toMatchObject({ name: "Base", weeks: 3 });
  expect(body.phases[0].items[0]).toMatchObject({ week: 1, weekday: 3, title: "Lower body" });
});

test("an item past the end of its phase is refused, in plain words", async ({ page }) => {
  const { posted } = await openPrograms(page, []);
  await page.getByRole("button", { name: "New program" }).click();
  const builder = page.getByRole("form", { name: "New program" });
  await builder.getByLabel("Program name").fill("Too long");
  await builder.getByLabel("Weeks").fill("2");
  await builder.getByRole("button", { name: "Add to this phase" }).click();
  await builder.getByLabel("Title").fill("Week five session");
  // "Week" would also match the phase's "Weeks" box.
  await builder.getByLabel("Week", { exact: true }).fill("5");
  await builder.getByRole("button", { name: "Save program" }).click();
  await expect(builder.getByRole("alert")).toContainText("only runs 2 weeks");
  expect(posted.filter((p) => p.url === "/api/programs")).toHaveLength(0);
});

test("phases reorder by button, with no dragging", async ({ page }) => {
  const { posted } = await openPrograms(page);
  await page.getByRole("button", { name: "Edit" }).click();
  const builder = page.getByRole("form", { name: "Edit program" });
  await expect(builder.getByLabel("Phase 1")).toHaveValue("Base");
  await builder.getByRole("button", { name: "Down" }).first().click();
  await expect(builder.getByLabel("Phase 1")).toHaveValue("Build");
  await builder.getByRole("button", { name: "Save program" }).click();
  const body = posted.find((p) => p.url === "/api/programs/p1")?.body as { phases: { name: string }[] };
  expect(body.phases.map((p) => p.name)).toEqual(["Build", "Base"]);
});

test("giving a program to a client shows the dates BEFORE anything is saved", async ({ page }) => {
  const { posted } = await openPrograms(page);
  await page.getByRole("button", { name: "Give to a client" }).click();
  const panel = page.getByRole("region", { name: "Give 8 week strength to a client" });
  await panel.getByLabel("Which client").selectOption("c-dev");
  await panel.getByLabel("Starts on").fill("2026-11-18");
  await panel.getByRole("button", { name: "Show me the dates" }).click();

  await expect(panel).toContainText("This adds 3 plans to Dev Rao's calendar.");
  // Every date is listed, so nothing is a surprise.
  await expect(panel.getByText("2026-11-19")).toBeVisible();
  await expect(panel.getByText("2026-12-21")).toBeVisible();
  // A preview saves NOTHING.
  expect(posted.map((p) => p.url)).toEqual(["/api/programs/p1/preview"]);
});

test("it says that week 1 starts on the date given, whatever weekday that is", async ({ page }) => {
  await openPrograms(page);
  await page.getByRole("button", { name: "Give to a client" }).click();
  // A coach expects a week to begin on a Monday; this is the surprise worth heading off.
  await expect(page.getByText(/Week 1 begins on this date, whichever day of the week it is/)).toBeVisible();
});

test("only after the preview can the plans be committed", async ({ page }) => {
  const { posted } = await openPrograms(page);
  await page.getByRole("button", { name: "Give to a client" }).click();
  const panel = page.getByRole("region", { name: "Give 8 week strength to a client" });
  // No commit button exists before a preview.
  await expect(panel.getByRole("button", { name: /Add these/ })).toHaveCount(0);
  await panel.getByRole("button", { name: "Show me the dates" }).click();
  await panel.getByRole("button", { name: "Add these 3 to the calendar" }).click();
  expect(posted.map((p) => p.url)).toEqual(["/api/programs/p1/preview", "/api/programs/p1/assign"]);
  await expect(page.getByRole("status")).toContainText("Added 3 plans to Maya Patel's calendar.");
});

test("a program can be applied AS DRAFTS, to review in the planner before publishing", async ({ page }) => {
  const { posted } = await openPrograms(page);
  await page.getByRole("button", { name: "Give to a client" }).click();
  const panel = page.getByRole("region", { name: "Give 8 week strength to a client" });
  await panel.getByRole("button", { name: "Show me the dates" }).click();
  // Opt into drafts: the commit button relabels and the assign call carries asDraft.
  await panel.getByLabel(/Add as drafts/).check();
  await panel.getByRole("button", { name: "Add these 3 as drafts" }).click();
  const assign = posted.find((p) => p.url.endsWith("/assign"));
  expect(assign?.body).toMatchObject({ asDraft: true });
});

test("changing the date drops the stale preview rather than committing it", async ({ page }) => {
  const { posted } = await openPrograms(page);
  await page.getByRole("button", { name: "Give to a client" }).click();
  const panel = page.getByRole("region", { name: "Give 8 week strength to a client" });
  await panel.getByRole("button", { name: "Show me the dates" }).click();
  await expect(panel.getByRole("button", { name: /Add these/ })).toBeVisible();
  await panel.getByLabel("Starts on").fill("2026-12-07");
  // The dates on screen no longer match the date in the box, so the commit button must go.
  await expect(panel.getByRole("button", { name: /Add these/ })).toHaveCount(0);
  await expect(panel.getByRole("button", { name: "Show me the dates" })).toBeVisible();
  expect(posted).toHaveLength(1);
});

test("deleting a program promises not to touch plans already given out", async ({ page }) => {
  await openPrograms(page);
  await page.getByRole("button", { name: "Delete" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText('Delete "8 week strength"?');
  await expect(dialog).toContainText("stay exactly as they are");
});

test("a program with nothing in it cannot be given to anyone", async ({ page }) => {
  await openPrograms(page, [{ ...PROGRAM, totalItems: 0, phases: [] }]);
  await expect(page.getByRole("button", { name: "Give to a client" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Edit" })).toBeVisible();
});

test("duplicating opens the copy, ready to change", async ({ page }) => {
  const { posted } = await openPrograms(page);
  await page.getByRole("button", { name: "Duplicate" }).click();
  expect(posted.map((p) => p.url)).toContain("/api/programs/p1/copy");
  await expect(page.getByRole("form", { name: "Edit program" }).getByLabel("Program name")).toHaveValue("8 week strength (copy)");
});
