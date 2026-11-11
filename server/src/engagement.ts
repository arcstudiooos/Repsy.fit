// Streaks and leaderboard (Prompt 71) - see "Engagement" in CLAUDE.md.
// Three plain numbers per client, all from the same records and rules for every client (demo data
// counts exactly like real entries):
//   - check-in streak: consecutive days with a DailyCheckIn, via `habitStreaks` (Prompt 54, not copied)
//   - habit %: done ticks in the last 7 days / (active habits x 7)
// Every date here is a "YYYY-MM-DD" string (DailyCheckIn, HabitLog and Assignment all store days,
// not instants), so the viewer's local date in `?date=` is all the timezone handling needed: do NOT
// add the tz/tzEnd offsets that appointments need.
//   - workouts done this week: Workout assignments marked Done, dated Monday-Sunday of this week
// The coach's ranking is those numbers, in that order: no points, no hidden score.
import { prisma } from "./db.js";
import { GRID_DAYS, addDays, habitStreaks, lastDays } from "./habits.js";

export interface EngagementInput {
  clientId: string;
  clientName: string;
  checkInDates: string[];
  /** ACTIVE habits only, each with its done dates. */
  habits: { doneDates: string[] }[];
  /** Dates of Workout assignments marked Done. */
  workoutDates: string[];
}

export interface Engagement {
  checkInStreak: number;
  /**
   * Done ticks in the last 7 days / (active habits x 7). The denominator is always the full 7 days,
   * so a habit added today starts low and climbs: the same rule for every client, including demo
   * data. `null` when the client has no active habits.
   */
  habitPercent: number | null;
  workoutsThisWeek: number;
  /**
   * false = nothing logged yet (no check-in EVER and no habit tick in the last 7 days): shown as
   * "Not enough data yet". One old check-in therefore still ranks (with streak 0), because the
   * client has a history; a brand-new client has none.
   */
  enoughData: boolean;
}

export interface EngagementRow extends Engagement {
  clientId: string;
  clientName: string;
}
export interface RankedEngagement extends EngagementRow {
  /** 1-based; clients with equal numbers share a rank; null when there is not enough data. */
  rank: number | null;
}

/** Monday and Sunday ("YYYY-MM-DD") of the week containing `date`. */
export function weekBounds(date: string): { from: string; to: string } {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  const from = addDays(date, -((weekday + 6) % 7));
  return { from, to: addDays(from, 6) };
}

export function engagementFor(input: EngagementInput, today: string): Engagement {
  const days = new Set(lastDays(today, GRID_DAYS));
  const ticks = input.habits.reduce((sum, h) => sum + new Set(h.doneDates.filter((d) => days.has(d))).size, 0);
  const week = weekBounds(today);
  return {
    checkInStreak: habitStreaks(input.checkInDates, today).current,
    habitPercent: input.habits.length === 0 ? null : Math.round((ticks / (input.habits.length * GRID_DAYS)) * 100),
    workoutsThisWeek: input.workoutDates.filter((d) => d >= week.from && d <= week.to).length,
    enoughData: input.checkInDates.length > 0 || ticks > 0,
  };
}

/** Streak (high first), then habit % (high first, none last), then name. Ties share a rank. */
export function rankEngagement(rows: EngagementRow[]): RankedEngagement[] {
  const ranked = rows
    .filter((r) => r.enoughData)
    .sort(
      (a, b) =>
        b.checkInStreak - a.checkInStreak ||
        (b.habitPercent ?? -1) - (a.habitPercent ?? -1) ||
        a.clientName.localeCompare(b.clientName) ||
        a.clientId.localeCompare(b.clientId),
    );
  // Standard competition ranking (1, 1, 3): a tied row repeats the rank before it, and the next
  // different row skips to its own position. Built in one pass, so `rank` is never 0.
  const out: RankedEngagement[] = [];
  ranked.forEach((r, i) => {
    const prev = ranked[i - 1];
    const tied = prev && prev.checkInStreak === r.checkInStreak && prev.habitPercent === r.habitPercent;
    out.push({ ...r, rank: tied ? (out[i - 1].rank as number) : i + 1 });
  });
  const unranked = rows
    .filter((r) => !r.enoughData)
    .sort((a, b) => a.clientName.localeCompare(b.clientName) || a.clientId.localeCompare(b.clientId))
    .map((r) => ({ ...r, rank: null }));
  return [...out, ...unranked];
}

/** Loads the records for a whole coach roster (`{ coachId }`) or one client (`{ clientId }`). */
export async function loadEngagement(scope: { coachId: string } | { clientId: string }, today: string): Promise<EngagementRow[]> {
  const where = "coachId" in scope ? { coachId: scope.coachId } : { clientId: scope.clientId };
  const week = weekBounds(today);
  const habitFrom = addDays(today, -(GRID_DAYS - 1));
  const clients = await prisma.client.findMany({
    where: "coachId" in scope ? { coachId: scope.coachId } : { id: scope.clientId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, name: true },
  });
  const [checkIns, habits, workouts] = await Promise.all([
    prisma.dailyCheckIn.findMany({ where: { ...where, date: { lte: today } }, select: { clientId: true, date: true } }),
    prisma.habit.findMany({
      where: { ...where, active: true },
      select: { clientId: true, logs: { where: { done: true, date: { gte: habitFrom, lte: today } }, select: { date: true } } },
    }),
    prisma.assignment.findMany({
      where: { ...where, type: "Workout", status: "Done", date: { gte: week.from, lte: week.to } },
      select: { clientId: true, date: true },
    }),
  ]);
  // Group each list by client once: four queries and one pass, whatever the roster size.
  const by = <T, V>(rows: T[], clientOf: (row: T) => string, valueOf: (row: T) => V) => {
    const map = new Map<string, V[]>();
    for (const row of rows) {
      const key = clientOf(row);
      const list = map.get(key);
      if (list) list.push(valueOf(row));
      else map.set(key, [valueOf(row)]);
    }
    return map;
  };
  const checkInsBy = by(checkIns, (x) => x.clientId, (x) => x.date);
  const habitsBy = by(habits, (h) => h.clientId, (h) => ({ doneDates: h.logs.map((l) => l.date) }));
  const workoutsBy = by(workouts, (w) => w.clientId, (w) => w.date);
  return clients.map((c) => ({
    clientId: c.id,
    clientName: c.name,
    ...engagementFor(
      {
        clientId: c.id,
        clientName: c.name,
        checkInDates: checkInsBy.get(c.id) ?? [],
        habits: habitsBy.get(c.id) ?? [],
        workoutDates: workoutsBy.get(c.id) ?? [],
      },
      today,
    ),
  }));
}
