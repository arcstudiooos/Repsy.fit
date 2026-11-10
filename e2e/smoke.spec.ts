// Browser smoke tests: app shell, client strip, and empty / loading / error states.
// A small set on purpose - not a full UI suite.
// The client strip and states use the TEMP sample clients and ?tempState scenarios
// (client/src/tempSampleClients.ts); update these tests when Prompt 11 removes TEMP.
import { expect, test, type Page } from "@playwright/test";

const TABS = ["AI Coach", "Clients", "Manual Planner", "Progress"];
const panel = (page: Page) => page.getByRole("tabpanel");
const strip = (page: Page) => page.getByRole("group", { name: "Select client" });

test.describe("app shell", () => {
  test("header strip shows the R mark, REPSY and subtitle", async ({ page }) => {
    await page.goto("/");
    const header = page.locator("header");
    await expect(header).toHaveCSS("background-color", "rgb(20, 20, 20)");
    await expect(header.getByText("R", { exact: true })).toBeVisible();
    await expect(header.getByText("Repsy", { exact: true })).toBeVisible();
    await expect(header.getByText("Prototype - coach command center")).toBeVisible();
  });

  test("exactly 4 horizontal tabs, in order", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("tab")).toHaveText(TABS);
    await expect(page.getByRole("tablist")).toHaveCSS("flex-direction", "row");
    await expect(page.locator("nav, aside, [role=navigation]")).toHaveCount(0);
  });

  test("clicking each tab switches the panel", async ({ page }) => {
    await page.goto("/");
    for (const name of TABS) {
      await page.getByRole("tab", { name }).click();
      await expect(page.getByRole("tab", { name })).toHaveAttribute("aria-selected", "true");
      await expect(panel(page).getByRole("heading", { level: 2 })).toHaveText(name);
    }
  });

  test("phone width: tabs stay in one row and scroll sideways", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    await page.goto("/");
    const r = await page.getByRole("tablist").evaluate((list) => {
      const tops = [...list.children].map((t) => Math.round(t.getBoundingClientRect().top));
      return {
        oneRow: Math.max(...tops) - Math.min(...tops) <= 1,
        scrolls: list.scrollWidth > list.clientWidth,
        pageScrolls: document.documentElement.scrollWidth > window.innerWidth,
      };
    });
    expect(r).toEqual({ oneRow: true, scrolls: true, pageScrolls: false });
  });
});

test.describe("client strip", () => {
  test("shows 3 chips with initials, first name and goal", async ({ page }) => {
    await page.goto("/");
    const chips = strip(page).getByRole("button");
    await expect(chips).toHaveCount(3);
    await expect(chips.nth(0)).toHaveText(/^MPMayaFat loss \+ strength$/);
    await expect(chips.nth(1)).toHaveText(/^AMArjunMuscle gain$/);
    await expect(chips.nth(2)).toHaveText(/^CJCaseyMarathon prep \+ conditioning$/);
  });

  test("defaults to the first client, with the accent border", async ({ page }) => {
    await page.goto("/");
    await expect(panel(page)).toContainText("Selected: Maya Patel");
    const maya = strip(page).getByRole("button", { name: /Maya/ });
    await expect(maya).toHaveAttribute("aria-pressed", "true");
    await expect(maya).toHaveCSS("border-top-color", "rgb(255, 74, 31)");
  });

  test("tapping a chip changes the selected client on all three tabs", async ({ page }) => {
    await page.goto("/");
    for (const [first, full] of [["Arjun", "Arjun Mehta"], ["Casey", "Casey Jordan"]]) {
      await page.getByRole("tab", { name: "AI Coach" }).click();
      await strip(page).getByRole("button", { name: new RegExp(first) }).click();
      for (const tab of ["AI Coach", "Manual Planner", "Progress"]) {
        await page.getByRole("tab", { name: tab }).click();
        await expect(panel(page)).toContainText(`Selected: ${full}`);
      }
    }
  });

  test("Clients tab has no strip", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("tab", { name: "Clients" }).click();
    await expect(strip(page)).toHaveCount(0);
  });
});

test.describe("states (TEMP ?tempState)", () => {
  test("loading: shows the Loading... card", async ({ page }) => {
    await page.goto("/?tempState=loading");
    await expect(page.getByRole("status")).toHaveText(/loading\.\.\./i);
  });

  test("error: plain-words message, Retry refetches", async ({ page }) => {
    await page.goto("/?tempState=error");
    const alert = page.getByRole("alert");
    await expect(alert).toContainText("We couldn't reach the server. Check your connection and try again.");
    await expect(alert).not.toContainText("/api");
    await page.getByRole("button", { name: "Retry" }).click();
    await expect(page.getByRole("status")).toBeVisible(); // refetching
    await expect(page.getByRole("alert")).toBeVisible(); // scenario still fails
  });

  test("empty: card with both buttons and the note", async ({ page }) => {
    await page.goto("/?tempState=empty");
    await expect(panel(page)).toContainText("Add your first client, or load demo clients to explore.");
    await expect(page.getByRole("button", { name: "Add a client" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Load demo clients" })).toBeVisible();
    await expect(panel(page)).toContainText("Demo data is sample data - delete any client anytime.");
  });

  test("empty: Add a client switches to the Clients tab", async ({ page }) => {
    await page.goto("/?tempState=empty");
    await page.getByRole("button", { name: "Add a client" }).click();
    await expect(page.getByRole("tab", { name: "Clients" })).toHaveAttribute("aria-selected", "true");
  });
});
