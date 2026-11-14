// A client's snapshot: the numbers a coach wants before reading anything (Inspo C4/C5, Nov 2026).
//
// Spur.fit puts "Latest Weight / Adherence / Last workout assigned" above the client and a
// Statistics block beside it. This is the same idea, computed in one request.
//
// The streak is the only judgement call here, so it is defined once, in the open:
//
//   A DAY COUNTS when the client did something we can see: finished an assignment, filled in a
//   daily check-in, or logged progress. A streak is the run of counting days ending today or
//   yesterday. Yesterday is allowed on purpose - a coach looking at 9am should not see a client's
//   three-week streak reported as zero just because the day is young. Any older run has ended, and
//   reads 0.
/** Pulled out so the route can stay about queries and this can be tested on its own. */
export type SnapshotInput = {
  /** "YYYY-MM-DD" days on which the client did something. Duplicates and order do not matter. */
  activeDays: string[];
  /** Today, as the client's own date ("YYYY-MM-DD"), so a streak is judged in their timezone. */
  today: string;
};

const dayMs = 86_400_000;
const toDay = (iso: string) => new Date(`${iso}T00:00:00.000Z`).getTime();
const fromDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * True for a real calendar day in "YYYY-MM-DD" form.
 *
 * The NaN guard is not decoration: `new Date(NaN).toISOString()` THROWS a RangeError, so without it
 * a single junk date in the data would turn this whole endpoint into a 500.
 */
export const isDay = (v: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const ms = toDay(v);
  return Number.isFinite(ms) && fromDay(ms) === v;
};

/**
 * The current streak in days, per the rule above. Returns 0 when the most recent active day is
 * older than yesterday.
 */
export function currentStreak({ activeDays, today }: SnapshotInput): number {
  const days = new Set(activeDays.filter(isDay));
  if (!days.size || !isDay(today)) return 0;
  const t = toDay(today);

  // Start at today if it counts, else yesterday if it counts, else the streak is over.
  let cursor = days.has(today) ? t : days.has(fromDay(t - dayMs)) ? t - dayMs : null;
  if (cursor === null) return 0;

  let streak = 0;
  while (days.has(fromDay(cursor))) {
    streak += 1;
    cursor -= dayMs;
  }
  return streak;
}

/** The longest run of counting days ever, for a bit of encouragement next to the current one. */
export function longestStreak(activeDays: string[]): number {
  const days = [...new Set(activeDays.filter(isDay))].sort();
  let best = 0;
  let run = 0;
  let previous: number | null = null;
  for (const day of days) {
    const d = toDay(day);
    run = previous !== null && d - previous === dayMs ? run + 1 : 1;
    best = Math.max(best, run);
    previous = d;
  }
  return best;
}

/**
 * The client's local "today": the X-Client-Date header when it is a real date within a day of UTC
 * today, else UTC today.
 *
 * This lives HERE, in a module with no imports of its own, on purpose. It was briefly imported from
 * routes/clientTracking.ts instead, which created the cycle
 *   routes/clients.ts -> routes/clientTracking.ts -> routes/measurements.ts -> routes/clients.ts
 * and left `asyncHandler` undefined at module-eval time, breaking 88 test files at once. A helper
 * two routers share belongs in a leaf, never in one of the routers.
 */
export function clientToday(req: { get(name: string): string | undefined }, now = new Date()): string {
  const utcToday = now.toISOString().slice(0, 10);
  const header = req.get("x-client-date");
  const shift = (days: number) => fromDay(toDay(utcToday) + days * dayMs);
  if (typeof header === "string" && isDay(header) && header >= shift(-1) && header <= shift(1)) return header;
  return utcToday;
}
