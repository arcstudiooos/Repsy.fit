// Response security headers (Prompt 73). Hand-written on purpose: `helmet` is not a dependency and
// CLAUDE.md forbids adding one. Every value is chosen for what this app actually does, so a header
// can never silently break a page:
//   - the app serves its own HTML/JS/CSS from one origin and calls its API with relative paths
//   - Google Fonts supplies one stylesheet (fonts.googleapis.com) and the font files (fonts.gstatic.com)
//   - Tailwind-style inline `style` attributes are used throughout, so style-src needs 'unsafe-inline'
//     (a nonce cannot cover a style ATTRIBUTE)
//   - three.js / GSAP ship inside our own bundle: no script CDN, so script-src stays 'self'
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
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
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
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  // Only over HTTPS: sending HSTS on plain-http local dev would pin localhost to https.
  if (isHttps(req)) res.setHeader("Strict-Transport-Security", `max-age=${HSTS_SECONDS}; includeSubDomains`);
  // app.repsy.fit serves the same pages as repsy.fit (one server, two hosts). Only the marketing
  // host should be indexed, or every public page exists twice in search results.
  if (/^app\./i.test(String(req.headers.host ?? ""))) res.setHeader("X-Robots-Tag", "noindex");
  next();
}
