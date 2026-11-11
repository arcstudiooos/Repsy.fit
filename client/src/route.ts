// Which side of the site a path opens (Prompt 37, login screens added in Prompt 46).
export type Route = "app" | "landing" | "redirect-to-app" | "login" | "register";

/** sessionStorage key: set once the visitor has opened /app in this tab. */
export const IN_APP_KEY = "repsy:in-app";

/**
 * "/app" and "/app/..." open the coach dashboard; "/login" and "/register" the sign-in screens;
 * every other path is the public landing page.
 * Old links to "/" go to /app only when this tab is already inside the app flow - except when the
 * visitor used Back/Forward, so Back from the app still reaches the landing page.
 */
export function routeFor(pathname: string, opts: { inAppFlow: boolean; backForward: boolean }): Route {
  if (pathname === "/app" || pathname.startsWith("/app/")) return "app";
  if (pathname === "/login") return "login";
  if (pathname === "/register") return "register";
  if (pathname === "/" && opts.inAppFlow && !opts.backForward) return "redirect-to-app";
  return "landing";
}

/** In-page navigation without a reload (the guard and the login screens use it). main.tsx listens for "popstate". */
export function navigate(path: string, opts: { replace?: boolean } = {}) {
  if (opts.replace) window.history.replaceState(null, "", path);
  else window.history.pushState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
