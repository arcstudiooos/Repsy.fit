// Writing a plan from a Home task row (Nov 2026 UI batch).
//
// A row saying "no plan for 9 days" used to offer only a jump into another tab, losing the list of
// everything else still waiting. Now the plan is written over Home and the row clears itself.
import { expect, test, type Page, type Route, emptyApi } from "./fixtures";

const client = (id: string, name: string) => ({
  id, coachId: "c1", name, goal: "Fat loss", age: 29, weightKg: 58, heightCm: 165,
  level: "Beginner", focus: "", notes: "", goalDate: null, goalEvent: "",
  createdAt: "2026-10-01T00:00:00.000Z",
});

// Without a roster the app shows its "No clients yet" onboarding instead of the dashboard, so Home
// has to have clients before any of this is reachable.
const roster = [client("c1", "Maya Patel"), client("c2", "Garima Sharma")];

const idle = (clientId: string, clientName: string, daysSince: number) => ({
  kind: "idle" as const, clientId, clientName, daysSince, text: `No plan for ${daysSince} days`,
});

async function openHome(page: Page) {
  const calls: string[] = [];
  let tasks = [idle("c1", "Maya Patel", 9), idle("c2", "Garima Sharma", 12)];
  await page.route("**/api/**", (route: Route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/clients") return route.fulfill({ status: 200, json: roster });
    if (path.includes("/tasks/today")) return route.fulfill({ status: 200, json: { date: "2026-11-16", tasks } });
    if (path.endsWith("/assignments") && route.request().method() === "POST") {
      calls.push(`${path.split("/")[3]} ${(route.request().postDataJSON() as { title: string }).title}`);
      // The server would no longer call this client idle, so neither does the next fetch.
      tasks = tasks.filter((t) => t.clientId !== path.split("/")[3]);
      return route.fulfill({ status: 201, json: { id: "a1" } });
    }
    return route.fulfill({ status: 200, json: emptyApi(path) });
  });
  await page.goto("/app");
  await page.getByRole("tab", { name: "Home" }).click();
  return { calls };
}

test("the plan is written over Home, and the row it clears disappears", async ({ page }) => {
  const { calls } = await openHome(page);
  await page.getByRole("button", { name: "New plan: Maya Patel" }).click();
  const dialog = page.getByRole("dialog", { name: "New plan for Maya Patel" });
  await expect(dialog).toBeVisible();

  const form = dialog.getByRole("form", { name: "New assignment" });
  await form.getByLabel("Title").fill("Upper body");
  await form.getByLabel("Details").fill("3 sets of 10");
  await form.getByRole("button", { name: "Assign plan" }).click();

  await expect(dialog.getByText(/Plan saved for Maya Patel/)).toBeVisible();
  await expect.poll(() => calls).toEqual(["c1 Upper body"]);
  // Home never went anywhere.
  await expect(page.getByRole("tab", { name: "Home" })).toHaveAttribute("aria-selected", "true");

  // And Home now agrees with what the coach just did.
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("button", { name: "New plan: Maya Patel" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "New plan: Garima Sharma" })).toBeVisible();
});

test("a due task still opens the planner, because a plan is reviewed in its own week", async ({ page }) => {
  await page.route("**/api/**", (route: Route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/clients") return route.fulfill({ status: 200, json: roster });
    if (path.includes("/tasks/today")) {
      return route.fulfill({ status: 200, json: { date: "2026-11-16", tasks: [
        { kind: "due", clientId: "c1", clientName: "Maya Patel", assignmentId: "a1", assignmentType: "Workout", text: "Leg day due today" },
      ] } });
    }
    return route.fulfill({ status: 200, json: emptyApi(path) });
  });
  await page.goto("/app");
  await page.getByRole("tab", { name: "Home" }).click();
  // Deliberately NOT a dialog: there is no "New plan" on a row whose plan already exists.
  await expect(page.getByRole("button", { name: /New plan/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Open in Plans: Maya Patel" }).click();
  await expect(page.getByRole("tab", { name: "Plans", exact: true })).toHaveAttribute("aria-selected", "true");
});
