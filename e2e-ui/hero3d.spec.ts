// Interactive 3D hero (Prompt 38). Since design A1 the default hero is the live sheet; the 3D
// hero is kept and opens at /?hero=3d. Every /api call is mocked.
import { expect, test, type Page } from "@playwright/test";

const hero = (page: Page) => page.locator("section[aria-labelledby=hero-title]");

async function open(page: Page) {
  await page.route("**/api/**", (route) => route.fulfill({ json: [] }));
  await page.goto("/?hero=3d");
  await expect(hero(page).getByRole("heading", { level: 1 })).toBeVisible();
}

/** Makes the browser report no WebGL, like a device where it is disabled. */
async function disableWebGL(page: Page) {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    // @ts-expect-error - narrowing the overloads for the test
    HTMLCanvasElement.prototype.getContext = function (type: string, ...rest: unknown[]) {
      if (/webgl/i.test(type)) return null;
      // @ts-expect-error - passthrough
      return original.call(this, type, ...rest);
    };
  });
}

test("headline, sub-line and both buttons; text and buttons stay usable over the canvas", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await open(page);
  await expect(hero(page).getByRole("heading", { level: 1 })).toHaveText("Coach every client. Let AI do the planning busywork.");
  await expect(hero(page)).toContainText("reasoning");
  await expect(hero(page)).toContainText("sets, reps and rest");
  await expect(hero(page).getByRole("link", { name: "Start free" })).toHaveAttribute("href", "/app");
  await expect(hero(page).getByRole("link", { name: "See it in action" })).toHaveAttribute("href", "#demo");
  // The headline can be selected (not under a pointer-events:none layer).
  expect(await hero(page).locator("h1").evaluate((el) => getComputedStyle(el).pointerEvents)).not.toBe("none");
  await hero(page).getByRole("link", { name: "See it in action" }).click();
  await expect(page).toHaveURL(/#demo$/);
});

test.describe("desktop with WebGL", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("renders a labelled canvas that ignores the pointer, and pauses off-screen", async ({ page }) => {
    await open(page);
    test.skip((await hero(page).getAttribute("data-webgl")) !== "true", "This browser has no WebGL");
    const canvas = hero(page).locator("canvas");
    await expect(canvas).toBeAttached({ timeout: 20_000 });
    await expect(hero(page).getByRole("img", { name: "Decorative 3D animation" })).toBeAttached();
    expect(await canvas.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe("none");
    // Pixel ratio is capped at 2.
    const ratio = await canvas.evaluate((el: HTMLCanvasElement) => el.width / el.getBoundingClientRect().width);
    expect(ratio).toBeLessThanOrEqual(2.01);
    await expect(hero(page)).toHaveAttribute("data-rendering", "true");

    // Moving the pointer and scrolling never throws or blanks the hero.
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    for (let i = 0; i <= 10; i++) await page.mouse.move(100 + i * 100, 200 + i * 30);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(hero(page)).toHaveAttribute("data-rendering", "false");
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(hero(page)).toHaveAttribute("data-rendering", "true");
    expect(errors).toEqual([]);
  });

  test("the canvas actually draws something (not a blank hero)", async ({ page }) => {
    await open(page);
    test.skip((await hero(page).getAttribute("data-webgl")) !== "true", "This browser has no WebGL");
    await expect(hero(page).locator("[data-ready=true]")).toBeAttached({ timeout: 20_000 });
    await page.waitForTimeout(1500);
    const shot = await hero(page).locator("canvas").screenshot();
    // A drawn scene has many distinct colours; a flat background has very few.
    const distinct = new Set<string>();
    for (let i = 0; i < shot.length - 3; i += 97) distinct.add(`${shot[i]}-${shot[i + 1]}-${shot[i + 2]}`);
    expect(distinct.size).toBeGreaterThan(40);
  });
});

test.describe("fallback poster", () => {
  test("WebGL disabled: poster with the progress ring, no canvas", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await disableWebGL(page);
    await open(page);
    await expect(hero(page)).toHaveAttribute("data-webgl", "false");
    await expect(page.getByTestId("hero-poster")).toBeVisible();
    await expect(page.getByTestId("hero-poster").locator("img")).toBeVisible();
    await expect(hero(page).locator("canvas")).toHaveCount(0);
    await expect(hero(page).getByRole("link", { name: "Start free" })).toBeVisible();
  });

  test.describe("reduced motion", () => {
    test.use({ viewport: { width: 1280, height: 800 }, reducedMotion: "reduce" });
    test("poster instead of the scene", async ({ page }) => {
      await open(page);
      await expect(page.getByTestId("hero-poster")).toBeVisible();
      await expect(hero(page).locator("canvas")).toHaveCount(0);
    });
  });

  test.describe("375px phone", () => {
    test.use({ viewport: { width: 375, height: 800 } });
    test("poster, dark scrim behind the text, readable and no sideways scroll", async ({ page }) => {
      await open(page);
      await expect(page.getByTestId("hero-poster")).toBeVisible();
      await expect(hero(page).locator("canvas")).toHaveCount(0);
      const scrim = await hero(page).locator(".landing-scrim").evaluate((el) => getComputedStyle(el).backgroundImage);
      expect(scrim).toContain("linear-gradient");
      await expect(hero(page).getByRole("heading", { level: 1 })).toBeInViewport();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    });
  });
});
