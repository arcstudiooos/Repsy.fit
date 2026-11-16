// The app shell: a working canvas, not a reading column (Nov 2026).
//
// The shell was capped at `max-w-[1100px]` - a reading width inherited from the marketing page. It
// cost 266px on a 1366 screen and 820px on a 1920 one, but the real damage was structural: with
// room for only one pane, every relationship in the product became a REPLACEMENT (roster replaced
// by client, list replaced by form), which is what produced "Back to all clients", "Switch client"
// and the back-and-forth the owner complained about.
import { expect, test, type Page, type Route, emptyApi, openClientTab } from "./fixtures";

const NAMES = ["Maya Patel", "Arjun Rao", "Leo Brooks", "Garima Sharma", "Ishaan Verma",
  "Neha Gupta", "Rohit Khanna", "Priya Nair", "Vikram Singh", "Ananya Bose"];
const roster = NAMES.map((name, i) => ({
  id: `c${i}`, coachId: "c1", name, goal: "Fat loss", age: 29, weightKg: 58, heightCm: 165,
  level: "Beginner", focus: "", notes: "", goalDate: null, goalEvent: "",
  createdAt: "2026-10-01T00:00:00.000Z",
}));

async function openWorkspace(page: Page, width: number, height = 900) {
  await page.route("**/api/**", (route: Route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/clients") return route.fulfill({ status: 200, json: roster });
    return route.fulfill({ status: 200, json: emptyApi(path) });
  });
  await page.setViewportSize({ width, height });
  await page.goto("/app");
  await openClientTab(page, "Plans");
}

test("the canvas uses the screen instead of a 1100px column", async ({ page }) => {
  await openWorkspace(page, 1600);
  const main = (await page.locator("main").boundingBox())!;
  // Comfortably past the old cap, and still capped so an ultra-wide monitor does not stretch a
  // table to 2500px - which is its own kind of unreadable.
  expect(main.width).toBeGreaterThan(1300);
  expect(main.width).toBeLessThanOrEqual(1600);
});

test("the roster stays beside the client instead of being replaced by them", async ({ page }) => {
  await openWorkspace(page, 1440);
  const rail = page.getByRole("navigation", { name: "Clients" });
  await expect(rail).toBeVisible();
  // Every client is reachable without leaving the one being worked on.
  await expect(rail.getByRole("button", { name: "Leo Brooks" })).toBeVisible();

  const railBox = (await rail.boundingBox())!;
  const header = (await page.getByRole("region", { name: "Selected client" }).boundingBox())!;
  // Side by side, not stacked.
  expect(header.x).toBeGreaterThan(railBox.x + railBox.width - 10);
});

test("with the rail on screen, the two controls that only undid a navigation are gone", async ({ page }) => {
  await openWorkspace(page, 1440);
  await expect(page.getByRole("button", { name: "Back to all clients" })).toBeHidden();
  await expect(page.getByRole("button", { name: "Switch client" })).toBeHidden();
  // The roster GRID is still reachable, because it holds what the rail cannot: add, invite, delete.
  await page.getByRole("navigation", { name: "Clients" }).getByRole("button", { name: "All clients" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Clients" })).toBeVisible();
});

test("switching client from the rail keeps the same sub-tab", async ({ page }) => {
  await openWorkspace(page, 1440);
  await page.getByRole("tab", { name: "Progress", exact: true }).click();
  await page.getByRole("navigation", { name: "Clients" }).getByRole("button", { name: "Arjun Rao" }).click();
  await expect(page.getByRole("region", { name: "Selected client" })).toContainText("Arjun Rao");
  // The coach was reading Progress; changing WHO should not change WHAT.
  await expect(page.getByRole("tab", { name: "Progress", exact: true })).toHaveAttribute("aria-selected", "true");
});

test("on a phone it is one pane, with the back link and the switcher that go with it", async ({ page }) => {
  await openWorkspace(page, 390, 844);
  await expect(page.getByRole("navigation", { name: "Clients" })).toBeHidden();
  await expect(page.getByRole("button", { name: "Back to all clients" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Switch client" })).toBeVisible();
  // No sideways scrolling.
  expect(await page.evaluate(() => document.body.scrollWidth)).toBeLessThanOrEqual(390);
});

test("the AI Coach tab keeps its switcher, because it has no rail", async ({ page }) => {
  await page.route("**/api/**", (route: Route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/clients") return route.fulfill({ status: 200, json: roster });
    return route.fulfill({ status: 200, json: emptyApi(path) });
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/app");
  await page.getByRole("tab", { name: "AI Coach" }).click();
  await expect(page.getByRole("navigation", { name: "Clients" })).toHaveCount(0);
  // Hiding this globally would have left no way to change client here at all.
  await expect(page.getByRole("button", { name: "Switch client" })).toBeVisible();
});
