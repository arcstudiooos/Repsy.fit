// The invite opens over the roster (Nov 2026 UI batch).
//
// It used to be a panel at the top of the Clients tab, and the Invite button called
// window.scrollTo to carry the coach up to it: the page moved to show them the thing they had just
// asked for, and the client whose card they clicked ended up off screen.
import { expect, test, type Page, type Route, emptyApi } from "./fixtures";

const client = (id: string, name: string) => ({
  id, coachId: "c1", name, goal: "Fat loss", age: 29, weightKg: 58, heightCm: 165,
  level: "Beginner", focus: "", notes: "", goalDate: null, goalEvent: "",
  createdAt: "2026-10-01T00:00:00.000Z",
});

// Enough clients that the roster is taller than the window, which is what made the old scroll jump
// so disorienting: the card you clicked was pushed out of sight.
const many = Array.from({ length: 12 }, (_, i) => client(`c${i}`, `Client ${String(i).padStart(2, "0")}`));

async function openClients(page: Page) {
  await page.route("**/api/**", (route: Route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/clients") return route.fulfill({ status: 200, json: many });
    if (path.endsWith("/access")) {
      return route.fulfill({ status: 200, json: { status: "none", loginEmail: null, pendingEmail: null, inviteExpiresAt: null } });
    }
    return route.fulfill({ status: 200, json: emptyApi(path) });
  });
  await page.setViewportSize({ width: 1280, height: 700 });
  await page.goto("/app");
  await page.getByRole("tab", { name: "Clients" }).click();
  // The join-code panel is lazy, so the page is still getting SHORTER for a moment after the
  // roster appears. Measuring a scroll position before that settles produces a number the document
  // can no longer hold, and every later clamp then looks like a bug in the dialog.
  await expect(page.getByText("Client 11")).toBeVisible();
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => {
    const h = document.documentElement.scrollHeight;
    const settled = (window as unknown as { __h?: number }).__h === h;
    (window as unknown as { __h?: number }).__h = h;
    return settled;
  }, null, { timeout: 10_000 });
}

test("inviting a client near the bottom leaves the coach where they were", async ({ page }) => {
  await openClients(page);
  // Redesign Nov 2026: "Client access" opens from the card's ⋯ menu now; the dialog it opens still
  // sits over the roster without moving the page.
  const more = page.getByRole("button", { name: "More actions for Client 11" });
  await more.scrollIntoViewIfNeeded();
  await more.click();
  const access = page.getByRole("menuitem", { name: "Client access" });
  const before = await page.evaluate(() => window.scrollY);
  expect(before).toBeGreaterThan(0); // we really are scrolled down the roster

  await access.click();
  const dialog = page.getByRole("dialog", { name: "Client sign-in for Client 11" });
  await expect(dialog).toBeVisible();
  // The old code called window.scrollTo({ top: 0 }) here, throwing the coach to the top of the
  // roster. Locking the page scroll can still clamp the position by a few pixels (the document is
  // briefly shorter), but that is behind the backdrop and invisible - so the assertion is that the
  // page did not JUMP, not that the number is untouched to the pixel.
  const whileOpen = await page.evaluate(() => window.scrollY);
  expect(Math.abs(whileOpen - before)).toBeLessThan(60);

  // What the coach actually experiences is where they land when the dialog closes.
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  expect(await page.evaluate(() => window.scrollY)).toBe(before);
});

test("closing it returns focus to the card's own button, so the keyboard keeps its place", async ({ page }) => {
  await openClients(page);
  // The ⋯ trigger is the card's own button now; MenuButton hands focus back to it on item select,
  // so the dialog's return-focus lands there too.
  const more = page.getByRole("button", { name: "More actions for Client 03" });
  await more.click();
  await page.getByRole("menuitem", { name: "Client access" }).click();
  const dialog = page.getByRole("dialog", { name: "Client sign-in for Client 03" });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(more).toBeFocused();
});

test("the roster is still behind it, not replaced by it", async ({ page }) => {
  await openClients(page);
  await page.getByRole("button", { name: "More actions for Client 00" }).click();
  await page.getByRole("menuitem", { name: "Client access" }).click();
  await expect(page.getByRole("dialog", { name: "Client sign-in for Client 00" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Clients" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("Client 05")).toBeVisible();
});
