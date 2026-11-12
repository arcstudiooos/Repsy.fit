// Renders the legal pages (src/legal/content.json) to static HTML after `vite build`:
// dist/legal/privacy.html and dist/legal/terms.html. The server sends these for /privacy and /terms,
// so the full text is in the HTML itself - Google's OAuth branding review and other crawlers do not
// run JavaScript, and an empty app shell reads as "no privacy policy".
// No inline scripts or event handlers (CSP); styles are inline in a <style> block (style-src allows it).
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const content = JSON.parse(fs.readFileSync(path.join(root, "src/legal/content.json"), "utf8"));
const outDir = path.join(root, "dist/legal");
fs.mkdirSync(outDir, { recursive: true });

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const LINKABLE = /([\w.+-]+@[\w-]+(?:\.[\w-]+)+|myaccount\.google\.com\/permissions)/g;
const linked = (text) =>
  text
    .split(LINKABLE)
    .map((p, i) => (i % 2 === 1 ? `<a href="${p.includes("@") ? `mailto:${p}` : `https://${p}`}">${esc(p)}</a>` : esc(p)))
    .join("");

const CSS = `
*{box-sizing:border-box}body{margin:0;background:#faf7f2;color:#1a1a1a;font:17px/1.65 Geist,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
header,main,footer>div{max-width:800px;margin:0 auto;padding:0 20px}
header{display:flex;align-items:center;gap:16px;padding-top:24px;padding-bottom:24px}
.brand{font:italic 24px "Instrument Serif",Georgia,serif;color:#141414;text-decoration:none}
nav{margin-left:auto;display:flex;gap:16px;font-size:15px}
a{color:#141414}h1,h2{font-family:"Instrument Serif",Georgia,serif;font-weight:400;letter-spacing:-.02em;color:#141414}
h1{font-size:46px;line-height:1.05;margin:16px 0 0}h2{font-size:28px;margin:36px 0 8px}
.updated{color:#6b6560;font-size:14px;margin:10px 0 0}.intro{font-size:19px}
ul{padding-left:24px}li{margin:4px 0}main{padding-bottom:64px}
footer{background:#141414;color:#e6e0d6;font-size:14px}footer>div{padding-top:28px;padding-bottom:28px}footer a{color:#fff}`;

for (const [slug, doc] of [["privacy", content.privacy], ["terms", content.terms]]) {
  const sections = doc.sections
    .map(
      (s) =>
        `<section><h2>${esc(s.heading)}</h2>${s.body
          .map((b) => (typeof b === "string" ? `<p>${linked(b)}</p>` : `<ul>${b.list.map((li) => `<li>${linked(li)}</li>`).join("")}</ul>`))
          .join("")}</section>`,
    )
    .join("\n");
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(doc.title)} - Repsy Coach</title>
<meta name="description" content="${esc(doc.intro.slice(0, 155))}">
<link rel="icon" type="image/png" href="/favicon.png">
<link rel="canonical" href="https://app.repsy.fit/${slug}">
<style>${CSS}</style>
</head>
<body>
<header><a class="brand" href="/">Repsy</a><nav aria-label="Legal"><a href="/privacy">Privacy</a><a href="/terms">Terms</a></nav></header>
<main>
<h1>${esc(doc.title)}</h1>
<p class="updated">Last updated: ${esc(content.updated)}</p>
<p class="intro">${linked(doc.intro)}</p>
${sections}
</main>
<footer><div>Repsy Coach · <a href="/">Home</a> · <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a> · <a href="mailto:${content.contactEmail}">${esc(content.contactEmail)}</a></div></footer>
</body>
</html>
`;
  fs.writeFileSync(path.join(outDir, `${slug}.html`), html);
}
console.log("legal pages prerendered: dist/legal/privacy.html, dist/legal/terms.html");
