// The AI spend cap (Nov 2026). The owner's budget is USD 20 a month.
//
// Three independent limits, because one is never enough:
//   1. `max_tokens` on every request - a hard ceiling on what ONE reply can cost.
//   2. A per-coach daily call limit - one confused coach in a loop cannot drink the whole month.
//   3. A global monthly budget - when the month's estimated spend reaches it, the AI politely stops.
//
// Estimated, not billed. The provider's own dashboard is the source of truth for money; this is a
// guard rail that errs on the side of over-counting (it charges output rates to reasoning tokens it
// cannot see). The owner should ALSO set a hard cap in the provider dashboard: this code cannot stop
// spending it does not know about, and a budget enforced in only one place is not a budget.
import { prisma } from "../db.js";

/** Hard ceiling on one reply. A plan is a few hundred tokens; 1200 is generous and bounded. */
export const MAX_OUTPUT_TOKENS = Number(process.env.AI_MAX_OUTPUT_TOKENS ?? 1200);

/** The month's budget in US cents. 2000 = USD 20. */
export const MONTHLY_BUDGET_CENTS = Math.round(Number(process.env.AI_MONTHLY_BUDGET_USD ?? 20) * 100);

/** Per coach, per day. Generous for real use, fatal to a loop. */
export const DAILY_CALLS_PER_COACH = Number(process.env.AI_DAILY_CALLS_PER_COACH ?? 60);

/**
 * Price per MILLION tokens, in US cents, for the configured model.
 *
 * Deliberately a small table with a DEFENSIVE fallback: an unknown model is charged at the highest
 * rate here, so switching to a pricier model cannot silently blow the budget. Update when the model
 * changes - and when in doubt, guess high.
 */
const PRICES: Record<string, { inputCents: number; outputCents: number }> = {
  "gpt-4o-mini": { inputCents: 15, outputCents: 60 },
  "gpt-4o": { inputCents: 250, outputCents: 1000 },
  "gpt-4.1-mini": { inputCents: 40, outputCents: 160 },
  "gpt-4.1": { inputCents: 200, outputCents: 800 },
  "o4-mini": { inputCents: 110, outputCents: 440 },
};
const DEAREST = Object.values(PRICES).reduce((a, b) => (b.outputCents > a.outputCents ? b : a));

export const priceFor = (model: string) => PRICES[model] ?? DEAREST;

/** What a call cost, in cents, rounded UP so a long tail of cheap calls still adds up. */
export function costCents(model: string, inputTokens: number, outputTokens: number): number {
  const { inputCents, outputCents } = priceFor(model);
  return Math.ceil((inputTokens * inputCents + outputTokens * outputCents) / 1_000_000);
}

/** "2026-11" - the calendar month a spend belongs to, in UTC so it cannot shift under us. */
export const monthKey = (now: Date = new Date()): string => now.toISOString().slice(0, 7);
/** "2026-11-15" - the day a call counts against, UTC for the same reason. */
export const dayKey = (now: Date = new Date()): string => now.toISOString().slice(0, 10);

/**
 * Did this failure come from the budget rather than the provider?
 *
 * The two reasons live here so the message and the test for it cannot drift apart. A budget stop
 * deserves a 429 and an honest explanation, never "please try again" - trying again cannot help.
 */
export const isBudgetStop = (message: string): boolean =>
  message.includes("reached its limit for this month") || message.includes("used the AI assistant a lot today");

export interface BudgetVerdict {
  allowed: boolean;
  /** Shown to the coach verbatim when not allowed. Never mentions money or other coaches. */
  reason?: string;
  spentCents: number;
  budgetCents: number;
}

/**
 * May we make a call right now?
 *
 * FAILS OPEN on a database error, deliberately: the other two limits (`max_tokens` and the fact
 * that a broken database means the app is largely unusable anyway) bound the damage, and refusing
 * every coach because a counter is unreadable is the worse failure. FAILS CLOSED on an exhausted
 * budget, which is the case that actually costs money.
 */
export async function checkBudget(coachId: string, now: Date = new Date()): Promise<BudgetVerdict> {
  const month = monthKey(now);
  try {
    const [monthRows, todayRow] = await Promise.all([
      prisma.aiUsage.aggregate({ where: { month }, _sum: { costCents: true } }),
      prisma.aiUsage.findFirst({ where: { coachId, day: dayKey(now) }, select: { calls: true } }),
    ]);
    const spentCents = monthRows._sum.costCents ?? 0;

    if (spentCents >= MONTHLY_BUDGET_CENTS) {
      return {
        allowed: false,
        reason:
          "The AI assistant has reached its limit for this month. Everything else in Repsy works as normal, and it resets at the start of next month.",
        spentCents,
        budgetCents: MONTHLY_BUDGET_CENTS,
      };
    }
    if ((todayRow?.calls ?? 0) >= DAILY_CALLS_PER_COACH) {
      return {
        allowed: false,
        reason: "You have used the AI assistant a lot today. It will be available again tomorrow.",
        spentCents,
        budgetCents: MONTHLY_BUDGET_CENTS,
      };
    }
    return { allowed: true, spentCents, budgetCents: MONTHLY_BUDGET_CENTS };
  } catch (err) {
    console.error(
      `AI budget check failed: ${err instanceof Error ? err.message : String(err)}. Allowing the call; max_tokens still applies.`,
    );
    return { allowed: true, spentCents: 0, budgetCents: MONTHLY_BUDGET_CENTS };
  }
}

/**
 * Records what a call cost. Never throws: a ledger write must not lose a reply the coach is reading.
 *
 * One row per coach per day, so the month aggregates cheaply and a runaway coach is visible.
 */
export async function recordUsage(
  coachId: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
  now: Date = new Date(),
): Promise<void> {
  const cents = costCents(model, inputTokens, outputTokens);
  try {
    await prisma.aiUsage.upsert({
      where: { coachId_day: { coachId, day: dayKey(now) } },
      create: {
        coachId,
        day: dayKey(now),
        month: monthKey(now),
        calls: 1,
        inputTokens,
        outputTokens,
        costCents: cents,
      },
      update: {
        calls: { increment: 1 },
        inputTokens: { increment: inputTokens },
        outputTokens: { increment: outputTokens },
        costCents: { increment: cents },
      },
    });
  } catch (err) {
    // Under-counting is a smaller problem than losing the coach's answer.
    console.error(`Could not record AI usage for coach ${coachId}: ${err instanceof Error ? err.message : String(err)}.`);
  }
}

/**
 * A sentence for the owner when the month's budget is most of the way gone, or null.
 *
 * Warns at 80% so there is time to react, and again at 100% so the stop is never discovered by a
 * confused coach. Alert deduplication upstream keeps this to one email per threshold per hour.
 */
export async function budgetWarning(now: Date = new Date()): Promise<string | null> {
  const summary = await usageSummary(now);
  const pounds = (cents: number) => `$${(cents / 100).toFixed(2)}`;
  if (summary.spentCents >= summary.budgetCents) {
    return `The AI assistant has stopped for ${summary.month}: an estimated ${pounds(summary.spentCents)} of the ${pounds(summary.budgetCents)} budget is used, across ${summary.calls} calls. Coaches are told it returns next month. Everything else in Repsy is unaffected.`;
  }
  if (summary.percentUsed >= 80) {
    return `The AI assistant has used an estimated ${pounds(summary.spentCents)} of its ${pounds(summary.budgetCents)} budget for ${summary.month} (${summary.percentUsed}%), across ${summary.calls} calls. It will stop itself at the limit.`;
  }
  return null;
}

/** What the owner sees: this month's spend against the budget. */
export async function usageSummary(now: Date = new Date()) {
  const month = monthKey(now);
  const totals = await prisma.aiUsage.aggregate({
    where: { month },
    _sum: { calls: true, inputTokens: true, outputTokens: true, costCents: true },
  });
  const spentCents = totals._sum.costCents ?? 0;
  return {
    month,
    calls: totals._sum.calls ?? 0,
    inputTokens: totals._sum.inputTokens ?? 0,
    outputTokens: totals._sum.outputTokens ?? 0,
    spentCents,
    budgetCents: MONTHLY_BUDGET_CENTS,
    /** Rounded so a nearly-spent budget never reads as 100% while calls still work. */
    percentUsed: MONTHLY_BUDGET_CENTS === 0 ? 100 : Math.floor((spentCents / MONTHLY_BUDGET_CENTS) * 100),
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    dailyCallsPerCoach: DAILY_CALLS_PER_COACH,
  };
}
