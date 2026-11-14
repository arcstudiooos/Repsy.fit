// What a plan means today (owner, Nov 2026).
//
// The pricing promise, as tests: free forever with 2 clients, paying raises the limit, and a
// billing problem never costs a coach their data or reaches their clients.
import { describe, expect, it } from "vitest";
import { billingState, GRACE_DAYS, type BillingFields } from "../src/billing/state.js";

const NOW = new Date("2026-11-14T10:00:00.000Z");
const days = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

const coach = (over: Partial<BillingFields> = {}): BillingFields => ({
  planTier: "Free",
  billingStatus: "free",
  periodEndsAt: null,
  pastDueSince: null,
  paypalSubscriptionId: null,
  ...over,
});

describe("billingState", () => {
  it("a new account is on the free plan, with two clients and nothing to nag about", () => {
    const s = billingState(coach(), NOW);
    expect(s).toMatchObject({ status: "free", tier: "Free", clientLimit: 2, price: 0, isFree: true, message: null });
  });

  it("a paying account gets its limit and says nothing", () => {
    const s = billingState(
      coach({ planTier: "Pro20", billingStatus: "active", periodEndsAt: days(20), paypalSubscriptionId: "I-1" }),
      NOW,
    );
    expect(s).toMatchObject({ status: "active", tier: "Pro20", clientLimit: 20, price: 45, isFree: false, message: null });
    expect(s.renewsOn).toBe(days(20).toISOString());
  });

  it("a failed payment keeps the paid limit through the grace period", () => {
    const s = billingState(
      coach({ planTier: "Pro10", billingStatus: "past_due", pastDueSince: days(-2), periodEndsAt: days(28), paypalSubscriptionId: "I-1" }),
      NOW,
    );
    expect(s).toMatchObject({ status: "past_due", clientLimit: 10, daysLeft: GRACE_DAYS - 2 });
    expect(s.message).toContain("stay on 10 clients");
  });

  it("drops to the free limit once the grace period runs out, keeping the clients they have", () => {
    const s = billingState(
      coach({ planTier: "Pro10", billingStatus: "past_due", pastDueSince: days(-GRACE_DAYS), paypalSubscriptionId: "I-1" }),
      NOW,
    );
    expect(s).toMatchObject({ status: "free", clientLimit: 2, isFree: true });
    expect(s.message).toContain("You keep every client you have");
  });

  it("a cancelled plan runs to the end of the period already paid for", () => {
    const s = billingState(
      coach({ planTier: "Pro50", billingStatus: "cancelled", periodEndsAt: days(9), paypalSubscriptionId: "I-1" }),
      NOW,
    );
    expect(s).toMatchObject({ status: "active", clientLimit: 50 });
    expect(s.message).toContain("ends in 9 days");
    expect(s.message).toContain("You keep every client you have");
  });

  it("an expired paid period is the free plan again, not a lockout", () => {
    const s = billingState(
      coach({ planTier: "Pro50", billingStatus: "active", periodEndsAt: days(-1), paypalSubscriptionId: "I-1" }),
      NOW,
    );
    expect(s).toMatchObject({ status: "free", clientLimit: 2, isFree: true });
  });

  it("an old tier name from the previous pricing falls back to free, never to unlimited", () => {
    const s = billingState(coach({ planTier: "Studio", billingStatus: "active", periodEndsAt: days(20) }), NOW);
    expect(s).toMatchObject({ status: "free", clientLimit: 2 });
  });

  it("never reports a state that stops a coach reading their own data", () => {
    // There is no read-only state any more: every state is free, active or past_due.
    for (const status of ["free", "active", "past_due", "cancelled", "expired", "nonsense"]) {
      const s = billingState(coach({ planTier: "Pro5", billingStatus: status, periodEndsAt: days(5), pastDueSince: days(-1) }), NOW);
      expect(["free", "active", "past_due"]).toContain(s.status);
      expect(s.clientLimit).toBeGreaterThanOrEqual(2);
    }
  });
});
