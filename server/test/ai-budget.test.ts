// The AI spend cap and owner alerting (Nov 2026). The owner's budget is USD 20 a month.
//
// These are the tests that protect money, so they care about the awkward cases: an unknown model, a
// provider that reports no tokens, a database that will not answer, and a crash loop that would
// otherwise email two thousand times.
import { beforeEach, describe, expect, it, vi } from "vitest";

const { prisma } = vi.hoisted(() => ({
  prisma: { aiUsage: { aggregate: vi.fn(), findFirst: vi.fn(), upsert: vi.fn() } },
}));
vi.mock("../src/db.js", () => ({ prisma }));

const budget = await import("../src/ai/budget.js");
const {
  DAILY_CALLS_PER_COACH,
  MAX_OUTPUT_TOKENS,
  MONTHLY_BUDGET_CENTS,
  budgetWarning,
  checkBudget,
  costCents,
  dayKey,
  isBudgetStop,
  monthKey,
  priceFor,
  recordUsage,
  usageSummary,
} = budget;

const spent = (cents: number) => prisma.aiUsage.aggregate.mockResolvedValue({ _sum: { costCents: cents } });

beforeEach(() => {
  vi.clearAllMocks();
  spent(0);
  prisma.aiUsage.findFirst.mockResolvedValue(null);
  prisma.aiUsage.upsert.mockResolvedValue({});
});

describe("the limits themselves", () => {
  it("defaults to the owner's USD 20 a month", () => {
    expect(MONTHLY_BUDGET_CENTS).toBe(2000);
  });

  it("caps what one reply can cost", () => {
    expect(MAX_OUTPUT_TOKENS).toBeGreaterThan(0);
    expect(MAX_OUTPUT_TOKENS).toBeLessThanOrEqual(2000);
  });

  it("caps one coach's calls per day well below the month's budget", () => {
    expect(DAILY_CALLS_PER_COACH).toBeGreaterThan(10);
    // A day of one coach at full tilt must not be able to eat the month.
    const worstDay = DAILY_CALLS_PER_COACH * costCents("gpt-4o-mini", 4000, MAX_OUTPUT_TOKENS);
    expect(worstDay).toBeLessThan(MONTHLY_BUDGET_CENTS);
  });
});

describe("costCents", () => {
  it("prices a typical call at a fraction of a cent, rounded up", () => {
    // Rounding up matters: a thousand "free" calls is how a budget leaks.
    expect(costCents("gpt-4o-mini", 1000, 500)).toBe(1);
  });

  it("charges an UNKNOWN model at the dearest rate it knows", () => {
    // Switching to a pricier model must not silently blow the budget.
    const unknown = costCents("some-new-model", 1_000_000, 1_000_000);
    const dearest = Math.max(...["gpt-4o", "gpt-4.1", "o4-mini", "gpt-4o-mini"].map((m) => costCents(m, 1_000_000, 1_000_000)));
    expect(unknown).toBe(dearest);
  });

  it("charges output more than input, as providers do", () => {
    const { inputCents, outputCents } = priceFor("gpt-4o-mini");
    expect(outputCents).toBeGreaterThan(inputCents);
  });

  it("is zero only for a call that used nothing", () => {
    expect(costCents("gpt-4o-mini", 0, 0)).toBe(0);
  });
});

describe("month and day keys", () => {
  it("uses UTC, so a budget cannot shift under a timezone", () => {
    expect(monthKey(new Date("2026-11-30T23:30:00Z"))).toBe("2026-11");
    expect(dayKey(new Date("2026-11-30T23:30:00Z"))).toBe("2026-11-30");
    expect(monthKey(new Date("2026-12-01T00:30:00Z"))).toBe("2026-12");
  });
});

describe("checkBudget", () => {
  it("allows a call well inside the budget", async () => {
    spent(500);
    const verdict = await checkBudget("coach-1");
    expect(verdict.allowed).toBe(true);
  });

  it("STOPS when the month's budget is gone, and says so without mentioning money", async () => {
    spent(MONTHLY_BUDGET_CENTS);
    const verdict = await checkBudget("coach-1");
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toContain("reached its limit for this month");
    // A coach must not be shown the owner's spend, nor blamed for other coaches' usage.
    expect(verdict.reason).not.toMatch(/\$|cent|budget of/i);
    expect(verdict.reason).toContain("Everything else in Repsy works as normal");
  });

  it("stops a single coach who has had a lot today, without stopping everyone", async () => {
    prisma.aiUsage.findFirst.mockResolvedValue({ calls: DAILY_CALLS_PER_COACH });
    const verdict = await checkBudget("coach-loop");
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toContain("available again tomorrow");
  });

  it("counts the WHOLE month across every coach, not just this one", async () => {
    await checkBudget("coach-1");
    // The budget is the owner's, so the aggregate must not be scoped to a coach.
    expect(prisma.aiUsage.aggregate.mock.calls[0][0].where).toEqual({ month: monthKey() });
  });

  it("FAILS OPEN when the ledger cannot be read, because max_tokens still applies", async () => {
    // Refusing every coach because a counter is unreadable is the worse failure.
    prisma.aiUsage.aggregate.mockRejectedValue(new Error("connection terminated"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const verdict = await checkBudget("coach-1");
    expect(verdict.allowed).toBe(true);
    expect(spy.mock.calls[0][0]).toContain("max_tokens still applies");
    spy.mockRestore();
  });

  it("recognises its own stop messages, so a limit is never reported as 'try again'", async () => {
    spent(MONTHLY_BUDGET_CENTS);
    const monthly = await checkBudget("coach-1");
    expect(isBudgetStop(monthly.reason!)).toBe(true);

    prisma.aiUsage.findFirst.mockResolvedValue({ calls: DAILY_CALLS_PER_COACH });
    const daily = await checkBudget("coach-1");
    expect(isBudgetStop(daily.reason!)).toBe(true);

    expect(isBudgetStop("provider replied HTTP 500")).toBe(false);
  });
});

describe("recordUsage", () => {
  it("adds to the coach's day and stamps the month", async () => {
    await recordUsage("coach-1", "gpt-4o-mini", 1000, 500, new Date("2026-11-15T10:00:00Z"));
    const call = prisma.aiUsage.upsert.mock.calls[0][0];
    expect(call.where).toEqual({ coachId_day: { coachId: "coach-1", day: "2026-11-15" } });
    expect(call.create).toMatchObject({ month: "2026-11", calls: 1, inputTokens: 1000, outputTokens: 500 });
    expect(call.update.calls).toEqual({ increment: 1 });
  });

  it("NEVER throws: a ledger write must not lose the coach's answer", async () => {
    prisma.aiUsage.upsert.mockRejectedValue(new Error("deadlock detected"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(recordUsage("coach-1", "gpt-4o-mini", 10, 10)).resolves.toBeUndefined();
    spy.mockRestore();
  });
});

describe("what the owner sees", () => {
  beforeEach(() => {
    prisma.aiUsage.aggregate.mockResolvedValue({
      _sum: { calls: 42, inputTokens: 50_000, outputTokens: 20_000, costCents: 1700 },
    });
  });

  it("reports the month against the budget", async () => {
    const summary = await usageSummary(new Date("2026-11-15T00:00:00Z"));
    expect(summary).toMatchObject({ month: "2026-11", calls: 42, spentCents: 1700, budgetCents: 2000, percentUsed: 85 });
  });

  it("warns at 80 per cent, with the real numbers", async () => {
    const message = await budgetWarning(new Date("2026-11-15T00:00:00Z"));
    expect(message).toContain("$17.00");
    expect(message).toContain("$20.00");
    expect(message).toContain("will stop itself");
  });

  it("says plainly when it has stopped, and that nothing else is affected", async () => {
    prisma.aiUsage.aggregate.mockResolvedValue({ _sum: { calls: 60, costCents: 2100, inputTokens: 1, outputTokens: 1 } });
    const message = await budgetWarning();
    expect(message).toContain("has stopped");
    expect(message).toContain("Everything else in Repsy is unaffected");
  });

  it("stays quiet below 80 per cent, so the warning still means something", async () => {
    prisma.aiUsage.aggregate.mockResolvedValue({ _sum: { calls: 5, costCents: 400, inputTokens: 1, outputTokens: 1 } });
    expect(await budgetWarning()).toBeNull();
  });

  it("never divides by a zero budget", async () => {
    const summary = await usageSummary();
    expect(Number.isFinite(summary.percentUsed)).toBe(true);
  });
});
