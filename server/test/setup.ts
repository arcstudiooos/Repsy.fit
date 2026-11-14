// Runs before every server test file (Prompt 47). Most mocked tests sign in with a cookie for a coach
// that only exists inside their own prisma mock, so the per-request "is this session still current?"
// database lookup is answered "yes" here. Tests of that lookup itself (password-reset*.test.ts) call
// vi.unmock("../src/auth/sessionCheck.js") to use the real one.
import { vi } from "vitest";

vi.mock("../src/auth/sessionCheck.js", () => ({ isSessionCurrent: async () => true }));

// Billing (Nov 2026): the same trick for the per-write "is this plan paid?" lookup. Mocked route
// tests sign in as a coach that exists only inside their own prisma mock, so by default that coach
// is on a healthy paid plan. Tests about billing itself call
// vi.unmock("../src/billing/current.js") and set up their own rows.
vi.mock("../src/billing/current.js", () => ({
  billingFor: async () => ({
    planTier: "Solo",
    billingStatus: "active",
    trialEndsAt: null,
    periodEndsAt: new Date(Date.now() + 30 * 86_400_000),
    pastDueSince: null,
    paypalSubscriptionId: "I-TEST",
  }),
}));
