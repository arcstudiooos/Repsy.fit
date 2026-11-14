// The exercise catalogue in Library -> Exercises (Inspo W1, Nov 2026).
//
// A small fake server keeps the coach's own exercises in memory and honours the scope / search /
// filter query string, so the list reacts like the real one. Repsy's stock rows are read-only: the
// test that matters most is that a stock card offers "Copy to my library" and NOT Edit or Delete.
import { expect, test, type Page, type Route, openLibrary } from "./fixtures";

type Ex = {
  id: string;
  name: string;
  equipment: string;
  muscleGroup: string;
  mediaUrl: string;
  instructions: string;
  stock: boolean;
};

const ex = (over: Partial<Ex> = {}): Ex => ({
  id: "e" + Math.random().toString(36).slice(2, 8),
  name: "Back Squat",
  equipment: "Barbell",
  muscleGroup: "Legs",
  mediaUrl: "",
  instructions: "",
  stock: false,
  ...over,
});

const STOCK: Ex[] = [
  ex({ id: "s1", name: "Push-Up", equipment: "Bodyweight", muscleGroup: "Chest", stock: true, instructions: "Body in one line." }),
  ex({ id: "s2", name: "Back Squat", equipment: "Barbell", muscleGroup: "Legs", stock: true }),
  ex({ id: "s3", name: "Plank", equipment: "Bodyweight", muscleGroup: "Core", stock: true, mediaUrl: "https://example.com/plank" }),
];

async function openExercises(page: Page, mine: Ex[] = []) {
  const own = [...mine];
  let nextId = 100;

  await page.route("**/api/**", (route: Route) => route.fulfill({ status: 200, json: [] }));
  await page.route("**/api/auth/me", (route: Route) =>
    route.fulfill({ status: 200, json: { id: "coach-test", name: "Coach", email: "c@example.com", createdAt: "2026-01-01T00:00:00.000Z", currency: "INR", units: "kg", country: null } }),
  );

  await page.route("**/api/exercises**", async (route: Route) => {
    const req = route.request();
    const url = new URL(req.url());

    if (req.method() === "POST" && url.pathname.endsWith("/copy")) {
      const id = url.pathname.split("/").slice(-2)[0];
      const source = [...STOCK, ...own].find((e) => e.id === id)!;
      const copy = { ...source, id: "c" + nextId++, name: `${source.name} (copy)`, stock: false };
      own.push(copy);
      return route.fulfill({ status: 201, json: copy });
    }
    if (req.method() === "POST") {
      const body = req.postDataJSON() as Partial<Ex>;
      if (own.some((e) => e.name === body.name)) {
        return route.fulfill({ status: 409, json: { error: "You already have an exercise with that name." } });
      }
      const created = ex({ ...body, id: "n" + nextId++, stock: false });
      own.push(created);
      return route.fulfill({ status: 201, json: created });
    }
    if (req.method() === "PUT") {
      const id = url.pathname.split("/").pop()!;
      const body = req.postDataJSON() as Partial<Ex>;
      const i = own.findIndex((e) => e.id === id);
      own[i] = { ...own[i], ...body };
      return route.fulfill({ status: 200, json: own[i] });
    }
    if (req.method() === "DELETE") {
      const id = url.pathname.split("/").pop()!;
      const i = own.findIndex((e) => e.id === id);
      own.splice(i, 1);
      return route.fulfill({ status: 204, body: "" });
    }

    // GET: apply scope, search and filters the way the server does.
    const scope = url.searchParams.get("scope") ?? "all";
    const q = (url.searchParams.get("q") ?? "").toLowerCase();
    const equipment = url.searchParams.get("equipment") ?? "";
    const muscleGroup = url.searchParams.get("muscleGroup") ?? "";
    let items = scope === "mine" ? own : scope === "stock" ? STOCK : [...STOCK, ...own];
    if (q) items = items.filter((e) => e.name.toLowerCase().includes(q));
    if (equipment) items = items.filter((e) => e.equipment === equipment);
    if (muscleGroup) items = items.filter((e) => e.muscleGroup === muscleGroup);
    items = [...items].sort((a, b) => a.name.localeCompare(b.name));
    return route.fulfill({ status: 200, json: items });
  });

  await page.goto("/app");
  await openLibrary(page, "Exercises");
  await expect(page.getByRole("heading", { name: "Exercises" })).toBeVisible();
}

test("the stock catalogue is listed and badged, and is not editable", async ({ page }) => {
  await openExercises(page);
  const pushUp = page.getByRole("listitem").filter({ hasText: "Push-Up" });
  await expect(pushUp).toBeVisible();
  // Badged as Repsy's, with its tags.
  await expect(pushUp.getByText("Repsy")).toBeVisible();
  await expect(pushUp.getByText("Bodyweight")).toBeVisible();
  await expect(pushUp.getByText("Chest")).toBeVisible();
  // A coach cannot edit or delete a shared movement - only take their own copy.
  await expect(pushUp.getByRole("button", { name: "Copy to my library" })).toBeVisible();
  await expect(pushUp.getByRole("button", { name: "Edit" })).toHaveCount(0);
  await expect(pushUp.getByRole("button", { name: "Delete" })).toHaveCount(0);
});

test("a demo link opens in a new tab and is never embedded", async ({ page }) => {
  await openExercises(page);
  const link = page.getByRole("listitem").filter({ hasText: "Plank" }).getByRole("link", { name: "Watch demo" });
  await expect(link).toHaveAttribute("href", "https://example.com/plank");
  await expect(link).toHaveAttribute("target", "_blank");
  // No iframe/video element: CSP stays untouched.
  await expect(page.locator("iframe, video")).toHaveCount(0);
});

test("the coach adds an exercise of their own, then edits it", async ({ page }) => {
  await openExercises(page);
  await page.getByRole("button", { name: "Add exercise" }).click();
  const form = page.getByRole("form", { name: "Add exercise" });
  await form.getByLabel("Name").fill("Sled Push");
  await form.getByLabel("Equipment").selectOption("Other");
  await form.getByLabel("Muscle group").selectOption("Legs");
  await form.getByLabel("How to do it (optional)").fill("Low body, short steps.");
  await form.getByRole("button", { name: "Save exercise" }).click();

  await expect(page.getByRole("status")).toContainText('Saved "Sled Push"');
  const card = page.getByRole("listitem").filter({ hasText: "Sled Push" });
  await expect(card.getByText("Low body, short steps.")).toBeVisible();
  // Their own exercise has no Repsy badge and can be changed.
  await expect(card.getByText("Repsy")).toHaveCount(0);

  await card.getByRole("button", { name: "Edit" }).click();
  const editForm = page.getByRole("form", { name: "Edit exercise" });
  await editForm.getByLabel("Name").fill("Sled Push (heavy)");
  await editForm.getByRole("button", { name: "Save exercise" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "Sled Push (heavy)" })).toBeVisible();
});

test("a duplicate name is refused in plain words", async ({ page }) => {
  await openExercises(page, [ex({ id: "m1", name: "Sled Push" })]);
  await page.getByRole("button", { name: "Add exercise" }).click();
  const form = page.getByRole("form", { name: "Add exercise" });
  await form.getByLabel("Name").fill("Sled Push");
  await form.getByRole("button", { name: "Save exercise" }).click();
  await expect(form.getByRole("alert")).toContainText("already have an exercise with that name");
});

test("an empty name never reaches the server", async ({ page }) => {
  await openExercises(page);
  let posted = false;
  await page.route("**/api/exercises", (route: Route) => {
    if (route.request().method() === "POST") posted = true;
    return route.fallback();
  });
  await page.getByRole("button", { name: "Add exercise" }).click();
  const form = page.getByRole("form", { name: "Add exercise" });
  await form.getByLabel("Name").fill("   ");
  await form.getByRole("button", { name: "Save exercise" }).click();
  await expect(form.getByRole("alert")).toContainText("Give the exercise a name");
  expect(posted).toBe(false);
});

test("copying a stock movement puts an editable copy in the coach's library", async ({ page }) => {
  await openExercises(page);
  await page.getByRole("listitem").filter({ hasText: "Push-Up" }).getByRole("button", { name: "Copy to my library" }).click();
  await expect(page.getByRole("status")).toContainText('Copied to your library as "Push-Up (copy)"');
  // It shows up under My library, where it is editable.
  await page.getByRole("group", { name: "Which exercises" }).getByRole("button", { name: "My library" }).click();
  const copy = page.getByRole("listitem").filter({ hasText: "Push-Up (copy)" });
  await expect(copy).toBeVisible();
  await expect(copy.getByRole("button", { name: "Edit" })).toBeVisible();
  // The instructions came along with it.
  await expect(copy.getByText("Body in one line.")).toBeVisible();
});

test("search and the equipment filter narrow the list", async ({ page }) => {
  await openExercises(page);
  await expect(page.getByRole("listitem")).toHaveCount(3);
  await page.getByLabel("Search").fill("squat");
  await expect(page.getByRole("listitem")).toHaveCount(1);
  await expect(page.getByRole("listitem").first()).toContainText("Back Squat");

  await page.getByLabel("Search").fill("");
  await page.getByLabel("Equipment").selectOption("Bodyweight");
  await expect(page.getByRole("listitem")).toHaveCount(2);
  await expect(page.getByText("2 exercises")).toBeVisible();

  // A filter that matches nothing explains itself instead of showing a blank panel.
  await page.getByLabel("Muscle group").selectOption("Glutes");
  await expect(page.getByRole("listitem")).toHaveCount(0);
  await expect(page.getByText(/No exercise matches those filters/)).toBeVisible();
});

test("My library explains itself when the coach has added nothing yet", async ({ page }) => {
  await openExercises(page);
  await page.getByRole("group", { name: "Which exercises" }).getByRole("button", { name: "My library" }).click();
  await expect(page.getByText(/You have not added any exercises of your own yet/)).toBeVisible();
});

test("deleting one of the coach's own exercises asks first", async ({ page }) => {
  await openExercises(page, [ex({ id: "m1", name: "Sled Push" })]);
  await page.getByRole("listitem").filter({ hasText: "Sled Push" }).getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("dialog")).toContainText('Delete "Sled Push"?');
  await page.getByRole("button", { name: "Delete exercise" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "Sled Push" })).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("Exercise deleted");
});
