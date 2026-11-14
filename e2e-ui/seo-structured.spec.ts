// SEO plumbing that crawlers rely on (owner, Nov 2026): the static shell in index.html, structured
// data, the sitemap, robots.txt and the prerendered /pricing page. The shell must say the same things
// the React landing says - if the two drift, this file fails before anything reaches search results.
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { FAQ_CHAT, FREE_PLAN, PLAN_STEPS } from "../client/src/landing-new/content";

const seo = JSON.parse(readFileSync(path.join(__dirname, "../client/src/landing-new/seo.json"), "utf8")) as {
  hero: { h1: string; lead: string };
  sections: { h: string; p: string }[];
  plans: { name: string; price: number; clients: string }[];
};
const dist = (f: string) => readFileSync(path.join(__dirname, "../client/dist", f), "utf8");

test("the landing copy and the crawlable shell say the same things", async ({ page }) => {
  // Prices and client limits come from one place.
  // The prices in seo.json (what crawlers and AI assistants read) must match the ones on the page.
  expect(seo.plans.map((p) => p.price)).toEqual([FREE_PLAN.price, ...PLAN_STEPS.map((s) => s.price)]);
  expect(seo.plans.map((p) => p.clients)).toEqual([
    `Up to ${FREE_PLAN.clients} clients, free forever`,
    ...PLAN_STEPS.map((s) => `Up to ${s.clients} clients`),
  ]);
  await page.goto("/");
  // textContent, not innerText: scene elements stay hidden until scrolled into view.
  await expect(page.getByTestId("studio-landing")).toBeVisible();
  const text = ((await page.locator("body").textContent()) ?? "").replace(/\s+/g, " ");
  expect(text).toContain(seo.hero.lead);
  for (const s of seo.sections) expect(text.toLowerCase()).toContain(s.p.toLowerCase().slice(0, 60));
});

test("index.html carries the shell and valid structured data", () => {
  const html = dist("index.html");
  // The shell sits INSIDE #root. It was in <noscript> for a while to stop a flash of unstyled text,
  // but an SEO audit showed non-rendering crawlers then read nine words, so it is back - with its
  // styles inlined in the head (landing-new.css is in the lazy chunk and is not there at first paint).
  const shell = html.slice(html.indexOf('<div id="root">'), html.indexOf("</body>"));
  expect(shell).toContain("data-seo-shell");
  expect(shell).toContain(seo.hero.h1);
  expect(html).toMatch(/<style>[^<]*\[data-seo-shell\]\{min-height:100svh/);
  for (const f of FAQ_CHAT) expect(shell).toContain(f.a.slice(0, 50));
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
  const types = blocks.map((b) => b["@type"]);
  expect(types).toEqual(["WebSite", "Organization", "SoftwareApplication", "FAQPage"]);
  const app = blocks[2] as { offers: { name: string; price: string }[] };
  expect(app.offers.map((o) => Number(o.price))).toEqual([FREE_PLAN.price, ...PLAN_STEPS.map((s) => s.price)]);
  const faqLd = blocks[3] as { mainEntity: { name: string }[] };
  expect(faqLd.mainEntity).toHaveLength(FAQ_CHAT.length);
  // The shell is plain markup: no runnable inline script is added (the CSP forbids them).
  expect(html).not.toMatch(/<script(?![^>]*type="application\/ld\+json")[^>]*>[^<]/);
});

test("sitemap, robots and the 404 page are built", () => {
  const map = dist("sitemap.xml");
  for (const u of ["https://repsy.fit/", "https://repsy.fit/pricing", "https://repsy.fit/privacy"]) expect(map).toContain(`<loc>${u}</loc>`);
  const robots = dist("robots.txt");
  expect(robots).toContain("Sitemap: https://repsy.fit/sitemap.xml");
  expect(robots).toContain("Disallow: /app");
  expect(robots).toContain("Allow: /client/login");
  expect(dist("not-found.html")).toContain('content="noindex"');
  expect(dist("legal/privacy.html")).toContain('href="https://repsy.fit/privacy"');
});

test("/pricing is its own page and opens at the prices", async ({ page }) => {
  const html = dist("pricing.html");
  expect(html).toContain("<title>Repsy Coach pricing - plans from $39 a month</title>");
  expect(html).toContain('href="https://repsy.fit/pricing"');
  await page.goto("/pricing");
  // The dev/preview server serves index.html for it; what matters is that the app shows the landing.
  await expect(page.getByTestId("studio-landing")).toBeVisible();
  await expect(page.locator("#pricing")).toBeInViewport({ timeout: 10_000 });
});

test("llms.txt and the speculation rules are built", () => {
  // llms.txt gets quoted verbatim by AI assistants, so it carries the same facts as the page.
  const llms = dist("llms.txt");
  expect(llms).toContain(seo.hero.lead);
  for (const s of PLAN_STEPS) expect(llms).toContain(`$${s.price} per month`);
  expect(llms).toContain("gives no medical advice");
  for (const f of FAQ_CHAT) expect(llms).toContain(f.q);
  // The llmstxt.org shape an audit checks: H1, blockquote, prose, then H2 sections of LINK lists.
  expect(llms.startsWith("# Repsy Coach\n\n> ")).toBe(true);
  for (const section of llms.split(/^## /m).slice(1)) {
    expect(section).toMatch(/^- \[[^\]]+\]\(https:\/\/repsy\.fit[^)]*\):/m);
    for (const line of section.split("\n").filter((l) => l.trim() && !l.startsWith("- ") && l !== section.split("\n")[0])) {
      throw new Error(`prose under an H2 in llms.txt: ${line}`);
    }
  }

  const rules = JSON.parse(dist("speculation-rules.json")) as { prefetch: { urls: string[] }[] };
  expect(rules.prefetch[0].urls).toEqual(["/pricing", "/register", "/login"]);
});

test("the pricing page's og:url matches its canonical", () => {
  // They disagreed before: a share of /pricing pointed search engines at the home page.
  const html = dist("pricing.html");
  const canonical = /<link rel="canonical" href="([^"]+)"/.exec(html)?.[1];
  const ogUrl = /<meta property="og:url" content="([^"]+)"/.exec(html)?.[1];
  expect(canonical).toBe("https://repsy.fit/pricing");
  expect(ogUrl).toBe(canonical);
});

test("the home page's meta description fits in a search result", () => {
  const desc = /<meta name="description" content="([^"]+)"/.exec(dist("index.html"))?.[1] ?? "";
  expect(desc.length).toBeGreaterThan(70);
  expect(desc.length).toBeLessThanOrEqual(160);
});

test("robots.txt welcomes AI crawlers but never the private areas", () => {
  // Owner's decision: a marketing site wants to be quotable. What is private stays closed to
  // every crawler, named or not.
  const robots = dist("robots.txt");
  for (const ua of ["GPTBot", "ClaudeBot", "PerplexityBot", "OAI-SearchBot", "Google-Extended"]) {
    expect(robots).toContain(`User-agent: ${ua}`);
  }
  const groups = robots.split(/\n\s*\n/).filter((g) => g.includes("User-agent:"));
  expect(groups.length).toBeGreaterThanOrEqual(2);
  for (const g of groups) {
    expect(g).toContain("Disallow: /app");
    expect(g).toContain("Disallow: /client/");
    expect(g).toContain("Disallow: /join/");
  }
});
