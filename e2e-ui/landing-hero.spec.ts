// Landing design A1 with the animated "live sheet" hero (user-approved). Every /api call is mocked.
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

test("the default hero is the live sheet: serif headline, animated planning flow, two actions", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page);
  await expect(hero(page)).toHaveAttribute("data-hero", "live-sheet");
  const h1 = hero(page).locator("h1");
  await expect(h1).toHaveText("Plans with the why written in.");
  expect(await h1.evaluate((el) => getComputedStyle(el).fontFamily)).toContain("Instrument Serif");
  expect(await h1.evaluate((el) => getComputedStyle(el).textTransform)).toBe("none");
  await expect(hero(page).getByRole("img", { name: /Animated example of Repsy planning/ })).toBeVisible();
  // The description follows the client on screen.
  await expect(hero(page).getByRole("img", { name: /Now showing Maya Patel/ })).toBeVisible();
  await expect(hero(page).getByRole("link", { name: "Start free" })).toHaveAttribute("href", "/app");
  await expect(hero(page).getByRole("link", { name: "See it in action" })).toHaveAttribute("href", "#demo");
  // The only real control in the scene is the Pause button (the "Assign" pill is part of the picture).
  await expect(hero(page).getByRole("button")).toHaveText(["Pause animation"]);
});

test("the sheet plays ask -> reason -> plan -> assigned, then turns to the next client", async ({ page }) => {
  test.setTimeout(40_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page);
  const sheet = page.locator(".ls-page");
  await expect(sheet).toHaveAttribute("data-client", "Maya Patel");
  for (const step of ["think", "reason", "plan", "assigned"]) await expect(sheet).toHaveAttribute("data-step", step, { timeout: 8_000 });
  await expect(sheet).toContainText("Why: Adherence climbed from 72% to 86%");
  await expect(sheet).toContainText("Back Squat");
  await expect(sheet).toContainText("4 × 6 · 120s");
  await expect(sheet.locator(".ls-assign")).toHaveText("Assigned ✓");
  await expect(page.locator(".ls-page")).toHaveAttribute("data-client", "Arjun Mehta", { timeout: 8_000 });
});

test("Pause stops the animation and Play resumes it", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page);
  await page.locator(".ls-page[data-step=reason]").waitFor({ timeout: 8_000 });
  const pause = hero(page).getByRole("button", { name: "Pause animation" });
  await pause.click();
  await expect(hero(page).getByRole("button", { name: "Play animation" })).toHaveAttribute("aria-pressed", "true");
  // Nothing moves while paused: same step, same text, and CSS animations are frozen too.
  const snapshot = () => page.locator(".ls-page").evaluate((el) => `${el.getAttribute("data-step")}|${el.textContent}`);
  const before = await snapshot();
  await page.waitForTimeout(2000);
  expect(await snapshot()).toBe(before);
  const states = await page.locator(".ls-wrap *").evaluateAll((els) =>
    els.filter((el) => getComputedStyle(el).animationName !== "none").map((el) => getComputedStyle(el).animationPlayState),
  );
  expect(states.every((s) => s === "paused")).toBe(true);
  await hero(page).getByRole("button", { name: "Play animation" }).click();
  await expect(page.locator(".ls-page")).toHaveAttribute("data-step", "plan", { timeout: 8_000 });
});

test("the hero never changes height while it animates (no layout shift)", async ({ page }) => {
  test.setTimeout(30_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page);
  const heights = new Set<number>();
  for (let i = 0; i < 14; i++) {
    heights.add(Math.round((await hero(page).boundingBox())!.height));
    await page.waitForTimeout(600);
  }
  expect([...heights]).toHaveLength(1);
});

test("headline and sheet don't overlap, and the headline stays on two lines at 1440px", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page);
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.fonts.check('400 64px "Instrument Serif"'))).toBe(true);
  const h1 = (await page.locator("#hero-title").boundingBox())!;
  const sheet = (await page.locator(".ls-wrap").boundingBox())!;
  expect(h1.x + h1.width).toBeLessThanOrEqual(sheet.x);
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
  test("a still, finished frame: no loop, no Pause button, no animation", async ({ page }) => {
    await open(page);
    const sheet = page.locator(".ls-page");
    await expect(sheet).toHaveAttribute("data-step", "assigned");
    await expect(sheet).toContainText("Why: Adherence climbed from 72% to 86%, so she can handle one heavier day.");
    await expect(hero(page).getByRole("button")).toHaveCount(0);
    await page.waitForTimeout(1500);
    await expect(sheet).toHaveAttribute("data-client", "Maya Patel");
    for (const sel of [".ls-page", ".ls-stamp", ".a1-underlined path"]) {
      expect(await page.locator(sel).first().evaluate((el) => getComputedStyle(el).animationName), sel).toBe("none");
    }
  });
});

test.describe("375px phone", () => {
  test.use({ viewport: { width: 375, height: 800 } });
  test("no sideways scroll, sheet rows fit, Start free reachable", async ({ page }) => {
    await open(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    const sheet = (await page.locator(".ls-page").boundingBox())!;
    for (const row of await page.locator(".ls-rows li").all()) {
      const b = (await row.boundingBox())!;
      expect(b.x + b.width).toBeLessThanOrEqual(sheet.x + sheet.width + 1);
    }
    await expect(hero(page).getByRole("link", { name: "Start free" })).toBeInViewport();
  });
});

test("the landing-only fonts (pen notes, classic hero) never load on /app", async ({ page }) => {
  const fontCss: string[] = [];
  page.on("request", (req) => {
    if (req.url().includes("fonts.googleapis.com")) fontCss.push(req.url());
  });
  await page.route("**/api/**", (route) => route.fulfill({ json: [] }));
  await page.goto("/app");
  await expect(page.getByRole("tab")).toHaveCount(7);
  await page.waitForLoadState("networkidle");
  expect(fontCss.some((u) => /Caveat|Barlow/.test(u))).toBe(false);
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

test("the loop stops when the hero is scrolled off-screen", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await open(page);
  await page.locator(".ls-page[data-step=think]").waitFor({ timeout: 8_000 });
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect(page.locator(".ls-wrap")).toHaveAttribute("data-paused", "true");
  const step = await page.locator(".ls-page").getAttribute("data-step");
  await page.waitForTimeout(2500);
  expect(await page.locator(".ls-page").getAttribute("data-step")).toBe(step);
});

test("/app headings: serif h2 at weight 400, Geist body, no faux-bold serif anywhere", async ({ page }) => {
  await page.route("**/api/**", (route) => route.fulfill({ json: [] }));
  await page.goto("/app");
  await expect(page.getByRole("tab")).toHaveCount(7);
  const h2 = page.locator("h2").first();
  await expect(h2).toHaveCSS("font-family", /Instrument Serif/);
  await expect(h2).toHaveCSS("font-weight", "400");
  expect(await page.evaluate(() => getComputedStyle(document.body).fontFamily)).toMatch(/Geist/);
  const fauxBold = await page.locator("body *").evaluateAll((els) =>
    els.filter((el) => /Instrument Serif/.test(getComputedStyle(el).fontFamily.split(",")[0]) && Number(getComputedStyle(el).fontWeight) > 400).length,
  );
  expect(fauxBold).toBe(0);
});
