// Navigation helpers for the real-server specs (same as e2e-ui/fixtures.ts). Since Nov 2026 the coach
// app has 5 top tabs (Home, Clients, AI Coach, Messages, Business); Plans / Progress / Check-ins are
// sub-tabs of a client's workspace inside Clients, and Library is a Business view.
import type { Page } from "@playwright/test";

export const TOP_TABS = ["Home", "Clients", "AI Coach", "Messages", "Business"];
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

/** Picks a client with the client header's "Switch client" control. */
export async function selectClient(page: Page, name: string) {
  await page.getByRole("button", { name: "Switch client" }).click();
  await page.getByRole("combobox", { name: "Search clients" }).fill(name);
  await page.getByRole("option", { name: new RegExp(escapeRe(name)) }).first().click();
}

/** Opens Business -> Library. */
export async function openLibrary(page: Page, view?: "Templates" | "Meals" | "Macro calculator") {
  await page.getByRole("tab", { name: "Business" }).click();
  await page.getByRole("group", { name: "Business view" }).getByRole("button", { name: "Library" }).click();
  // UI batch 4: Library has its own views (Templates / Meals / Macro calculator); the last one is remembered.
  if (view) await page.getByRole("group", { name: "Library view" }).getByRole("button", { name: view, exact: true }).click();
}
