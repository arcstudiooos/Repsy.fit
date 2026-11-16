// ConfirmDialog is built on the Modal primitive (Nov 2026 UI batch).
//
// It predated Modal and carried its own copy of the native-<dialog> mechanics, which meant it
// quietly missed two things: focus never returned to whatever opened it, so a keyboard user lost
// their place in the list after every delete, and the page behind could still scroll. Its props did
// not change, so all fifteen call sites were left alone - these tests pin what DID change.
//
// The templates list is the venue because its Delete is a plain visible button. On the Clients tab
// the same confirm is opened from inside a "More actions" menu, so the element that opened it is
// already gone by the time the dialog closes - a different (and weaker) test of focus return.
import { expect, test, type Page, type Route, emptyApi } from "./fixtures";

const templates = Array.from({ length: 12 }, (_, i) => ({
  id: `t${i}`,
  coachId: "c1",
  name: `Template ${String(i).padStart(2, "0")}`,
  focus: "Full body",
  notes: "",
  exercises: [{ name: "Back Squat", sets: 3, reps: "8", rest: 90 }],
  createdAt: "2026-11-01T00:00:00.000Z",
}));

async function openTemplates(page: Page) {
  await page.route("**/api/**", (route: Route) =>
    route.fulfill({ status: 200, json: emptyApi(new URL(route.request().url()).pathname) }),
  );
  await page.route("**/api/templates**", (route: Route) => route.fulfill({ status: 200, json: templates }));
  await page.setViewportSize({ width: 1280, height: 700 });
  await page.goto("/app");
  // Nov 2026: the Library is its own tab, not a view inside Business.
  await page.getByRole("tab", { name: "Library" }).click();
  await expect(page.getByRole("heading", { level: 3, name: "Template 11" })).toBeVisible();
  await page.waitForLoadState("networkidle");
}

test("cancelling a delete returns focus to that row's own Delete button", async ({ page }) => {
  await openTemplates(page);
  const trigger = page.getByRole("button", { name: "Delete Template 07" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Delete this template?" });
  await expect(dialog).toBeVisible();

  // Focus starts on Cancel: for a destructive confirm the safe button is the one under the finger.
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toHaveCount(0);
  // The regression that mattered: without this a keyboard user was dumped at the top of the
  // document and had to tab through the whole list again to reach the next template.
  await expect(trigger).toBeFocused();
});

test("Escape cancels and also returns focus", async ({ page }) => {
  await openTemplates(page);
  const trigger = page.getByRole("button", { name: "Delete Template 02" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Delete this template?" });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("the page behind cannot be scrolled while the confirm is open", async ({ page }) => {
  await openTemplates(page);
  await page.getByRole("button", { name: "Delete Template 00" }).click();
  await expect(page.getByRole("dialog", { name: "Delete this template?" })).toBeVisible();
  const before = await page.evaluate(() => window.scrollY);
  // A real wheel event, because window.scrollTo bypasses an overflow lock entirely.
  await page.mouse.wheel(0, 600);
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => window.scrollY)).toBe(before);
});

test("Tab never reaches the list behind the confirm", async ({ page }) => {
  await openTemplates(page);
  await page.getByRole("button", { name: "Delete Template 00" }).click();
  const dialog = page.getByRole("dialog", { name: "Delete this template?" });
  await expect(dialog).toBeVisible();
  for (let i = 0; i < 8; i += 1) {
    await page.keyboard.press("Tab");
    // body is a legitimate stop for one step as focus wraps inside the dialog.
    const inside = await dialog.evaluate((d) => d.contains(document.activeElement) || document.activeElement === document.body);
    expect(inside).toBe(true);
  }
});
