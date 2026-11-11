// Sleep & recovery rules (Prompt 55). Every value is typed in by hand (no wearable); rules only.

/** A 7-day average below this many hours gets the plain rule line. */
export const SLEEP_LOW_HOURS = 6;
/** "This week" = the last 7 days, ending today. */
export const SLEEP_WINDOW_DAYS = 7;

export const SLEEP_LOW_TEXT = "Sleep under 6h average this week";

export type SleepNight = { date: string; sleepHours: number | null };

const DAY_MS = 24 * 60 * 60 * 1000;
const dayNumber = (date: string) => Math.round(new Date(`${date}T00:00:00.000Z`).getTime() / DAY_MS);

/** Average of the nights logged in the 7 days up to `today` (one decimal); null when none. */
export function sleepWeek(rows: SleepNight[], today: string): { average: number | null; nights: number } {
  const hours = rows
    .filter((r) => r.sleepHours !== null)
    .filter((r) => {
      const age = dayNumber(today) - dayNumber(r.date);
      return age >= 0 && age < SLEEP_WINDOW_DAYS;
    })
    .map((r) => r.sleepHours as number);
  if (hours.length === 0) return { average: null, nights: 0 };
  const average = hours.reduce((sum, h) => sum + h, 0) / hours.length;
  return { average: Math.round(average * 10) / 10, nights: hours.length };
}

export const isLowSleep = (average: number | null) => average !== null && average < SLEEP_LOW_HOURS;
