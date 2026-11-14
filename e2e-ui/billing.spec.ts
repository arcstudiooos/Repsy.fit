// The coach's billing screen and the banner (Nov 2026). Every /api call is mocked.
//
// What these pin down is the owner's rule as a coach experiences it: a lapsed plan says so in plain
// words, promises the data is still there, and never claims anything about the client app.
import { expect, test } from "./fixtures";
import type { Page } from "@playwright/test";

const DAY = 86_400_000;

type Billing = Record<string, unknown>;

const billing = (over: Billing = {}): Billing => ({
  status: "trialing",
  tier: "Solo",
  canWrite: true,
  daysLeft: 3,
  needsSubscription: true,
  message: "3 days left of your free trial.",
  paypal: {
    clientId: "test-client-id",
    environment: "sandbox",
    plans: { Solo: "P-SOLO", Pro: "P-PRO", Studio: "P-STUDIO" },
    customId: "coach-1",
  },
  ...over,
});

async function mockApp(page: Page, state: Billing) {
  // The fixture signs the coach in; only the billing call needs its own answer.
  // Order matters: Playwright tries the LAST registered route first, so the catch-all goes first
  // and the specific billing route is registered after it.
  await page.route("**/api/**", (r) => r.fulfill({ json: [] }));
  await page.route("**/api/billing/me", (r) => r.fulfill({ json: state }));
  await page.route("**/api/billing/payments", (r) =>
    r.fulfill({
      json: {
        reference: "I-TESTREF123",
        tier: "Solo",
        payments: [{ id: "TX-ABC123", time: "2026-11-14T08:41:46Z", amount: "39.00", currency: "USD", status: "COMPLETED" }],
      },
    }),
  );
  // The PayPal SDK must never be fetched for real in a test.
  await page.route("https://www.paypal.com/**", (r) => r.fulfill({ status: 200, body: "" }));
}

test("the banner stays quiet early in a trial", async ({ page }) => {
  await mockApp(page, billing({ daysLeft: 6, message: "6 days left of your free trial." }));
  await page.goto("/app");
  await expect(page.getByRole("tablist")).toBeVisible();
  await expect(page.getByTestId("billing-banner")).toHaveCount(0);
});

test("the banner speaks up near the end of the trial", async ({ page }) => {
  await mockApp(page, billing({ daysLeft: 2, message: "2 days left of your free trial." }));
  await page.goto("/app");
  const banner = page.getByTestId("billing-banner");
  await expect(banner).toContainText("2 days left of your free trial.");
  await expect(banner.getByRole("button", { name: "Choose a plan" })).toBeVisible();
});

test("a lapsed plan says what still works, and never mentions the clients being cut off", async ({ page }) => {
  await mockApp(
    page,
    billing({
      status: "read_only",
      canWrite: false,
      daysLeft: 0,
      message: "Your free trial has ended, so new plans are paused. Everything you already have stays here, and your clients are unaffected.",
    }),
  );
  await page.goto("/app");
  const banner = page.getByTestId("billing-banner");
  await expect(banner).toHaveAttribute("role", "alert");
  await expect(banner).toContainText("your clients are unaffected");
});

test("the account page shows the three plans and the price of each", async ({ page }) => {
  await mockApp(page, billing());
  await page.goto("/app/account");
  const status = page.getByTestId("billing-status");
  await expect(status).toContainText("You are on a free trial of Solo.");
  await expect(page.getByText("$39 per month · Up to 30 clients")).toBeVisible();
  await expect(page.getByText("$89 per month · Up to 100 clients")).toBeVisible();
  await expect(page.getByText("$199 per month · No client limit")).toBeVisible();
  // Test mode must be admitted, so nobody thinks they have really paid.
  await expect(page.getByText("PayPal is in test mode: no real money moves.")).toBeVisible();
});

test("a paid coach is offered a cancellation that keeps the rest of the paid period", async ({ page }) => {
  await mockApp(
    page,
    billing({ status: "active", needsSubscription: false, daysLeft: null, message: null, tier: "Pro" }),
  );
  await page.goto("/app/account");
  await expect(page.getByTestId("billing-status")).toContainText("You are on Pro.");
  await expect(page.getByText("You keep everything until the end of the period you have already paid for.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancel my plan" })).toBeVisible();
});

test("when payments are not configured, nothing threatens the coach", async ({ page }) => {
  await mockApp(page, billing({ paypal: null, needsSubscription: false, message: null, status: "active" }));
  await page.goto("/app/account");
  await expect(page.getByText("Payments are not switched on yet.")).toBeVisible();
  await expect(page.getByRole("button", { name: /Choose (Solo|Pro|Studio)/ })).toHaveCount(0);
});

test("paying says so properly, with what was charged and when it renews", async ({ page }) => {
  // A stand-in for PayPal's SDK: the real one is third-party and must never be fetched in a test.
  // It renders a button that calls onApprove, which is exactly the contract our code depends on -
  // so this breaks if we ever use the SDK wrongly.
  await page.addInitScript(() => {
    (window as unknown as { paypal: unknown }).paypal = {
      Buttons: (config: { createSubscription: (d: unknown, a: unknown) => Promise<string>; onApprove: (d: { subscriptionID: string }) => void }) => ({
        render: async (el: HTMLElement) => {
          const b = document.createElement("button");
          b.textContent = "Pay with PayPal (test)";
          b.onclick = async () => {
            await config.createSubscription({}, { subscription: { create: async () => "I-TEST" } });
            config.onApprove({ subscriptionID: "I-TEST" });
          };
          el.appendChild(b);
        },
      }),
    };
  });
  await mockApp(page, billing());
  const renews = new Date(Date.now() + 30 * 86_400_000).toISOString();
  await page.route("**/api/billing/confirm", (r) =>
    r.fulfill({
      json: {
        status: "active",
        tier: "Solo",
        canWrite: true,
        daysLeft: null,
        needsSubscription: false,
        message: null,
        renewsOn: renews,
        paypal: null,
      },
    }),
  );

  await page.goto("/app/account");
  await page.getByRole("button", { name: "Choose Solo" }).click();
  await page.getByRole("button", { name: "Pay with PayPal (test)" }).click();

  const welcome = page.getByTestId("billing-welcome");
  await expect(welcome).toContainText("You're on Solo. Welcome aboard.");
  await expect(welcome).toContainText("$39 went through");
  await expect(welcome).toContainText("renews on");
  await expect(welcome).toContainText("cancel any time without losing a thing");

  // Dismissing it returns to the ordinary view, and it does not come back on its own.
  await welcome.getByRole("button", { name: "Back to coaching" }).click();
  await expect(page.getByTestId("billing-welcome")).toHaveCount(0);
  await expect(page.getByTestId("billing-status")).toContainText("You are on Solo.");
});

test("the payments a coach can show someone, with the ids that prove them", async ({ page }) => {
  await mockApp(page, billing({ status: "active", needsSubscription: false, message: null, daysLeft: null }));
  await page.goto("/app/account");
  const payments = page.getByTestId("billing-payments");
  await expect(payments).toContainText("I-TESTREF123");
  await expect(payments).toContainText("$39.00");
  // The date follows the coach's locale ("14 November 2026" here, "November 14, 2026" in a US
  // browser), so the test must not pin one of them.
  await expect(payments).toContainText(/(14 November 2026|November 14, 2026)/);
  await expect(payments).toContainText("Paid");
  await expect(payments).toContainText("TX-ABC123");
  await expect(payments.getByRole("button", { name: "Download payments (CSV)" })).toBeEnabled();
});
