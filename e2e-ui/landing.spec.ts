// Landing page route, shell and 3D foundation (Prompt 37). Every /api call is mocked.
import { expect, test, type Page } from "@playwright/test";

async function mockApi(page: Page) {
  const apiCalls: string[] = [];
  await page.route("**/api/**", (route) => {
    apiCalls.push(new URL(route.request().url()).pathname);
    return route.fulfill({ json: [] });
  });
  return apiCalls;
}

/** Every script URL the page requested. */
function trackScripts(page: Page) {
  const scripts: string[] = [];
  page.on("request", (req) => {
    if (req.resourceType() === "script") scripts.push(new URL(req.url()).pathname);
  });
  return scripts;
}

test("/ is the landing page: one h1, sticky header with logo, nav, Start free, cream sections, footer", async ({ page }) => {
  const apiCalls = await mockApi(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(page.getByRole("tab")).toHaveCount(0); // not the dashboard

  const header = page.locator("header").first();
  await expect(header).toHaveCSS("position", "sticky");
  await expect(header.getByRole("link", { name: "Repsy home" })).toBeVisible();
  const nav = header.getByRole("navigation", { name: "Landing" });
  for (const [label, href] of [
    ["Features", "#features"],
    ["Demo", "#demo"],
    ["Pricing", "#pricing"],
    ["FAQ", "#faq"],
  ]) {
    await expect(nav.getByRole("link", { name: label })).toHaveAttribute("href", href);
    await expect(page.locator(href)).toBeAttached();
  }
  const start = header.getByRole("link", { name: "Start free" });
  await expect(start).toHaveAttribute("href", "/app");
  await expect(start).toHaveCSS("background-color", "rgb(255, 74, 31)");
  await expect(start).toHaveCSS("color", "rgb(20, 20, 20)");

  await expect(page.locator("section[aria-labelledby=hero-title]")).toHaveCSS("background-color", "rgb(20, 20, 20)");
  await expect(page.locator("#features")).toHaveCSS("background-color", "rgb(250, 247, 242)");

  const legal = page.getByRole("navigation", { name: "Legal" });
  for (const label of ["Privacy", "Terms", "Contact"]) await expect(legal.getByRole("link", { name: label })).toBeVisible();

  expect(apiCalls).toEqual([]); // the landing page calls no API
});

test("landing copy sticks to shipped features: no testimonials, logos or user counts", async ({ page }) => {
  await mockApi(page);
  await page.goto("/");
  await expect(page.locator("#features")).toContainText("Plan by hand");
  const text = (await page.locator("body").textContent()) ?? "";
  for (const fact of ["AI Coach, with the reasoning shown", "Plan by hand", "sets, reps and rest", "Progress you can see", "sample client"]) {
    expect(text).toContain(fact);
  }
  expect(text).not.toMatch(/testimonial|trusted by|\d[\d,]*\+? (coaches|users|customers)/i);
  // The only prices are the 3 published plans (Prompt 41).
  expect(text.match(/\$\d+/g)).toEqual(["$39", "$89", "$199"]);
});

test("Start free opens the dashboard at /app with all 4 tabs", async ({ page }) => {
  await mockApi(page);
  await page.goto("/");
  await page.locator("header").getByRole("link", { name: "Start free" }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole("tab")).toHaveText(["AI Coach", "Clients", "Manual Planner", "Progress"]);
});

test("/app never loads the landing or 3D code", async ({ page }) => {
  await mockApi(page);
  const scripts = trackScripts(page);
  await page.goto("/app");
  await expect(page.getByRole("tab")).toHaveCount(4);
  await page.waitForLoadState("networkidle");
  expect(scripts.some((s) => /Landing|Hero3D|Story|three|gsap/i.test(s))).toBe(false);
});

test("old links to / go to /app once this tab is inside the app; Back still reaches the landing page", async ({ page }) => {
  await mockApi(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.goto("/app");
  await expect(page.getByRole("tab")).toHaveCount(4);
  await page.goto("/");
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole("tab")).toHaveCount(4);
  // A brand-new visitor (new tab) still gets the landing page at /.
  const fresh = await page.context().newPage();
  await mockApi(fresh);
  await fresh.goto("/");
  await expect(fresh.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(fresh).toHaveURL(/\/$/);
});

test.describe("desktop with motion", () => {
  test.use({ viewport: { width: 1280, height: 800 } });
  test("the 3D chunk loads lazily, after the page, and the hero is never blank", async ({ page }) => {
    await mockApi(page);
    const scripts = trackScripts(page);
    await page.goto("/");
    const hero = page.locator("section[aria-labelledby=hero-title]");
    await expect(hero).toHaveAttribute("data-light-mode", "false");
    await expect(hero).toHaveAttribute("data-reduced-motion", "false");
    if ((await hero.getAttribute("data-webgl")) === "true") {
      await expect(hero.locator("canvas")).toBeAttached({ timeout: 15_000 });
      expect(scripts.some((s) => /Hero3D/.test(s))).toBe(true);
    } else {
      await expect(page.getByTestId("hero-poster")).toBeVisible();
    }
    // Hero text stays clickable over the canvas.
    await page.locator("section[aria-labelledby=hero-title]").getByRole("link", { name: "Start free" }).click();
    await expect(page).toHaveURL(/\/app$/);
  });
});

test.describe("reduced motion", () => {
  test.use({ viewport: { width: 1280, height: 800 }, reducedMotion: "reduce" });
  test("the flag is on and the static poster shows instead of the 3D canvas", async ({ page }) => {
    await mockApi(page);
    const scripts = trackScripts(page);
    await page.goto("/");
    const hero = page.locator("section[aria-labelledby=hero-title]");
    await expect(hero).toHaveAttribute("data-reduced-motion", "true");
    await expect(page.getByTestId("hero-poster")).toBeVisible();
    await expect(hero.locator("canvas")).toHaveCount(0);
    await page.waitForLoadState("networkidle");
    expect(scripts.some((s) => /Hero3D/.test(s))).toBe(false);
  });
});

test.describe("phone (375px)", () => {
  test.use({ viewport: { width: 375, height: 800 } });
  test("light-mode flag is on, poster instead of 3D, no sideways scroll, Start free reachable", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");
    const hero = page.locator("section[aria-labelledby=hero-title]");
    await expect(hero).toHaveAttribute("data-light-mode", "true");
    await expect(page.getByTestId("hero-poster")).toBeVisible();
    await expect(page.locator("header").getByRole("link", { name: "Start free" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  });
});
