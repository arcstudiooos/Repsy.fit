// Navigation helpers for the real-server specs (same as e2e-ui/fixtures.ts). Since Nov 2026 the coach
// app has 5 top tabs (Home, Clients, AI Coach, Messages, Business); Plans / Progress / Check-ins are
// sub-tabs of a client's workspace inside Clients, and Library is its own tab (Nov 2026).
import type { Page } from "@playwright/test";

// Nov 2026: Calendar and Library came out of "Business", which had become a junk drawer holding a
// calendar, a questionnaire builder and an exercise library alongside the coach's money.
export const TOP_TABS = ["Home", "Clients", "Calendar", "Library", "AI Coach", "Messages", "Business"];
export type ClientSubTab = "Plans" | "Progress" | "Check-ins";

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The one client header (name, goal, "Switch client") on AI Coach and in the client workspace. */
export const clientHeader = (page: Page) => page.getByRole("region", { name: "Selected client" });

/**
 * Opens a client's workspace on a sub-tab. Without a name it uses the selected client (and just
 * switches sub-tab when a workspace is already open); with a name it opens that client's card.
 */
export async function openClientTab(page: Page, sub: ClientSubTab, clientName?: string) {
  const subTab = page.getByRole("tab", { name: sub, exact: true });
  if (!clientName && (await subTab.isVisible())) {
    await subTab.click();
    return;
  }
  await page.getByRole("tab", { name: "Clients" }).click();
  const card = clientName
    ? page.getByRole("button", { name: new RegExp(`^Open ${escapeRe(clientName)}`) })
    : page.getByRole("button", { name: /^Open /, pressed: true });
  await card.first().click();
  await subTab.click();
}

/** Since Nov 2026 /app opens on Home: goes to /app and opens the AI Coach tab. */
export async function openAiCoach(page: Page) {
  await page.goto("/app");
  await page.getByRole("tab", { name: "AI Coach" }).click();
}

/** Plans: opens the New assignment form with "+ New plan" (closed by default since Nov 2026). */
export async function openNewPlanForm(page: Page) {
  await page.getByRole("button", { name: "New plan", exact: true }).click();
  return page.getByRole("form", { name: "New assignment" });
}

/**
 * Picks a client the way a coach would on the screen they are on.
 *
 * Nov 2026: the client workspace shows a rail of every client at `lg` and up and hides the header's
 * "Switch client" there; the AI Coach tab has no rail and keeps it. This follows whichever exists.
 */
export async function selectClient(page: Page, name: string) {
  const rail = page.getByRole("navigation", { name: "Clients" });
  if (await rail.isVisible().catch(() => false)) {
    const search = rail.getByRole("searchbox", { name: "Search clients" });
    if (await search.isVisible().catch(() => false)) await search.fill(name);
    await rail.getByRole("button", { name: new RegExp(escapeRe(name)) }).first().click();
    return;
  }
  await page.getByRole("button", { name: "Switch client" }).click();
  await page.getByRole("combobox", { name: "Search clients" }).fill(name);
  await page.getByRole("option", { name: new RegExp(escapeRe(name)) }).first().click();
}

/**
 * Opens the Library tab.
 *
 * Nov 2026: the Library is its own destination. It used to be a view inside "Business" alongside
 * Schedule, Programs and Forms; a calendar and a questionnaire builder are not business, and that
 * tab had become a junk drawer.
 */
export async function openLibrary(
  page: Page,
  view?: "Templates" | "Exercises" | "Meals" | "Programs" | "Forms" | "Macro calculator",
) {
  await page.getByRole("tab", { name: "Library" }).click();
  if (view) await page.getByRole("group", { name: "Library view" }).getByRole("button", { name: view, exact: true }).click();
}
