// Runs after `vite build` (and after prerender-legal.mjs). Three jobs, all for crawlers:
//
// 1. A static shell inside <div id="root"> of dist/index.html, built from src/landing-new/seo.json:
//    the hero, the six section blurbs, the three prices and the FAQ. The landing itself is a lazy
//    React chunk, so without this a crawler that doesn't run JavaScript sees an empty page. React
//    replaces the shell with the same words on first render.
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
html = html.replace('<div id="root"></div>', `<div id="root">${shell}</div>`).replace("</head>", `${ld}\n</head>`);
fs.writeFileSync(indexPath, html);

// ---------- /pricing: same app, its own title and description ----------
const pricing = html
  .replace(/<title>[^<]*<\/title>/, `<title>${esc(seo.pricingPage.title)}</title>`)
  .replace(/(<meta name="description" content=")[^"]*(")/, `$1${esc(seo.pricingPage.description)}$2`)
  .replace(`<link rel="canonical" href="${SITE}/" />`, `<link rel="canonical" href="${SITE}/pricing" />`);
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
fs.writeFileSync(
  path.join(dist, "robots.txt"),
  `User-agent: *
Allow: /
# Private areas: the coach dashboard, the client app and one-time invite links.
Disallow: /app
Disallow: /client/
Disallow: /join/
Allow: /client/login

Sitemap: ${SITE}/sitemap.xml
`,
);

console.log(`SEO prerendered: index shell (${shell.length} chars), ${faq.length} FAQ answers, pricing.html, not-found.html, sitemap.xml, robots.txt`);
