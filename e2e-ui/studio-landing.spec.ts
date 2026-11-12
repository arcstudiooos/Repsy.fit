// The "Studio" landing at /?design=studio (Nov 2026). Every /api call is mocked.
// Most checks run with reduced motion so scroll reveals don't gate them; one test covers motion.
import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

const URL_ = "/?design=studio";

async function open(page: Page, opts: { motion?: boolean } = {}) {
  const posts: Record<string, unknown>[] = [];
  const scripts: string[] = [];
  page.on("request", (r) => r.resourceType() === "script" && scripts.push(new URL(r.url()).pathname));
  await page.route("**/api/**", async (route) => {
    const req = route.request();
    if (req.method() === "POST" && new URL(req.url()).pathname === "/api/leads") {
      const body = req.postDataJSON() as { name: string; email: string };
      posts.push(body);
      return route.fulfill({ status: 201, json: { id: "l1", name: body.name.trim(), email: body.email, createdAt: new Date().toISOString() } });
    }
    return route.fulfill({ json: [] });
  });
  if (!opts.motion) await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(URL_);
  await expect(page.getByTestId("studio-landing")).toBeVisible();
  return { posts, scripts };
}

/** Text blocks a reader can't see: effective opacity 0 (multiplied up the tree) or visibility hidden. */
async function invisibleText(page: Page) {
  return page.locator("main :is(h1,h2,h3,p,li)").evaluateAll((els) =>
    els
      .filter((e) => {
        if (e.closest(".sr-only, [aria-hidden=true]")) return false;
        const r = e.getBoundingClientRect();
        if (r.height === 0 || r.width === 0) return false;
        if (getComputedStyle(e).visibility === "hidden") return true;
        let o = 1;
        for (let n: Element | null = e; n; n = n.parentElement) o *= Number(getComputedStyle(n).opacity);
        return o < 0.05;
      })
      .map((e) => (e.textContent ?? "").trim().slice(0, 40)),
  );
}

/** WCAG contrast of an element's text colour against the first opaque background behind it. */
async function contrastOf(page: Page, selector: string) {
  return page.locator(selector).first().evaluate((el) => {
    const parse = (c: string): number[] | null => {
      const m = c.match(/^rgba?\(([^)]+)\)/);
      if (m) {
        const v = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
        return [v[0], v[1], v[2], v[3] ?? 1];
      }
      const s = c.match(/^color\(srgb ([^)]+)\)/);
      if (s) {
        const v = s[1].split(/[ /]+/).filter(Boolean).map(Number);
        return [v[0] * 255, v[1] * 255, v[2] * 255, v[3] ?? 1];
      }
      return null;
    };
    const lum = ([r, g, b]: number[]) =>
      [r, g, b].map((v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
    const fg = parse(getComputedStyle(el).color)!;
    let bg: number[] | null = null;
    for (let n: Element | null = el; n && !bg; n = n.parentElement) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c && c[3] > 0.99) bg = c;
    }
    const [a, b] = [lum(fg), lum(bg ?? [255, 255, 255])].sort((x, y) => y - x);
    return (a + 0.05) / (b + 0.05);
  });
}

test("one h1, every section in order, nav anchors resolve, footer links to real routes", async ({ page }) => {
  await open(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Plan it.");
  await expect(page.getByRole("tab")).toHaveCount(0); // not the dashboard
  for (const id of ["how", "why", "pricing", "faq", "get"]) await expect(page.locator(`#${id}`)).toHaveCount(1);
  for (const href of ["#how", "#why", "#pricing", "#faq"]) await expect(page.getByRole("navigation", { name: "Sections" }).locator(`a[href="${href}"]`)).toHaveCount(1);
  const footer = page.locator("footer");
  for (const href of ["/login", "/register", "/client/login", "/privacy", "/terms"]) await expect(footer.locator(`a[href="${href}"]`)).toHaveCount(1);
  // Headings are in order, h2 under h1, no skipped levels.
  const levels = await page.locator("main :is(h1,h2,h3)").evaluateAll((els) => els.map((e) => Number(e.tagName[1])));
  for (let i = 1; i < levels.length; i++) expect(levels[i] - levels[i - 1]).toBeLessThanOrEqual(1);
});

test("the default / is unchanged (the Studio page is opt-in)", async ({ page }) => {
  await page.route("**/api/**", (r) => r.fulfill({ json: [] }));
  await page.goto("/");
  await expect(page.getByTestId("studio-landing")).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
});

test("hero deck: four client cards; only the top card is in the a11y tree", async ({ page }) => {
  await open(page);
  await expect(page.locator("[data-strip]")).toHaveCount(4);
  await expect(page.locator('[data-strip] > [aria-hidden="true"]')).toHaveCount(3);
  for (const n of ["Maya", "Arjun", "Casey", "Leo"]) await expect(page.locator("[data-strip] .ln-chip", { hasText: n })).toHaveCount(1);
});

test("plan-type toggle swaps the phone between a workout and a nutrition plan, and is announced", async ({ page }) => {
  await open(page);
  const phone = page.locator(".ln-phone-screen");
  const workout = page.getByRole("button", { name: "Workout", exact: true });
  const nutrition = page.getByRole("button", { name: "Nutrition", exact: true });
  await expect(workout).toHaveAttribute("aria-pressed", "true");
  await expect(phone.getByText("Back Squat")).toBeVisible();
  await nutrition.click();
  await expect(nutrition).toHaveAttribute("aria-pressed", "true");
  await expect(workout).toHaveAttribute("aria-pressed", "false");
  await expect(phone.getByText("Chicken rice bowl")).toBeVisible();
  await expect(phone.getByText("Back Squat")).toHaveCount(0);
  await expect(page.getByText("Showing the Nutrition plan")).toHaveCount(1);
});

test("FAQ chat: six questions, tapping one shows Repsy's answer, tapping again hides it", async ({ page }) => {
  await open(page);
  const qs = page.locator("#faq button[aria-expanded]");
  await expect(qs).toHaveCount(6);
  await qs.nth(2).click();
  await expect(qs.nth(2)).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#faq [role=status]")).toContainText("only ever see your own clients");
  await expect(page.locator("#faq [role=status]")).not.toContainText("typing");
  await qs.nth(2).click();
  await expect(page.locator("#faq [role=status]")).toHaveCount(0);
});

test("pricing shows the three published plans and the trial", async ({ page }) => {
  await open(page);
  const plans = page.locator("#pricing").getByTestId("plan");
  await expect(plans).toHaveCount(3);
  await expect(plans.nth(0)).toContainText("$39");
  await expect(plans.nth(1)).toContainText("$89");
  await expect(plans.nth(2)).toContainText("$199");
  await expect(page.locator("#pricing")).toContainText("7-day free trial");
});

test("the lead form posts to /api/leads and confirms", async ({ page }) => {
  const { posts } = await open(page);
  const form = page.getByRole("form", { name: "Start free" });
  await form.getByLabel("Name").fill("Priya Coach");
  await form.getByLabel("Email").fill("priya@example.com");
  await form.getByRole("button", { name: /start free/i }).click();
  await expect(page.getByTestId("lead-result")).toContainText("You're on the list, Priya Coach.");
  expect(posts).toEqual([{ name: "Priya Coach", email: "priya@example.com" }]);
});

test("reduced motion on a wide screen: no animation chunk, no pins, the whole story readable", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const { scripts } = await open(page);
  await page.waitForLoadState("networkidle");
  expect(scripts.some((s) => /motion-/.test(s))).toBe(false);
  await expect(page.locator(".pin-spacer")).toHaveCount(0);
  await expect(page.locator(".ln-pause")).toHaveCount(0);
  await expect(page.locator(".ln-cursor")).toHaveCount(0);
  // The old-way scene's ending (the Repsy beat and the app card) is shown, not left on frame one.
  await expect(page.getByText("Progress.", { exact: true })).toBeVisible();
  await expect(page.locator("[data-nb-app]").getByText("Maya Patel", { exact: true })).toBeVisible();
  await expect(page.locator("[data-nb-x]")).toBeHidden();
  expect(await invisibleText(page)).toEqual([]);
});

test("with motion on a wide screen: GSAP loads lazily, two scenes pin, and motion can be paused", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const { scripts } = await open(page, { motion: true });
  await expect(page.locator(".pin-spacer")).toHaveCount(2);
  expect(scripts.some((s) => /motion-/.test(s))).toBe(true);
  const pause = page.getByRole("button", { name: "Pause motion" });
  await pause.click();
  await expect(page.getByRole("button", { name: "Play motion" })).toBeVisible();
  await expect(page.getByTestId("studio-landing")).toHaveClass(/is-paused/);
  await expect(page.locator(".ln-marquee")).toHaveCSS("animation-play-state", "paused");
  // Scrolling the hero scene tears the sheet: the stamps become visible.
  await page.mouse.wheel(0, 1400);
  await expect(page.locator("[data-stamp]").first()).not.toHaveCSS("opacity", "0", { timeout: 5000 });
  // The chart's scan line sweeps a few times and then stops (WCAG 2.2.2: under 5 seconds).
  await page.locator("[data-scan]").evaluate((e) => e.scrollIntoView({ block: "center" }));
  await expect(page.locator("[data-scan]")).toHaveCSS("opacity", "0", { timeout: 8000 });
});

for (const width of [1024, 1440]) {
  test(`hero deal at ${width}px: the dealt cards never cover the text`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await open(page, { motion: true });
    await expect(page.locator(".pin-spacer")).toHaveCount(2);
    await page.mouse.wheel(0, 1300);
    await expect(page.locator("[data-strip-chip]").first()).toHaveCSS("opacity", "1", { timeout: 6000 });
    const overlap = await page.evaluate(() => {
      const text = [...document.querySelectorAll("[data-hero-copy] :is(h1,p,a,li)")].map((e) => e.getBoundingClientRect());
      const strips = [...document.querySelectorAll("[data-strip]")].map((e) => e.getBoundingClientRect());
      return strips.some((s) => text.some((c) => s.left < c.right && s.right > c.left && s.top < c.bottom && s.bottom > c.top));
    });
    expect(overlap).toBe(false);
  });
}

test("the road draws gradually with scroll (not a jump from nothing to all)", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, { motion: true });
  await expect(page.locator(".pin-spacer")).toHaveCount(2);
  const road = page.locator("[data-road]");
  const top = await page.locator("#how").evaluate((e) => e.getBoundingClientRect().top + window.scrollY);
  // Scroll gradually to the middle of the road section.
  for (let y = top - 900; y <= top + 400; y += 200) {
    await page.evaluate((v) => window.scrollTo(0, v), y);
    await page.waitForTimeout(60);
  }
  await expect
    .poll(async () => road.evaluate((p) => parseFloat(getComputedStyle(p).strokeDashoffset)), { timeout: 4000 })
    .toBeGreaterThan(150);
  const off = await road.evaluate((p) => parseFloat(getComputedStyle(p).strokeDashoffset));
  expect(off).toBeGreaterThan(150); // part drawn ...
  expect(off).toBeLessThan(850); // ... and part still to come
});

test("tablet width (900px): the hero stays a still sheet, only the notebook scene pins", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 900 });
  await open(page, { motion: true });
  await expect(page.locator(".pin-spacer")).toHaveCount(1);
  await expect(page.locator("[data-scene=notebook] .pin-spacer, .pin-spacer:has([data-nb-pin])")).toHaveCount(1);
});

test("resizing from desktop to phone removes the scenes and leaves everything readable", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, { motion: true });
  await expect(page.locator(".pin-spacer")).toHaveCount(2);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".pin-spacer")).toHaveCount(0);
  await expect(page.getByTestId("studio-landing")).not.toHaveClass(/ln-anim/);
  // Scroll through so nothing depends on a reveal that never ran.
  expect(await invisibleText(page)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBe(0);
});

test("contrast: body greys reach 4.5:1 and the dim heading halves 3:1", async ({ page }) => {
  await open(page);
  expect(await contrastOf(page, ".ln-who")).toBeGreaterThanOrEqual(4.5);
  expect(await contrastOf(page, "#how .ln-card p")).toBeGreaterThanOrEqual(4.5);
  expect(await contrastOf(page, ".ln-tag-light")).toBeGreaterThanOrEqual(4.5);
  expect(await contrastOf(page, ".ln-h2 .ln-dim")).toBeGreaterThanOrEqual(3);
});

test("phone: no sideways scroll, no animation chunk, nothing hidden", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { scripts } = await open(page, { motion: true });
  await page.waitForLoadState("networkidle");
  expect(await invisibleText(page)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBe(0);
  expect(scripts.some((s) => /motion-/.test(s))).toBe(false);
  await expect(page.locator(".ln-cursor")).toHaveCount(0);
});

test("keyboard: skip link first, then the nav, and every control has a name", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page);
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toHaveText("Skip to content");
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toHaveAttribute("aria-label", "Repsy, back to top");
  // Every visible link and button has an accessible name.
  const snapshot = await page.locator("body").ariaSnapshot();
  expect(snapshot).not.toMatch(/- (link|button)\s*(:|$)/m);
});

test("colour rule: the Studio landing uses only the theme.css tokens (no new hex colours)", () => {
  const theme = fs.readFileSync(path.resolve(__dirname, "../client/src/theme.css"), "utf8");
  const allowed = new Set((theme.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).map((h) => h.toLowerCase()));
  for (const file of ["landing-new.css", "scenes.tsx", "StudioLanding.tsx", "icons.tsx"]) {
    const src = fs.readFileSync(path.resolve(__dirname, "../client/src/landing-new", file), "utf8");
    const used = [...new Set((src.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).map((h) => h.toLowerCase()))].filter((h) => !/^#ln-/.test(h));
    expect(used.filter((h) => !allowed.has(h)), `${file} uses hex colours that are not theme tokens`).toEqual([]);
  }
});
