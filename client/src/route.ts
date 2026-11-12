// Which side of the site a path opens (Prompt 37, login screens added in Prompt 46).
export type Route =
  | "app"
  | "landing"
  | "redirect-to-app"
  | "login"
  | "register"
  | "forgot"
  | "reset"
  // Client sign-in (Prompt 65): separate pages for invited clients.
  | "client-login"
  | "client-set-password"
  | "client-home"
  // Prompt 77: joining with a coach's code, the welcome questions, and client password reset.
  | "client-join"
  | "client-welcome"
  | "client-forgot"
  | "client-reset"
  // Privacy and Terms (Prompt 73): DRAFTS for the owner's legal review, not final documents.
  | "privacy"
  | "terms";

/** sessionStorage key: set once the visitor has opened /app in this tab. */
export const IN_APP_KEY = "repsy:in-app";

/**
 * "/app" and "/app/..." open the coach dashboard; "/login" and "/register" the sign-in screens;
 * "/forgot-password" and "/reset-password" (Prompt 47) the password reset screens;
 * every other path is the public landing page.
 * Old links to "/" go to /app only when this tab is already inside the app flow - except when the
 * visitor used Back/Forward, so Back from the app still reaches the landing page.
 */
export function routeFor(pathname: string, opts: { inAppFlow: boolean; backForward: boolean }): Route {
  if (pathname === "/app" || pathname.startsWith("/app/")) return "app";
  if (pathname === "/login") return "login";
  if (pathname === "/register") return "register";
  if (pathname === "/forgot-password") return "forgot";
  if (pathname === "/reset-password") return "reset";
  if (pathname === "/client/login") return "client-login";
  if (pathname === "/client/set-password") return "client-set-password";
  // Prompt 79: the client app's own pages all render inside client-home.
  if (/^\/client(\/(week|progress|me|checkin|weekly|plan\/[^/]+))?\/?$/.test(pathname)) return "client-home";
  if (/^\/join\/[^/]+\/?$/.test(pathname)) return "client-join";
  if (pathname === "/client/welcome") return "client-welcome";
  if (pathname === "/client/forgot-password") return "client-forgot";
  if (pathname === "/client/reset-password") return "client-reset";
  if (pathname === "/privacy") return "privacy";
  if (pathname === "/terms") return "terms";
  if (pathname === "/" && opts.inAppFlow && !opts.backForward) return "redirect-to-app";
  return "landing";
}

/** In-page navigation without a reload (the guard and the login screens use it). main.tsx listens for "popstate". */
export function navigate(path: string, opts: { replace?: boolean } = {}) {
  if (opts.replace) window.history.replaceState(null, "", path);
  else window.history.pushState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
