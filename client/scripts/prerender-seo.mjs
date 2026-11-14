// Runs after `vite build` (and after prerender-legal.mjs). Three jobs, all for crawlers:
//
// 1. A static shell INSIDE #root in dist/index.html, built from src/landing-new/seo.json: the hero,
//    the six section blurbs, the three prices and the FAQ. The landing itself is a lazy React
//    chunk, so without this a fetcher that doesn't run JavaScript sees nine words.
//    It was in <noscript> for a while, because unstyled markup in #root flashed before React booted
//    (the owner saw it). An SEO audit then showed the cost: <noscript> is not counted as content,
//    so the page read as empty to every non-rendering crawler. It is back in #root, and
//    landing-new.css styles [data-seo-shell] to look like the hero at first paint - the stylesheet
//    is render-blocking, so the styles are there before the shell is painted, and React replaces
//    the whole thing on mount. Below-hero text is visually hidden but stays readable to crawlers.
// 2. Structured data (JSON-LD): WebSite, Organization, SoftwareApplication with its three offers,
//    and FAQPage from src/landing-new/content.ts. A ld+json block is data, not script, so the
//    'script-src self' CSP does not apply to it.
// 3. dist/pricing.html (its own title, description and canonical), dist/not-found.html for real
//    404s, dist/sitemap.xml and dist/robots.txt.
//
// No inline <script> that runs, no event handlers: the CSP stays as strict as it is.
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const dist = path.join(root, "dist");
const seo = JSON.parse(fs.readFileSync(path.join(root, "src/landing-new/seo.json"), "utf8"));
const SITE = seo.site;

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// The FAQ lives in content.ts (one source for the chat UI and for search engines); read the pairs
// out of it rather than keeping a second copy here.
const contentSrc = fs.readFileSync(path.join(root, "src/landing-new/content.ts"), "utf8");
const faqBlock = contentSrc.slice(contentSrc.indexOf("export const FAQ_CHAT"), contentSrc.indexOf("export const", contentSrc.indexOf("export const FAQ_CHAT") + 10));
const faq = [...faqBlock.matchAll(/q:\s*"((?:[^"\\]|\\.)*)",\s*\n\s*a:\s*"((?:[^"\\]|\\.)*)"/g)].map((m) => ({
  q: JSON.parse(`"${m[1]}"`),
  a: JSON.parse(`"${m[2]}"`),
}));
if (faq.length < 4) throw new Error(`prerender-seo: expected the FAQ pairs from content.ts, found ${faq.length}`);

const shell = `<div data-seo-shell>
<h1>${esc(seo.hero.h1)}</h1>
<p>${esc(seo.hero.lead)}</p>
${seo.sections.map((s) => `<section><h2>${esc(s.h)}</h2><p>${esc(s.p)}</p></section>`).join("\n")}
<section><h2>Pricing</h2><p>${esc(seo.trial)}</p><ul>${seo.plans
  .map((p) => `<li>${esc(p.name)}: $${p.price} per month, ${esc(p.clients)}</li>`)
  .join("")}</ul></section>
<section><h2>Questions coaches ask</h2><dl>${faq.map((f) => `<dt>${esc(f.q)}</dt><dd>${esc(f.a)}</dd>`).join("")}</dl></section>
<p><a href="/login">Coach log in</a> · <a href="/register">Start free</a> · <a href="/client/login">Client sign in</a> · <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a></p>
</div>`;

const ld = [
  { "@context": "https://schema.org", "@type": "WebSite", name: seo.name, url: `${SITE}/` },
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: seo.name,
    url: `${SITE}/`,
    logo: `${SITE}/repsy-logo-dark.png`,
  },
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: seo.name,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web browser",
    description: seo.tagline,
    url: `${SITE}/`,
    offers: seo.plans.map((p) => ({
      "@type": "Offer",
      name: p.name,
      price: String(p.price),
      priceCurrency: "USD",
      url: `${SITE}/pricing`,
      description: p.clients,
    })),
  },
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  },
]
  .map((o) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, "\\u003c")}</script>`)
  .join("\n");

// ---------- index.html: shell + structured data ----------
const indexPath = path.join(dist, "index.html");
let html = fs.readFileSync(indexPath, "utf8");
if (!html.includes('<div id="root"></div>')) throw new Error("prerender-seo: index.html has no empty #root to fill");
// The shell's own styles go INLINE in the head, not in landing-new.css: that stylesheet is bundled
// into the lazy landing chunk, so at first paint it does not exist yet - which is exactly why the
// shell flashed as unstyled text before. Inline <style> is allowed by the CSP (style-src has
// 'unsafe-inline' for Tailwind-style attributes); an inline <script> would not be.
const shellCss = `<style>
#root:has([data-seo-shell]){background:#faf7f2}
[data-seo-shell]{min-height:100svh;margin:0;padding:18vh 7vw 6rem;background:#faf7f2;color:#1a1a1a;font:17px/1.6 Geist,ui-sans-serif,system-ui,sans-serif}
[data-seo-shell] h1{margin:0 0 1rem;max-width:22ch;font:400 clamp(2.6rem,7vw,5rem)/1.02 "Instrument Serif",Georgia,serif;letter-spacing:-.01em;color:#141414}
[data-seo-shell]>p:first-of-type{margin:0;max-width:46ch;font-size:clamp(1.05rem,2.2vw,1.35rem);color:#6b6560}
[data-seo-shell] section,[data-seo-shell]>p:not(:first-of-type){position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;border:0}
</style>`;
html = html
  .replace('<div id="root"></div>', `<div id="root">${shell}</div>`)
  .replace("</head>", `${shellCss}\n${ld}\n</head>`);
fs.writeFileSync(indexPath, html);

// ---------- /pricing: same app, its own title and description ----------
const pricing = html
  .replace(/<title>[^<]*<\/title>/, `<title>${esc(seo.pricingPage.title)}</title>`)
  .replace(/(<meta name="description" content=")[^"]*(")/, `$1${esc(seo.pricingPage.description)}$2`)
  .replace(`<link rel="canonical" href="${SITE}/" />`, `<link rel="canonical" href="${SITE}/pricing" />`)
  // og:url follows the canonical: a share of /pricing must not point search engines at /.
  .replace(`<meta property="og:url" content="${SITE}/" />`, `<meta property="og:url" content="${SITE}/pricing" />`)
  .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${esc(seo.pricingPage.title)}$2`)
  .replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${esc(seo.pricingPage.description)}$2`);
fs.writeFileSync(path.join(dist, "pricing.html"), pricing);

// ---------- a real 404 page (served with status 404) ----------
const notFound = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Page not found - ${esc(seo.name)}</title>
<meta name="robots" content="noindex">
<link rel="icon" type="image/png" href="/favicon.png">
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#faf7f2;color:#1a1a1a;font:17px/1.6 Geist,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;text-align:center;padding:24px}
h1{font:400 44px/1.1 "Instrument Serif",Georgia,serif;margin:0 0 12px}a{color:#141414}</style>
</head>
<body>
<main>
<h1>That page isn't here.</h1>
<p>The link may be old, or the address slightly off.</p>
<p><a href="/">Go to the home page</a> · <a href="/login">Coach log in</a> · <a href="/client/login">Client sign in</a></p>
</main>
</body>
</html>
`;
fs.writeFileSync(path.join(dist, "not-found.html"), notFound);

// ---------- sitemap and robots ----------
const today = new Date().toISOString().slice(0, 10);
const urls = [
  ["/", "1.0"],
  ["/pricing", "0.8"],
  ["/register", "0.6"],
  ["/login", "0.4"],
  ["/client/login", "0.4"],
  ["/privacy", "0.3"],
  ["/terms", "0.3"],
];
fs.writeFileSync(
  path.join(dist, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(([u, p]) => `  <url><loc>${SITE}${u}</loc><lastmod>${today}</lastmod><priority>${p}</priority></url>`).join("\n")}
</urlset>
`,
);
// The same private areas are closed to every crawler, named or not.
const privateAreas = `Disallow: /app
Disallow: /client/
Disallow: /join/
Allow: /client/login`;

// AI crawlers are named on purpose (owner's decision, Nov 2026): all of them are welcome, including
// the training ones. This is a marketing site whose job is to be found, and being quotable in an AI
// answer is distribution we cannot buy. Nothing here is private - what is private is listed above
// and stays closed to all of them. Revisit only if the public pages ever carry something we would
// mind seeing repeated.
const aiAgents = [
  "GPTBot", // OpenAI, training
  "OAI-SearchBot", // OpenAI, search index
  "ChatGPT-User", // OpenAI, fetched because a person asked
  "ClaudeBot", // Anthropic, training
  "Claude-SearchBot", // Anthropic, search index
  "Claude-User", // Anthropic, fetched because a person asked
  "PerplexityBot", // Perplexity, search index
  "Perplexity-User", // Perplexity, fetched because a person asked
  "Google-Extended", // Google's AI products (separate from Googlebot)
  "Applebot-Extended", // Apple Intelligence
  "Bingbot", // Bing, which also feeds Copilot
  "DuckAssistBot",
  "cohere-ai",
  "Meta-ExternalAgent",
];

fs.writeFileSync(
  path.join(dist, "robots.txt"),
  `User-agent: *
Allow: /
# Private areas: the coach dashboard, the client app and one-time invite links.
${privateAreas}

${aiAgents.map((ua) => `User-agent: ${ua}`).join("\n")}
Allow: /
${privateAreas}

Sitemap: ${SITE}/sitemap.xml
`,
);

// ---------- llms.txt: the plain-text brief for AI assistants ----------
// Follows the llmstxt.org shape, which an audit checks: an H1, a blockquote summary, then free
// prose, and H2 sections that hold LINK lists (prose under an H2 is a format error). The facts are
// the same ones on the page - assistants quote this verbatim, so every line has to be literally
// true and no marketing adjectives belong in it.
const llms = `# ${seo.name}

> ${seo.hero.lead}

${seo.sections.map((s) => `${s.h}: ${s.p}`).join("\n\n")}

Plans. Every feature is in every plan; the tiers differ only by how many clients you coach.
${seo.plans.map((p) => `${p.name}: $${p.price} per month, ${p.clients}.`).join("\n")}
${seo.trial}

${faq.map((f) => `${f.q} ${f.a}`).join("\n\n")}

Repsy is software for coaches. It gives no medical advice and takes no payments from a coach's
clients. Clients use a web app - there is nothing to install.

## Pages

- [Home](${SITE}/): what Repsy does, for coaches deciding whether it fits.
- [Pricing](${SITE}/pricing): ${seo.plans.map((p) => `${p.name} $${p.price}`).join(", ")}, monthly.
- [Start free](${SITE}/register): opens a coach account; ${seo.trial.charAt(0).toLowerCase()}${seo.trial.slice(1)}
- [Coach log in](${SITE}/login): for coaches who already have an account.
- [Client sign in](${SITE}/client/login): for a coach's client, who is invited by their coach.

## Legal

- [Privacy](${SITE}/privacy): what is collected, where it is stored, and how to delete it.
- [Terms](${SITE}/terms): the agreement between Repsy and a coach.
`;
fs.writeFileSync(path.join(dist, "llms.txt"), llms);

// ---------- speculation rules ----------
// Chrome prefetches these the moment a link looks likely, so the next page is already there. Served
// as a JSON file and pointed at by a response header (see server/src/security.ts): an inline
// <script type="speculationrules"> would need a CSP exception, and the CSP stays strict.
fs.writeFileSync(
  path.join(dist, "speculation-rules.json"),
  JSON.stringify({
    prefetch: [{ source: "list", urls: ["/pricing", "/register", "/login"], eagerness: "moderate" }],
  }) + "\n",
);

console.log(`SEO prerendered: index shell (${shell.length} chars), ${faq.length} FAQ answers, pricing.html, not-found.html, sitemap.xml, robots.txt, llms.txt, speculation-rules.json`);
