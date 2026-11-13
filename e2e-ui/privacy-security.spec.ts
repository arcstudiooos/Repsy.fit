// Prompt 73 (+ published Nov 2026): the Privacy Policy and Terms, the Clients permission line, the Account data note, and
// the type-to-confirm delete. Mocked API.
import { expect, test, type Page } from "@playwright/test";
import { emptyApi } from "./fixtures";

const ME = { id: "coach-1", name: "Ana", email: "ana@example.com", createdAt: "2026-11-01T00:00:00.000Z", currency: "INR" };
const CLIENTS = [
  { id: "c-maya", coachId: "coach-1", name: "Maya Patel", goal: "Fat loss", age: 29, weightKg: 68, heightCm: 165, level: "Intermediate", focus: "", notes: "", createdAt: "2026-10-01T00:00:00.000Z" },
];

/** Records every request the page makes, so a test can prove one was NOT sent. */
async function mockApp(page: Page, onDelete?: (body: unknown) => { status: number; json?: unknown }) {
  const sent: { method: string; path: string; body: unknown }[] = [];
  await page.route("**/api/**", (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    sent.push({ method: req.method(), path, body: req.postDataJSON?.() ?? null });
    if (path === "/api/auth/me") return route.fulfill({ json: ME });
    if (path === "/api/clients") return route.fulfill({ json: CLIENTS });
    if (path === "/api/auth/account" && req.method() === "DELETE") {
      const out = onDelete ? onDelete(req.postDataJSON()) : { status: 204 };
      return route.fulfill({ status: out.status, json: out.json ?? {} });
    }
    if (path === "/api/review-queue") return route.fulfill({ json: { pendingCount: 0, items: [] } });
    return route.fulfill({ json: emptyApi(path) });
  });
  return sent;
}

test("the Privacy Policy covers data, Google user data, sharing, retention, deletion and contact", async ({ page }) => {
  await page.goto("/privacy");
  await expect(page.getByRole("heading", { level: 1, name: "Privacy Policy" })).toBeVisible();
  for (const heading of [
    "The data we collect",
    "Google user data",
    "How we use data",
    "Who we share data with",
    "How long we keep data",
    "Deleting your data and your rights",
    "Security",
    "Contact",
  ]) {
    await expect(page.getByRole("heading", { level: 2, name: heading })).toBeVisible();
  }
  const main = page.locator("main");
  // What Google's OAuth review looks for: the scopes, the use, no selling, and the Limited Use statement.
  await expect(main).toContainText("openid, email and profile");
  await expect(main).toContainText("Limited Use requirements");
  await expect(main.getByRole("link", { name: "myaccount.google.com/permissions" })).toHaveAttribute("href", "https://myaccount.google.com/permissions");
  // No promises the app cannot keep, and no data the app never collects.
  await expect(main).toContainText("we cannot guarantee absolute security");
  await expect(main).toContainText("We do not collect or store any card or bank details");
  await expect(main).toContainText("We do not collect or store progress photos");
  // No draft placeholders left on a published page.
  await expect(page.getByText("To complete:")).toHaveCount(0);
  await expect(main.getByRole("link", { name: "hello@repsy.fit" }).first()).toHaveAttribute("href", "mailto:hello@repsy.fit");
});

test("the prerendered Privacy and Terms HTML is complete without JavaScript (what crawlers see)", async ({ browser }) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto("/legal/privacy.html");
  await expect(page.getByRole("heading", { level: 1, name: "Privacy Policy" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Google user data" })).toBeVisible();
  await expect(page.locator("main")).toContainText("Limited Use requirements");
  expect(await page.locator("main h2").count()).toBeGreaterThanOrEqual(12);
  await page.goto("/legal/terms.html");
  await expect(page.getByRole("heading", { level: 1, name: "Terms of Service" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Acceptable use" })).toBeVisible();
  await ctx.close();
});

/** Relative luminance contrast ratio, so "readable" is measured, not assumed. */
async function contrast(page: Page, selector: string): Promise<number> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel)!;
    const lum = (c: string) => {
      const [r, g, b] = c.match(/\d+(\.\d+)?/g)!.slice(0, 3).map(Number);
      const f = (v: number) => (v / 255 <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const style = getComputedStyle(el);
    // Walk up for the first non-transparent background.
    let bgEl: Element | null = el;
    let bg = "rgb(255, 255, 255)";
    while (bgEl) {
      const c = getComputedStyle(bgEl).backgroundColor;
      if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) {
        bg = c;
        break;
      }
      bgEl = bgEl.parentElement;
    }
    const [a, b] = [lum(style.color), lum(bg)].sort((x, y) => y - x);
    return (a + 0.05) / (b + 0.05);
  }, selector);
}

test("the legal pages are readable: light theme, and text meets WCAG AA", async ({ page }) => {
  for (const path of ["/privacy", "/terms"]) {
    await page.goto(path);
    // The pages use the landing page's cream theme, not the dashboard's dark one.
    await expect(page.locator("div.landing-cream").first()).toHaveCSS("background-color", "rgb(250, 247, 242)");
    expect(await contrast(page, "main section p"), `body contrast on ${path}`).toBeGreaterThan(4.5);
    expect(await contrast(page, "h1"), `heading contrast on ${path}`).toBeGreaterThan(4.5);
  }
});

test("the Terms say what Repsy is and is not, without inventing a price", async ({ page }) => {
  await page.goto("/terms");
  await expect(page.getByRole("heading", { level: 1, name: "Terms of Service" })).toBeVisible();
  for (const heading of ["Your account", "Acceptable use", "Disclaimers and liability", "Contact"]) {
    await expect(page.getByRole("heading", { level: 2, name: heading })).toBeVisible();
  }
  const main = page.locator("main");
  await expect(main).toContainText("Repsy is not a payment service");
  await expect(main).toContainText("you will not be charged without agreeing to them");
  await expect(page.getByText("To complete:")).toHaveCount(0);
});

test("the landing footer links to both pages (no more 'coming soon')", async ({ page }) => {
  await page.goto("/");
  const legal = page.getByRole("navigation", { name: "Legal" });
  await expect(legal.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy");
  await expect(legal.getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/terms");
  await legal.getByRole("link", { name: "Privacy" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Privacy Policy" })).toBeVisible();
});

test("Clients carries the permission line", async ({ page }) => {
  await mockApp(page);
  await page.goto("/app");
  await page.getByRole("tab", { name: "Clients" }).click();
  await expect(page.getByText("Only add real client data you have permission to store.")).toBeVisible();
});

test("Account explains what is stored and where to export it", async ({ page }) => {
  await mockApp(page);
  await page.goto("/app/account");
  const note = page.locator("section.grid", { has: page.getByRole("heading", { name: "Your data" }) });
  await expect(note).toContainText("one-way hash of your password");
  await expect(note).toContainText("No card or bank details are stored");
  await expect(note).toContainText("Business");
  await expect(note.getByRole("link", { name: "Privacy page" })).toHaveAttribute("href", "/privacy");
});

test("delete account needs the password AND the typed word, and sends nothing until both are right", async ({ page }) => {
  const sent = await mockApp(page);
  await page.goto("/app/account");
  await page.getByRole("button", { name: "Delete my account" }).click();
  const form = page.getByRole("form", { name: "Delete account" });
  await expect(form).toContainText("It cannot be undone");
  const submit = form.getByRole("button", { name: "Delete my account" });

  // Nothing typed: refused.
  await expect(submit).toBeDisabled();
  // Password only: still refused.
  await form.getByLabel("Your password").fill("right-password-1");
  await expect(submit).toBeDisabled();
  // The wrong word: still refused.
  await form.getByLabel("Type DELETE to confirm").fill("delete");
  await expect(submit).toBeDisabled();
  expect(sent.some((r) => r.method === "DELETE")).toBe(false);

  // Both right: enabled, and the request carries the confirmation.
  await form.getByLabel("Type DELETE to confirm").fill("DELETE");
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect.poll(() => sent.filter((r) => r.method === "DELETE" && r.path === "/api/auth/account").length).toBe(1);
  expect(sent.find((r) => r.method === "DELETE")?.body).toEqual({ password: "right-password-1", confirm: "DELETE" });
});

test("a wrong password shows the server's plain words and keeps the account", async ({ page }) => {
  await mockApp(page, () => ({ status: 400, json: { error: "That password is not right." } }));
  await page.goto("/app/account");
  await page.getByRole("button", { name: "Delete my account" }).click();
  const form = page.getByRole("form", { name: "Delete account" });
  await form.getByLabel("Your password").fill("wrong-password-1");
  await form.getByLabel("Type DELETE to confirm").fill("DELETE");
  await form.getByRole("button", { name: "Delete my account" }).click();
  await expect(form.getByRole("alert")).toContainText("That password is not right.");
  // Still on the account page, not signed out.
  await expect(page.getByRole("heading", { name: "Your data" })).toBeVisible();
});

test("Cancel closes the delete form and forgets what was typed", async ({ page }) => {
  await mockApp(page);
  await page.goto("/app/account");
  await page.getByRole("button", { name: "Delete my account" }).click();
  const form = page.getByRole("form", { name: "Delete account" });
  await form.getByLabel("Your password").fill("right-password-1");
  await form.getByRole("button", { name: "Cancel" }).click();
  await expect(form).toHaveCount(0);
  await page.getByRole("button", { name: "Delete my account" }).click();
  await expect(page.getByRole("form", { name: "Delete account" }).getByLabel("Your password")).toHaveValue("");
});
