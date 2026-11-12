// Prompt 76: the coach's "Invite clients" panel (join code, link, QR, switches). Every /api call is mocked.
import { expect, test, type Page } from "@playwright/test";

const CLIENTS = [
  { id: "c-maya", coachId: "coach-1", name: "Maya Patel", goal: "Fat loss", age: 29, weightKg: 68, heightCm: 165, level: "Intermediate", focus: "", notes: "", createdAt: "2026-10-01T00:00:00.000Z", loginEmail: null },
];
const ME = { id: "coach-1", name: "Anna Rivers", email: "anna@example.com", createdAt: "2026-11-01T00:00:00.000Z" };

type JC = { code: string; active: boolean; approveNewClients: boolean; link: string };

async function open(page: Page, opts: { failFirst?: boolean; share?: boolean } = {}) {
  let jc: JC = { code: "ANNA-7K2Q8M", active: true, approveNewClients: false, link: "https://app.repsy.fit/join/ANNA-7K2Q8M" };
  const calls: string[] = [];
  // While failing, every GET errors (React Query retries 5xx), until the test flips it with recover().
  const state = { failing: !!opts.failFirst };
  await page.route("**/api/**", (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (path === "/api/auth/me") return route.fulfill({ json: ME });
    if (path === "/api/clients") return route.fulfill({ json: CLIENTS });
    if (path === "/api/join-code" && req.method() === "GET") {
      if (state.failing) return route.fulfill({ status: 500, json: { error: "Something went wrong." } });
      return route.fulfill({ json: jc });
    }
    if (path === "/api/join-code" && req.method() === "PATCH") {
      const body = req.postDataJSON() as Partial<JC>;
      calls.push(`PATCH ${JSON.stringify(body)}`);
      jc = { ...jc, ...body };
      return route.fulfill({ json: jc });
    }
    if (path === "/api/join-code/regenerate") {
      calls.push("REGENERATE");
      jc = { ...jc, code: "ANNA-Z9P4WX", link: "https://app.repsy.fit/join/ANNA-Z9P4WX" };
      return route.fulfill({ json: jc });
    }
    if (path === "/api/review-queue") return route.fulfill({ json: { pendingCount: 0, items: [] } });
    return route.fulfill({ json: [] });
  });
  if (opts.share) {
    await page.addInitScript(() => {
      (window as unknown as { shared: unknown[] }).shared = [];
      Object.defineProperty(navigator, "share", {
        value: async (data: unknown) => void (window as unknown as { shared: unknown[] }).shared.push(data),
      });
    });
  }
  await page.goto("/app");
  await page.getByRole("tab", { name: "Clients" }).click();
  const panel = page.getByRole("region", { name: "Invite clients" });
  return { panel, calls, recover: () => (state.failing = false) };
}

test("a compact bar: the code, Copy link and the QR behind a button; settings folded away", async ({ page }) => {
  const { panel } = await open(page);
  await expect(panel.getByTestId("join-code")).toHaveText("ANNA-7K2Q8M");
  await expect(panel.getByRole("button", { name: "Copy link" })).toBeVisible();
  // The settings (and the full link) sit behind "Invite settings".
  await expect(panel.getByRole("switch", { name: "Code is on" })).toBeHidden();
  await expect(panel.getByLabel("Join link", { exact: true })).toBeHidden();
  await panel.getByText("Invite settings").click();
  await expect(panel.getByLabel("Join link", { exact: true })).toHaveValue("https://app.repsy.fit/join/ANNA-7K2Q8M");
  await expect(panel.getByRole("switch", { name: "Code is on" })).toBeVisible();
  const qr = panel.getByRole("img", { name: /QR code for your join link/ });
  await expect(qr).toHaveCount(0);
  const show = panel.getByRole("button", { name: "Show QR code" });
  await expect(show).toHaveAttribute("aria-expanded", "false");
  await show.click();
  await expect(panel.getByRole("button", { name: "Hide QR code" })).toHaveAttribute("aria-expanded", "true");
  await expect(qr).toBeVisible();
  // 38-character link -> version 3 (29 x 29 modules) at level M.
  await expect(qr).toHaveAttribute("data-modules", "29");
  await expect(qr).toHaveAttribute("viewBox", "0 0 37 37"); // + 4-module quiet zone each side
  // Every dark module drawn is a 1x1 square inside the code area.
  const squares = await qr.locator("path").evaluate((p) => (p.getAttribute("d") ?? "").match(/M\d+ \d+h1v1h-1z/g)?.length ?? 0);
  expect(squares).toBeGreaterThan(29 * 29 * 0.3);
  expect(squares).toBeLessThan(29 * 29 * 0.7);
  // Share only appears where the browser supports it (not in this headless Chromium).
  await expect(panel.getByRole("button", { name: "Share" })).toHaveCount(0);
});

test("copy code and copy link put the right text on the clipboard", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const { panel } = await open(page);
  await panel.getByText("Invite settings").click();
  await panel.getByRole("button", { name: "Copy code" }).click();
  await expect(panel.getByRole("button", { name: "Copied" })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Copy code" })).toBeVisible({ timeout: 4000 }); // resets after ~2 s
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("ANNA-7K2Q8M");
  await panel.getByRole("button", { name: "Copy link" }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("https://app.repsy.fit/join/ANNA-7K2Q8M");
});

test("Share uses the device share sheet when there is one", async ({ page }) => {
  const { panel } = await open(page, { share: true });
  await panel.getByRole("button", { name: "Share" }).click();
  const shared = await page.evaluate(() => (window as unknown as { shared: { url: string }[] }).shared);
  expect(shared).toEqual([expect.objectContaining({ url: "https://app.repsy.fit/join/ANNA-7K2Q8M" })]);
});

test("turning the code off and on, and the approval switch", async ({ page }) => {
  const { panel, calls } = await open(page);
  await panel.getByText("Invite settings").click();
  const on = panel.getByRole("switch", { name: "Code is on" });
  await expect(on).toHaveAttribute("aria-checked", "true");
  await on.click();
  await expect(on).toHaveAttribute("aria-checked", "false");
  await expect(panel.getByRole("status")).toContainText("Your code is turned off.");
  await on.click();
  await expect(panel.getByRole("status")).toHaveCount(0);
  const approve = panel.getByRole("switch", { name: "Approve new clients before they join" });
  await approve.click();
  await expect(approve).toHaveAttribute("aria-checked", "true");
  expect(calls).toEqual(['PATCH {"active":false}', 'PATCH {"active":true}', 'PATCH {"approveNewClients":true}']);
});

test("making a new code asks first, then shows the new code and link", async ({ page }) => {
  const { panel, calls } = await open(page);
  await panel.getByText("Invite settings").click();
  await panel.getByRole("button", { name: "Make a new code" }).click();
  const dialog = page.getByRole("dialog", { name: "Make a new join code?" });
  await expect(dialog).toContainText("ANNA-7K2Q8M) will stop working straight away");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  expect(calls).toEqual([]);
  await panel.getByRole("button", { name: "Make a new code" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Make new code" }).click();
  await expect(panel.getByTestId("join-code")).toHaveText("ANNA-Z9P4WX");
  await expect(panel.getByLabel("Join link", { exact: true })).toHaveValue("https://app.repsy.fit/join/ANNA-Z9P4WX");
  expect(calls).toEqual(["REGENERATE"]);
});

test("a load error shows Retry, which recovers", async ({ page }) => {
  const { panel, recover } = await open(page, { failFirst: true });
  await expect(panel.getByRole("alert")).toContainText("Couldn't load your join code", { timeout: 15_000 });
  recover();
  await panel.getByRole("button", { name: "Retry" }).click();
  await expect(panel.getByTestId("join-code")).toHaveText("ANNA-7K2Q8M");
});

test("on a phone the bar fits and the QR code is behind a button", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 844 });
  const { panel } = await open(page);
  const qr = panel.getByRole("img", { name: /QR code/ });
  await expect(qr).toBeHidden();
  await panel.getByRole("button", { name: "Show QR code" }).click();
  await expect(qr).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
});
