// Reads the billing columns for one coach (Nov 2026).
//
// Its own module on purpose: the shared test setup mocks this the same way it mocks sessionCheck,
// so the hundreds of mocked route tests don't each need to stub a billing row. Tests about billing
// itself call vi.unmock("../src/billing/current.js") and drive the real thing.
import { prisma } from "../db.js";
import type { BillingFields } from "./state.js";

export async function billingFor(coachId: string): Promise<BillingFields | null> {
  return prisma.coach.findUnique({
    where: { id: coachId },
    select: {
      planTier: true,
      billingStatus: true,
      trialEndsAt: true,
      periodEndsAt: true,
      pastDueSince: true,
      paypalSubscriptionId: true,
    },
  });
}
