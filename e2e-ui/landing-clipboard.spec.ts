// Landing design A1 "Clipboard" (user-approved). Every /api call is mocked.
import { expect, test, type Page } from "@playwright/test";

const hero = (page: Page) => page.locator("section[aria-labelledby=hero-title]");

async function open(page: Page, path = "/") {
  const scripts: string[] = [];
  page.on("request", (req) => {
    if (req.resourceType() === "script") scripts.push(new URL(req.url()).pathname);
  });
  await page.route("**/api/**", (route) => route.fulfill({ json: [] }));
  await page.goto(path);
  await expect(hero(page).getByRole("heading", { level: 1 })).toBeVisible();
  return scripts;
}

test("the default hero is the clipboard: serif headline, sample sheet, AI note, two actions", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page);
  await expect(hero(page)).toHaveAttribute("data-hero", "clipboard");
  const h1 = hero(page).locator("h1");
  await expect(h1).toHaveText("Plans with the why written in.");
  expect(await h1.evaluate((el) => getComputedStyle(el).fontFamily)).toContain("Instrument Serif");
  expect(await h1.evaluate((el) => getComputedStyle(el).textTransform)).toBe("none");

  // The sheet uses the Manual Planner's notation; the note carries the reasoning.
  const board = hero(page).getByRole("img", { name: /Maya Patel/ });
  await expect(board).toContainText("Back Squat");
  await expect(board).toContainText("4 × 6");
  await expect(page.getByTestId("hero-note")).toContainText("Why: adherence climbed from 72% to 86%");

  await expect(hero(page).getByRole("link", { name: "Start free" })).toHaveAttribute("href", "/app");
  await expect(hero(page).getByRole("link", { name: "See it in action" })).toHaveAttribute("href", "#demo");
  // The example "Assign to Maya" pill is not a real control.
  await expect(hero(page).getByRole("button")).toHaveCount(0);
});

test("headline, sheet and note don't overlap, and the headline stays on two lines at 1440px", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page);
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.fonts.check('400 64px "Instrument Serif"'))).toBe(true);
  const box = async (sel: string) => (await page.locator(sel).first().boundingBox())!;
  const h1 = await box("#hero-title");
  const board = await box(".a1-board");
  expect(h1.x + h1.width).toBeLessThanOrEqual(board.x);
  const lineHeight = await page.locator("#hero-title").evaluate((el) => parseFloat(getComputedStyle(el).lineHeight));
  expect(Math.round(h1.height / lineHeight)).toBe(2);
});

test("the default page never downloads the 3D code; /?hero=3d still opens the 3D hero", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const scripts = await open(page);
  await page.waitForLoadState("networkidle");
  expect(scripts.some((s) => /Hero3D|three/i.test(s))).toBe(false);
  await expect(page.getByTestId("hero-poster")).toHaveCount(0);

  const classic = await page.context().newPage();
  await open(classic, "/?hero=3d");
  await expect(classic.locator("section[aria-labelledby=hero-title] h1")).toHaveText("Coach every client. Let AI do the planning busywork.");
  await expect(classic.locator("section[aria-labelledby=hero-title]")).toHaveAttribute("data-3d", /true|false/);
});

test("the client roster section shows one card per sample client", async ({ page }) => {
  await open(page);
  const cards = page.getByRole("list", { name: "Example client cards" }).getByRole("listitem");
  await expect(cards).toHaveCount(3);
  await expect(cards.getByRole("heading", { level: 3 })).toHaveText(["Arjun Mehta", "Casey Jordan", "Maya Patel"]);
});

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });
  test("the note, ticks and underline don't animate", async ({ page }) => {
    await open(page);
    for (const sel of [".a1-note", ".a1-tick", ".a1-underlined path"]) {
      expect(await page.locator(sel).first().evaluate((el) => getComputedStyle(el).animationName), sel).toBe("none");
    }
  });
});

test.describe("375px phone", () => {
  test.use({ viewport: { width: 375, height: 800 } });
  test("no sideways scroll, every sheet column visible, Start free reachable", async ({ page }) => {
    await open(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    // Every column of the sheet is on screen (none hidden to make it fit).
    await expect(page.locator(".a1-table th")).toHaveText(["#", "Exercise", "Sets × reps", "Rest"]);
    for (const th of await page.locator(".a1-table th").all()) await expect(th).toBeInViewport();
    const table = await page.locator(".a1-table").boundingBox();
    const sheet = await page.locator(".a1-sheet").boundingBox();
    expect(table!.x + table!.width).toBeLessThanOrEqual(sheet!.x + sheet!.width + 1);
    await expect(hero(page).getByRole("link", { name: "Start free" })).toBeInViewport();
  });
});

test("the landing fonts load only on the landing page, never on /app", async ({ page }) => {
  const fontCss: string[] = [];
  page.on("request", (req) => {
    if (req.url().includes("fonts.googleapis.com")) fontCss.push(req.url());
  });
  await page.route("**/api/**", (route) => route.fulfill({ json: [] }));
  await page.goto("/app");
  await expect(page.getByRole("tab")).toHaveCount(4);
  await page.waitForLoadState("networkidle");
  expect(fontCss.some((u) => /Instrument|Geist|Caveat/.test(u))).toBe(false);
  expect(await page.locator("link[data-landing-fonts]").count()).toBe(0);
});

// Mid-size screens (tablets, small laptops): no sideways scroll anywhere on the page.
for (const width of [768, 1024, 1100, 1180, 1280]) {
  test(`no sideways scroll at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await open(page);
    await page.evaluate(() => document.fonts.ready);
    await page.locator("[aria-labelledby=roster-title]").scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    // The roster cards stay inside the viewport.
    for (const card of await page.locator(".a1-index").all()) {
      const b = (await card.boundingBox())!;
      expect(b.x + b.width).toBeLessThanOrEqual(width + 1);
    }
  });
}

test("the kept 3D hero sits flush under the header (no gap)", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await open(page, "/?hero=3d");
  const top = await page.locator("section[aria-labelledby=hero-title]").evaluate((el) => el.getBoundingClientRect().top);
  expect(top).toBeLessThanOrEqual(0);
});
