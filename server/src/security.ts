// Response security headers (Prompt 73). Hand-written on purpose: `helmet` is not a dependency and
// CLAUDE.md forbids adding one. Every value is chosen for what this app actually does, so a header
// can never silently break a page:
//   - the app serves its own HTML/JS/CSS from one origin and calls its API with relative paths
//   - Google Fonts supplies one stylesheet (fonts.googleapis.com) and the font files (fonts.gstatic.com)
//   - Tailwind-style inline `style` attributes are used throughout, so style-src needs 'unsafe-inline'
//     (a nonce cannot cover a style ATTRIBUTE)
//   - three.js / GSAP ship inside our own bundle, so the only third-party script is Cloudflare Web
//     Analytics (cookieless page counts, injected by Cloudflare's proxy): static.cloudflareinsights.com
//     serves the beacon and receives the hits
//   - CSV download uses a blob: URL, and images may be data: URLs
import type { NextFunction, Request, Response } from "express";

/** One year. Render terminates TLS and serves this app over HTTPS only. */
const HSTS_SECONDS = 31_536_000;

export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  // Cloudflare Web Analytics' beacon (owner, Nov 2026). Cookieless: no personal data, no consent
  // banner needed. Nothing else third-party may run.
  // PayPal's checkout SDK (Nov 2026). It is the only third-party script besides the analytics
  // beacon, it is loaded on the billing screen alone, and the subscription it returns is still
  // verified server-side before anything is believed.
  "script-src 'self' https://static.cloudflareinsights.com https://www.paypal.com https://www.sandbox.paypal.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https://www.paypal.com https://www.paypalobjects.com",
  "connect-src 'self' https://static.cloudflareinsights.com https://cloudflareinsights.com https://www.paypal.com https://www.sandbox.paypal.com",
  // The approval window PayPal opens, and the card-field iframes inside it.
  "frame-src https://www.paypal.com https://www.sandbox.paypal.com",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
].join("; ");

/** True when the request reached us over HTTPS, including behind Render's proxy (trust proxy is set). */
export function isHttps(req: Request): boolean {
  return req.secure || req.headers["x-forwarded-proto"] === "https";
}

export function securityHeaders(req: Request, res: Response, next: NextFunction) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  // A sensible default; the pages whose URL carries a one-time token override this with "no-referrer".
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Content-Security-Policy", CONTENT_SECURITY_POLICY);
  // "same-origin-allow-popups", not "same-origin": PayPal's checkout opens a popup that must talk
  // back to the page that opened it, and strict same-origin severs that link - the popup opens,
  // loads, and reports nothing, which looks like a blank window. This still isolates US from any
  // page that opens US; it only preserves the opener link for popups we open ourselves.
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  // Nothing here uses a camera, a microphone, geolocation or payment APIs in the page. Saying so
  // switches them off for the page and for anything it embeds (an SEO audit flagged the absence).
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()");
  // Speculation rules (Nov 2026): Chrome prefetches the likely next pages. Pointed at as a file
  // rather than an inline <script type="speculationrules">, which would need a CSP exception.
  // Only on the marketing host: prefetching signed-in pages would waste a coach's data.
  if (!/^app\./i.test(String(req.headers.host ?? ""))) res.setHeader("Speculation-Rules", '"/speculation-rules.json"');
  // Only over HTTPS: sending HSTS on plain-http local dev would pin localhost to https.
  if (isHttps(req)) res.setHeader("Strict-Transport-Security", `max-age=${HSTS_SECONDS}; includeSubDomains`);
  // app.repsy.fit serves the same pages as repsy.fit (one server, two hosts). Only the marketing
  // host should be indexed, or every public page exists twice in search results.
  if (/^app\./i.test(String(req.headers.host ?? ""))) res.setHeader("X-Robots-Tag", "noindex");
  next();
}
