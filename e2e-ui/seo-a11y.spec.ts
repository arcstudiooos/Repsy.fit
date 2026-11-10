// Landing polish: SEO / sharing and accessibility (Prompt 42). Every /api call is mocked.
import { expect, test, type Page } from "@playwright/test";

async function open(page: Page) {
  await page.route("**/api/**", (route) => route.fulfill({ json: [] }));
  await page.goto("/");
  await expect(page.locator("#pricing")).toBeAttached();
}

test("title, description, canonical, Open Graph and Twitter tags", async ({ page }) => {
  await open(page);
  await expect(page).toHaveTitle(/Repsy Coach/);
  const meta = (sel: string) => page.locator(sel).first().getAttribute("content");
  expect(await meta('meta[name="description"]')).toMatch(/fitness coaches/);
  expect(await page.locator('link[rel="canonical"]').getAttribute("href")).toBe("https://repsy-coach.onrender.com/");
  for (const p of ["og:title", "og:description", "og:url", "og:image", "og:type"]) {
    expect(await meta(`meta[property="${p}"]`), p).toBeTruthy();
  }
  expect(await meta('meta[property="og:image"]')).toBe("https://repsy-coach.onrender.com/og-image.png");
  expect(await meta('meta[name="twitter:card"]')).toBe("summary_large_image");
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute("href", "/favicon.png");
});

test("the share image is a static 1200x630 PNG in the repo", async ({ page, request }) => {
  const res = await request.get("/og-image.png");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toBe("image/png");
  await page.goto("/og-image.png");
  const size = await page.locator("img").evaluate((img: HTMLImageElement) => [img.naturalWidth, img.naturalHeight]);
  expect(size).toEqual([1200, 630]);
});

test("semantic headings: exactly one h1, sections use h2", async ({ page }) => {
  await open(page);
  await expect(page.locator("h1")).toHaveCount(1);
  for (const id of ["features", "demo", "pricing", "faq", "start"]) {
    await expect(page.locator(`#${id} h2`).first()).toBeAttached();
  }
});

test("every interactive element is reachable by keyboard and shows a visible focus ring", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await open(page);
  // Open all FAQ items so nothing is hidden, then walk the whole page with Tab.
  // Number each focusable element so repeated labels (e.g. "Try it in the app") stay distinct.
  const total = await page.evaluate(() => {
    const els = [...document.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), input, summary")].filter(
      (el) => el.getClientRects().length > 0,
    );
    els.forEach((el, i) => (el.dataset.focusIdx = String(i)));
    return els.length;
  });
  const seen = new Set<string>();
  const noRing: string[] = [];
  for (let i = 0; i < total + 5; i++) {
    await page.keyboard.press("Tab");
    const info = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const s = getComputedStyle(el);
      const key = `${el.dataset.focusIdx ?? "?"}:${el.tagName}:${(el.textContent ?? "").trim().slice(0, 30)}`;
      return { key, ring: s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0 };
    });
    if (!info) continue;
    seen.add(info.key);
    if (!info.ring) noRing.push(info.key);
  }
  expect(noRing).toEqual([]);
  expect(seen.size).toBeGreaterThanOrEqual(total);
});

test("orange buttons use dark bold text (#141414)", async ({ page }) => {
  await open(page);
  const buttons = page.locator(".btn-primary");
  const n = await buttons.count();
  expect(n).toBeGreaterThan(3);
  for (let i = 0; i < n; i++) {
    await expect(buttons.nth(i)).toHaveCSS("color", "rgb(20, 20, 20)");
    expect(Number(await buttons.nth(i).evaluate((el) => getComputedStyle(el).fontWeight))).toBeGreaterThanOrEqual(700);
  }
});

test("demo controls are labelled for screen readers", async ({ page }) => {
  await open(page);
  const demo = page.getByTestId("demo-widget");
  await expect(demo.getByRole("group", { name: "Demo client" })).toBeVisible();
  await expect(demo.getByRole("group", { name: "Quick ask" })).toBeVisible();
  await expect(demo.getByRole("textbox", { name: /Ask about/ })).toBeVisible();
  await expect(demo.getByRole("list", { name: "Demo plan list" })).toBeAttached();
});

test.describe("WebGL disabled", () => {
  test("poster shows and the page still converts (lead form works)", async ({ page }) => {
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      // @ts-expect-error - test override
      HTMLCanvasElement.prototype.getContext = function (type: string, ...rest: unknown[]) {
        if (/webgl/i.test(type)) return null;
        // @ts-expect-error - passthrough
        return original.call(this, type, ...rest);
      };
    });
    await page.route("**/api/**", (route) =>
      new URL(route.request().url()).pathname === "/api/leads"
        ? route.fulfill({ status: 201, json: { id: "x", name: "Ana", email: "ana@example.com", createdAt: "2026-11-10T00:00:00Z" } })
        : route.fulfill({ json: [] }),
    );
    await page.goto("/");
    await expect(page.getByTestId("hero-poster")).toBeVisible();
    const form = page.getByRole("form", { name: "Start free" });
    await form.getByLabel("Name").fill("Ana");
    await form.getByLabel("Email").fill("ana@example.com");
    await form.getByRole("button", { name: "Start free" }).click();
    await expect(page.getByTestId("lead-result")).toContainText("You're on the list, Ana.");
  });
});
