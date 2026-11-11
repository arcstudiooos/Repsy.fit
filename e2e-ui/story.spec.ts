// Scroll animations and feature story (Prompt 39). Every /api call is mocked.
import { expect, test, type Page } from "@playwright/test";

const story = (page: Page) => page.locator("#features");
const WEIGHT = "74.1 kg";

async function open(page: Page) {
  await page.route("**/api/**", (route) => route.fulfill({ json: [] }));
  await page.goto("/");
  await expect(story(page).locator("[data-story=progress]")).toBeAttached();
}

/** Scrolls through the page slowly, like a visitor. */
async function scrollThrough(page: Page) {
  const height = await page.evaluate(() => document.body.scrollHeight);
  for (let y = 0; y <= height; y += 250) {
    await page.mouse.wheel(0, 250);
    await page.waitForTimeout(120);
  }
}

/** Every animated element is in its final state: visible, untransformed, full text. */
async function expectFinalState(page: Page) {
  const bubbles = story(page).locator("[data-anim=bubble]");
  for (let i = 0; i < (await bubbles.count()); i++) {
    const b = bubbles.nth(i);
    await expect(b).toHaveText((await b.getAttribute("data-full"))!);
  }
  await expect(story(page).locator("[data-anim=count]").first()).toHaveText(WEIGHT, { timeout: 5_000 });
  await expect(story(page).locator("[data-anim=count]").nth(1)).toHaveText("84%");
  await expect(story(page).locator("[data-anim=count]").nth(2)).toHaveText("26");
  await expect(story(page).locator("[data-anim=row]")).toHaveText([
    /^1\. Back Squat — 4 sets × 6 reps · Rest 120s$/,
    /^2\. Romanian Deadlift — 3 sets × 8 reps · Rest 90s$/,
    /^3\. Bench Press — 4 sets × 6 reps · Rest 120s$/,
    /^4\. Barbell Row — 3 sets × 10 reps · Rest 60s$/,
  ]);
  await expect
    .poll(() =>
      story(page)
        .locator("[data-anim]")
        .evaluateAll((els) =>
          els.filter((e) => {
            const s = getComputedStyle(e);
            const offset = parseFloat(s.strokeDashoffset || "0");
            return parseFloat(s.opacity) < 0.99 || (s.transform !== "none" && s.transform !== "matrix(1, 0, 0, 1, 0, 0)") || offset > 0.001;
          }).length,
        ),
    )
    .toBe(0);
}

test("four sections, factual copy, each ending with 'Try it in the app' to /app", async ({ page }) => {
  await open(page);
  for (const name of ["problem", "ai", "planner", "progress"]) {
    const section = story(page).locator(`[data-story=${name}]`);
    await expect(section.getByRole("heading", { level: 2 })).toBeVisible();
    await expect(section.getByRole("link", { name: "Try it in the app" })).toHaveAttribute("href", "/app");
  }
  const text = (await story(page).textContent()) ?? "";
  for (const fact of ["reasoning", "Nothing is saved until you tap", "sets, reps and rest", "Active, Done or Paused", "weight, adherence and plans-by-type", "sample data"]) {
    expect(text).toContain(fact);
  }
  expect(text).not.toMatch(/\$\s?\d|testimonial|trusted by|\d[\d,]*\+? (coaches|users|customers)/i);
});

test.describe("desktop", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("animations wait for their section, then end in the final state; only the AI Coach is pinned", async ({ page }) => {
    await open(page);
    await expect(story(page)).toHaveAttribute("data-animated", "ready");
    // Before scrolling, the progress numbers have not counted up yet.
    await expect(story(page).locator("[data-anim=count]").first()).not.toHaveText(WEIGHT);
    await expect(page.locator(".pin-spacer")).toHaveCount(1);
    await expect(page.locator(".pin-spacer [data-story=ai]")).toBeAttached();
    await scrollThrough(page);
    await page.waitForTimeout(2500);
    await expectFinalState(page);
  });

  test("each animation plays once: scrolling back up and down again doesn't replay it", async ({ page }) => {
    await open(page);
    await scrollThrough(page);
    await page.waitForTimeout(2500);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);
    await scrollThrough(page);
    // Final text is there immediately, not re-typed or re-counted from zero.
    await expect(story(page).locator("[data-anim=count]").first()).toHaveText(WEIGHT, { timeout: 500 });
    const bubble = story(page).locator("[data-anim=bubble]").nth(1);
    await expect(bubble).toHaveText((await bubble.getAttribute("data-full"))!, { timeout: 500 });
  });

  test("leaving the landing page cleans up without errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await open(page);
    await scrollThrough(page);
    await page.locator("header").getByRole("link", { name: "Start free" }).click();
    await expect(page.getByRole("tab")).toHaveCount(5);
    expect(errors).toEqual([]);
  });
});

test.describe("375px phone", () => {
  test.use({ viewport: { width: 375, height: 800 } });
  test("no pinning, final state after scrolling, no sideways scroll", async ({ page }) => {
    await open(page);
    await expect(page.locator(".pin-spacer")).toHaveCount(0);
    await scrollThrough(page);
    await page.waitForTimeout(2500);
    await expectFinalState(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  });
});

test.describe("reduced motion", () => {
  test.use({ viewport: { width: 1280, height: 800 }, reducedMotion: "reduce" });
  test("everything is in its final state at once, with no pinning", async ({ page }) => {
    await open(page);
    await expect(page.locator(".pin-spacer")).toHaveCount(0);
    await expect(story(page)).not.toHaveAttribute("data-animated", /.*/);
    await expectFinalState(page);
  });
});
