// Writing a plan from a client's own card (Nov 2026 UI batch).
//
// A coach looking at the roster often already knows who needs a plan. Making them open the client's
// workspace, find the Plans tab, write it and navigate back was the long way round - the same
// "going back and forward between screens" problem the library had. It is the SAME dialog Home
// uses, from the same module, so what gets saved cannot drift between the two entry points.
import { expect, test, type Page, type Route, emptyApi } from "./fixtures";

const client = (id: string, name: string) => ({
  id, coachId: "c1", name, goal: "Fat loss", age: 29, weightKg: 58, heightCm: 165,
  level: "Beginner", focus: "", notes: "", goalDate: null, goalEvent: "",
  createdAt: "2026-10-01T00:00:00.000Z",
});

const roster = [client("c-maya", "Maya Patel"), client("c-arjun", "Arjun Rao")];

async function openRoster(page: Page) {
  const calls: string[] = [];
  await page.route("**/api/**", (route: Route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/clients") return route.fulfill({ status: 200, json: roster });
    if (path.endsWith("/assignments") && route.request().method() === "POST") {
      calls.push(`${path.split("/")[3]} ${(route.request().postDataJSON() as { title: string }).title}`);
      return route.fulfill({ status: 201, json: { id: "a1" } });
    }
    return route.fulfill({ status: 200, json: emptyApi(path) });
  });
  await page.goto("/app");
  await page.getByRole("tab", { name: "Clients" }).click();
  await expect(page.getByText("Maya Patel")).toBeVisible();
  return { calls };
}

test("the plan is written from the card, and the roster is never left", async ({ page }) => {
  const { calls } = await openRoster(page);
  await page.getByRole("button", { name: "More actions for Maya Patel" }).click();
  await page.getByRole("menuitem", { name: "New plan" }).click();

  const dialog = page.getByRole("dialog", { name: "New plan for Maya Patel" });
  await expect(dialog).toBeVisible();
  const form = dialog.getByRole("form", { name: "New assignment" });
  await form.getByLabel("Title").fill("Upper body");
  await form.getByLabel("Details").fill("3 sets of 10");
  await form.getByRole("button", { name: "Assign plan" }).click();

  await expect(dialog.getByText(/Plan saved for Maya Patel/)).toBeVisible();
  await expect.poll(() => calls).toEqual(["c-maya Upper body"]);
  // Still on the roster: the question was answered where it was asked.
  await expect(page.getByRole("tab", { name: "Clients" })).toHaveAttribute("aria-selected", "true");
});

test("it writes against the client whose card was used, not the first one", async ({ page }) => {
  const { calls } = await openRoster(page);
  await page.getByRole("button", { name: "More actions for Arjun Rao" }).click();
  await page.getByRole("menuitem", { name: "New plan" }).click();
  const dialog = page.getByRole("dialog", { name: "New plan for Arjun Rao" });
  const form = dialog.getByRole("form", { name: "New assignment" });
  await form.getByLabel("Title").fill("Legs");
  await form.getByLabel("Details").fill("Squats");
  await form.getByRole("button", { name: "Assign plan" }).click();
  await expect.poll(() => calls).toEqual(["c-arjun Legs"]);
});

test("Escape leaves the roster untouched and saves nothing", async ({ page }) => {
  const { calls } = await openRoster(page);
  await page.getByRole("button", { name: "More actions for Maya Patel" }).click();
  await page.getByRole("menuitem", { name: "New plan" }).click();
  const dialog = page.getByRole("dialog", { name: "New plan for Maya Patel" });
  await dialog.getByRole("form", { name: "New assignment" }).getByLabel("Title").fill("Abandoned");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  expect(calls).toEqual([]);
  await expect(page.getByText("Maya Patel")).toBeVisible();
});
