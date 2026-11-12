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

/** Picks a client with the client header's "Switch client" control. */
export async function selectClient(page: Page, name: string) {
  await page.getByRole("button", { name: "Switch client" }).click();
  await page.getByRole("combobox", { name: "Search clients" }).fill(name);
  await page.getByRole("option", { name: new RegExp(escapeRe(name)) }).first().click();
}

/** Opens Business -> Library. */
export async function openLibrary(page: Page) {
  await page.getByRole("tab", { name: "Business" }).click();
  await page.getByRole("group", { name: "Business view" }).getByRole("button", { name: "Library" }).click();
}
