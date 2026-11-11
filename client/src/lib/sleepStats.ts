// Sleep & recovery numbers for the Check-ins tab (Prompt 55). Every value is typed in by hand.
// Same rule as the server (`server/src/sleep.ts`): the week is the last 7 days ending today.
import type { DailyCheckIn } from "../types";

export const SLEEP_LOW_HOURS = 6;
export const SLEEP_CHART_DAYS = 14;
const WEEK_DAYS = 7;

export type SleepPoint = { date: string; label: string; sleepHours: number | null; recoveryScore: number | null };

const DAY_MS = 24 * 60 * 60 * 1000;
const dayNumber = (date: string) => Math.round(new Date(`${date}T00:00:00.000Z`).getTime() / DAY_MS);
const dateOf = (n: number) => new Date(n * DAY_MS).toISOString().slice(0, 10);
const average = (values: number[]) =>
  values.length === 0 ? null : Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;

/** One point per day for the 14 days ending `today`, oldest first; days with no check-in are empty. */
export function sleepSeries(checkIns: DailyCheckIn[], today: string): SleepPoint[] {
  const byDate = new Map(checkIns.map((c) => [c.date, c]));
  const end = dayNumber(today);
  return Array.from({ length: SLEEP_CHART_DAYS }, (_, i) => {
    const date = dateOf(end - (SLEEP_CHART_DAYS - 1) + i);
    const c = byDate.get(date);
    return { date, label: date.slice(5), sleepHours: c?.sleepHours ?? null, recoveryScore: c?.recoveryScore ?? null };
  });
}

/** 7-day averages (one decimal) over the days that have a value, and the plain rule line when it applies. */
export function sleepSummary(series: SleepPoint[]) {
  const week = series.slice(-WEEK_DAYS);
  const hours = week.flatMap((p) => (p.sleepHours === null ? [] : [p.sleepHours]));
  const scores = week.flatMap((p) => (p.recoveryScore === null ? [] : [p.recoveryScore]));
  const sleepAverage = average(hours);
  return {
    sleepAverage,
    sleepNights: hours.length,
    recoveryAverage: average(scores),
    recoveryDays: scores.length,
    ruleLine: sleepAverage !== null && sleepAverage < SLEEP_LOW_HOURS ? "Averaged under 6 hours this week" : null,
  };
}
