// Light / dark theme (owner's request, Nov 2026). Until someone uses the header switch the app follows
// the device setting; their choice is then kept in localStorage and set as <html data-theme="...">,
// which theme.css reads. Sign-in screens and the landing stay cream either way.
export type Theme = "light" | "dark";

export const THEME_KEY = "repsy-theme";

export function storedTheme(): Theme | null {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === "light" || v === "dark" ? v : null;
  } catch {
    return null;
  }
}

export function systemTheme(): Theme {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export const effectiveTheme = (): Theme => storedTheme() ?? systemTheme();

/** Sets the page theme; `null` goes back to following the device. Call once at start-up too. */
export function applyTheme(theme: Theme | null) {
  const root = document.documentElement;
  if (theme) root.dataset.theme = theme;
  else delete root.dataset.theme;
}

/** The switch's action: remember the choice and fade the colours over instead of snapping. */
export function chooseTheme(theme: Theme) {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Private mode without storage: the choice still applies to this page.
  }
  const root = document.documentElement;
  root.classList.add("theme-anim");
  applyTheme(theme);
  window.setTimeout(() => root.classList.remove("theme-anim"), 400);
}
