// Tests for the one function that decides what a lapsed account may do (Nov 2026).
// The owner's rule, tested explicitly: a billing problem never hides a coach's data and never
// reaches their clients - it only stops NEW plans.
import { describe, expect, it } from "vitest";
import { billingState, GRACE_DAYS, type BillingFields } from "../src/billing/state.js";

const NOW = new Date("2026-11-14T10:00:00.000Z");
const days = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

const coach = (over: Partial<BillingFields> = {}): BillingFields => ({
  planTier: "Solo",
  billingStatus: "trialing",
  trialEndsAt: days(7),
  periodEndsAt: null,
  pastDueSince: null,
  paypalSubscriptionId: null,
  ...over,
});

describe("billingState", () => {
  it("a new account is trialing and can write, counting the days down", () => {
    const s = billingState(coach({ trialEndsAt: days(3) }), NOW);
    expect(s).toMatchObject({ status: "trialing", canWrite: true, daysLeft: 3, needsSubscription: true });
    expect(s.message).toBe("3 days left of your free trial.");
    expect(billingState(coach({ trialEndsAt: days(1) }), NOW).message).toBe("1 day left of your free trial.");
  });

  it("a paid subscription says nothing and can write", () => {
    const s = billingState(coach({ billingStatus: "active", periodEndsAt: days(20), paypalSubscriptionId: "I-1", planTier: "Pro" }), NOW);
    expect(s).toMatchObject({ status: "active", tier: "Pro", canWrite: true, needsSubscription: false, message: null });
  });

  it("an expired trial is read-only, and says the clients are unaffected", () => {
    const s = billingState(coach({ trialEndsAt: days(-1) }), NOW);
    expect(s.status).toBe("read_only");
    expect(s.canWrite).toBe(false);
    expect(s.needsSubscription).toBe(true);
    expect(s.message).toContain("Everything you already have stays here, and your clients are unaffected.");
  });

  it("a failed payment keeps full access for the grace period, then goes read-only", () => {
    const fresh = billingState(coach({ billingStatus: "past_due", pastDueSince: days(-1), paypalSubscriptionId: "I-1" }), NOW);
    expect(fresh).toMatchObject({ status: "past_due", canWrite: true, daysLeft: GRACE_DAYS - 1 });
    expect(fresh.message).toContain("did not go through");

    const lapsed = billingState(coach({ billingStatus: "past_due", pastDueSince: days(-GRACE_DAYS), paypalSubscriptionId: "I-1" }), NOW);
    expect(lapsed).toMatchObject({ status: "read_only", canWrite: false });
  });

  it("a cancelled plan keeps working until the paid period ends, then stops", () => {
    const within = billingState(coach({ billingStatus: "cancelled", periodEndsAt: days(5), paypalSubscriptionId: "I-1" }), NOW);
    expect(within).toMatchObject({ status: "active", canWrite: true, daysLeft: 5, needsSubscription: true });
    expect(within.message).toContain("ends in 5 days");

    const after = billingState(coach({ billingStatus: "cancelled", periodEndsAt: days(-1), paypalSubscriptionId: "I-1" }), NOW);
    expect(after).toMatchObject({ status: "read_only", canWrite: false });
  });

  it("an active status whose period has run out is read-only (a missed webhook cannot buy access)", () => {
    const s = billingState(coach({ billingStatus: "active", periodEndsAt: days(-2), paypalSubscriptionId: "I-1" }), NOW);
    expect(s).toMatchObject({ status: "read_only", canWrite: false });
  });

  it("an old account with no trial date set is read-only rather than free forever", () => {
    const s = billingState(coach({ trialEndsAt: null }), NOW);
    expect(s.canWrite).toBe(false);
  });
});
