// The coach's plan screen and the banner (owner, Nov 2026). Every /api call is mocked.
//
// What these pin down is the pricing promise as a coach experiences it: free forever with 2
// clients, paying raises the limit, and nothing ever threatens their data.
import { expect, test } from "./fixtures";
import type { Page } from "@playwright/test";

const CATALOGUE = [
  { key: "Free", clients: 2, price: 0 },
  { key: "Pro5", clients: 5, price: 17 },
  { key: "Pro10", clients: 10, price: 25 },
  { key: "Pro20", clients: 20, price: 45 },
  { key: "Pro50", clients: 50, price: 90 },
  { key: "Pro100", clients: 100, price: 150 },
];

type Billing = Record<string, unknown>;

const billing = (over: Billing = {}): Billing => ({
  status: "free",
  tier: "Free",
  clientLimit: 2,
  price: 0,
  daysLeft: null,
  isFree: true,
  message: null,
  renewsOn: null,
  clientsUsed: 0,
  enterpriseFrom: 100,
  catalogue: CATALOGUE,
  paypal: {
    clientId: "test-client-id",
    environment: "sandbox",
    plans: { Pro5: "P-5", Pro10: "P-10", Pro20: "P-20", Pro50: "P-50", Pro100: "P-100" },
    customId: "coach-1",
  },
  ...over,
});

async function mockApp(page: Page, state: Billing) {
  // Order matters: Playwright tries the LAST registered route first.
  await page.route("**/api/**", (r) => r.fulfill({ json: [] }));
  await page.route("**/api/billing/me", (r) => r.fulfill({ json: state }));
  await page.route("**/api/billing/payments", (r) => r.fulfill({ json: { reference: null, payments: [] } }));
  await page.route("https://www.paypal.com/**", (r) => r.fulfill({ status: 200, body: "" }));
}

test("a free coach with room sees no banner at all", async ({ page }) => {
  await mockApp(page, billing({ clientsUsed: 1 }));
  await page.goto("/app");
  await expect(page.getByRole("tablist")).toBeVisible();
  await expect(page.getByTestId("billing-banner")).toHaveCount(0);
});

test("a full roster says so, and offers the way out", async ({ page }) => {
  await mockApp(page, billing({ clientsUsed: 2 }));
  await page.goto("/app");
  const banner = page.getByTestId("billing-banner");
  await expect(banner).toContainText("2 of 2 clients on the free plan");
  await expect(banner.getByRole("button", { name: "See plans" })).toBeVisible();
});

test("the account page shows the plan, the usage and the whole ladder", async ({ page }) => {
  await mockApp(page, billing({ clientsUsed: 2 }));
  await page.goto("/app/account");
  const status = page.getByTestId("billing-status");
  await expect(status).toContainText("You are on the free plan: 2 clients.");
  await expect(status).toContainText("2 of 2 used.");
  await expect(status).toContainText("everything you have stays exactly as it is");
  for (const [key, label, price] of [
    ["Pro5", "5 clients", "$17 a month"],
    ["Pro10", "10 clients", "$25 a month"],
    ["Pro20", "20 clients", "$45 a month"],
    ["Pro50", "50 clients", "$90 a month"],
    ["Pro100", "100 clients", "$150 a month"],
  ]) {
    const card = page.getByTestId(`plan-${key}`);
    await expect(card).toContainText(label);
    await expect(card).toContainText(price);
  }
  // Above the top plan, a coach talks to a human.
  await expect(page.getByRole("link", { name: "Email us" })).toHaveAttribute("href", /mailto:hello@repsy\.fit/);
});

test("a plan smaller than the roster cannot be chosen, and says why", async ({ page }) => {
  await mockApp(page, billing({ tier: "Pro20", isFree: false, price: 45, clientLimit: 20, status: "active", clientsUsed: 12 }));
  await page.goto("/app/account");
  const tooSmall = page.getByTestId("plan-Pro5").getByRole("button");
  await expect(tooSmall).toBeDisabled();
  await expect(tooSmall).toContainText("Too small for 12 clients");
  // The plan they are on is labelled, not offered for sale again.
  await expect(page.getByTestId("plan-Pro20")).toContainText("Your plan");
});

test("a failed payment keeps the paid limit and asks for a fix", async ({ page }) => {
  await mockApp(
    page,
    billing({
      status: "past_due",
      tier: "Pro10",
      isFree: false,
      price: 25,
      clientLimit: 10,
      clientsUsed: 7,
      daysLeft: 5,
      message: "Your last payment did not go through. Please update it within 5 days to stay on 10 clients.",
    }),
  );
  await page.goto("/app");
  const banner = page.getByTestId("billing-banner");
  await expect(banner).toHaveAttribute("role", "alert");
  await expect(banner).toContainText("stay on 10 clients");
});

test("cancelling promises the clients are kept", async ({ page }) => {
  await mockApp(page, billing({ status: "active", tier: "Pro10", isFree: false, price: 25, clientLimit: 10, clientsUsed: 4 }));
  await page.goto("/app/account");
  await expect(page.getByText("You keep every client you have")).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancel my plan" })).toBeVisible();
});

test("when payments are not configured, nothing threatens the coach", async ({ page }) => {
  await mockApp(page, billing({ paypal: null }));
  await page.goto("/app/account");
  await expect(page.getByText("Payments are not switched on yet.")).toBeVisible();
  await expect(page.getByTestId("plan-Pro5")).toHaveCount(0);
});

test("paying says so properly, with what was charged and when it renews", async ({ page }) => {
  // A stand-in for PayPal's SDK: the real one must never be fetched in a test. It renders a button
  // that calls onApprove, which is exactly the contract our code depends on.
  await page.addInitScript(() => {
    (window as unknown as { paypal: unknown }).paypal = {
      Buttons: (config: {
        createSubscription: (d: unknown, a: unknown) => Promise<string>;
        onApprove: (d: { subscriptionID: string }) => void;
      }) => ({
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
  await mockApp(page, billing({ clientsUsed: 2 }));
  const renews = new Date(Date.now() + 30 * 86_400_000).toISOString();
  await page.route("**/api/billing/confirm", (r) =>
    r.fulfill({
      json: billing({
        status: "active",
        tier: "Pro5",
        isFree: false,
        price: 17,
        clientLimit: 5,
        clientsUsed: 2,
        renewsOn: renews,
      }),
    }),
  );

  await page.goto("/app/account");
  await page.getByTestId("plan-Pro5").getByRole("button", { name: "Choose 5" }).click();
  await page.getByRole("button", { name: "Pay with PayPal (test)" }).click();

  const welcome = page.getByTestId("billing-welcome");
  await expect(welcome).toContainText("You are on the 5 clients plan. Welcome aboard.");
  await expect(welcome).toContainText("$17 went through");
  await expect(welcome).toContainText("Every feature was already yours");
  await welcome.getByRole("button", { name: "Back to coaching" }).click();
  await expect(page.getByTestId("billing-welcome")).toHaveCount(0);
});
