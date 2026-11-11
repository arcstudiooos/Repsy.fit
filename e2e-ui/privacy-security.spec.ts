// Prompt 73: the Privacy and Terms drafts, the Clients permission line, the Account data note, and
// the type-to-confirm delete. Mocked API.
import { expect, test, type Page } from "@playwright/test";

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
    return route.fulfill({ json: [] });
  });
  return sent;
}

test("the Privacy draft says what data, why, who sees it and how to delete it - and is labelled a draft", async ({ page }) => {
  await page.goto("/privacy");
  await expect(page.getByRole("heading", { level: 1, name: "Privacy" })).toBeVisible();
  // Labelled a draft at the top AND in the footer, so it can never read as a final legal document.
  await expect(page.getByRole("note")).toContainText("Draft for legal review");
  await expect(page.locator("footer")).toContainText("Draft, pending legal review");
  for (const heading of ["What data is stored", "Why it is stored", "Who can see it", "How to get data deleted", "Security"]) {
    await expect(page.getByRole("heading", { level: 2, name: heading })).toBeVisible();
  }
  // Gaps a lawyer must fill are marked, not quietly invented.
  expect(await page.getByText("To complete:").count()).toBeGreaterThan(3);
  // It must not claim a guarantee the app cannot keep.
  await expect(page.locator("main")).toContainText("No security measure is perfect");
  await expect(page.locator("main")).toContainText("No card or bank details are collected");
});

test("the Terms draft is a draft, and does not invent liability or pricing claims", async ({ page }) => {
  await page.goto("/terms");
  await expect(page.getByRole("heading", { level: 1, name: "Terms" })).toBeVisible();
  await expect(page.getByRole("note")).toContainText("Draft for legal review");
  await expect(page.locator("footer")).toContainText("Draft, pending legal review");
  await expect(page.getByRole("heading", { level: 2, name: "Liability and the rest" })).toBeVisible();
  // The liability and paid-plan sections are explicitly left for a lawyer.
  await expect(page.locator("main")).toContainText("must be drafted by a lawyer");
  await expect(page.locator("main")).toContainText("The app does not take payments today");
  await expect(page.locator("main")).toContainText("It is not a payment service");
});

test("the landing footer links to both pages (no more 'coming soon')", async ({ page }) => {
  await page.goto("/");
  const legal = page.getByRole("navigation", { name: "Legal" });
  await expect(legal.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy");
  await expect(legal.getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/terms");
  await legal.getByRole("link", { name: "Privacy" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Privacy" })).toBeVisible();
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
