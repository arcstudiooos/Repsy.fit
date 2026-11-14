// Grouping assignments into weeks and days for the calendar view (Inspo W11/N9, Nov 2026).
//
// No new data: assignments already carry a "YYYY-MM-DD" date, so the grid is a VIEW over what is
// there. Kept free of React so it can be unit-tested directly.
//
// Weeks start on MONDAY, because that is how a training week is written and how the rest of Repsy
// already reports (the weekly summary runs Monday to Sunday).
const dayMs = 86_400_000;

const toMs = (day: string) => new Date(`${day}T00:00:00.000Z`).getTime();
const toDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** True for a real calendar day in "YYYY-MM-DD" form. */
export function isDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const ms = toMs(value);
  return Number.isFinite(ms) && toDay(ms) === value;
}

/** The Monday of the week `day` falls in. */
export function weekStart(day: string): string {
  const ms = toMs(day);
  // getUTCDay(): 0 = Sunday, so Sunday is 6 days after its Monday.
  const weekday = new Date(ms).getUTCDay();
  return toDay(ms - ((weekday + 6) % 7) * dayMs);
}

export const addDays = (day: string, days: number) => toDay(toMs(day) + days * dayMs);

/** The seven days of the week starting at `monday`. */
export const weekDays = (monday: string) => Array.from({ length: 7 }, (_, i) => addDays(monday, i));

export type Dated = { date: string };

export type WeekRow<T extends Dated> = {
  /** Monday of this week, "YYYY-MM-DD". */
  monday: string;
  /** Seven entries, Monday first. Each holds the items on that day, in the order given. */
  days: { date: string; items: T[] }[];
  /** How many items fall in this week. */
  count: number;
};

/**
 * Groups dated items into week rows, newest week first.
 *
 * Only weeks that contain something are returned, plus - when `includeWeek` is given - the week that
 * day falls in, so "this week" is always on screen even when nothing is assigned yet. Items with a
 * junk date are dropped rather than crashing the grid.
 */
export function groupByWeek<T extends Dated>(items: readonly T[], includeWeek?: string): WeekRow<T>[] {
  const byDay = new Map<string, T[]>();
  for (const item of items) {
    if (!isDay(item.date)) continue;
    const list = byDay.get(item.date);
    if (list) list.push(item);
    else byDay.set(item.date, [item]);
  }

  const mondays = new Set([...byDay.keys()].map(weekStart));
  if (includeWeek && isDay(includeWeek)) mondays.add(weekStart(includeWeek));

  return [...mondays]
    .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0)) // newest week first
    .map((monday) => {
      const days = weekDays(monday).map((date) => ({ date, items: byDay.get(date) ?? [] }));
      return { monday, days, count: days.reduce((n, d) => n + d.items.length, 0) };
    });
}

/** "11 - 17 Nov" or "28 Oct - 3 Nov" when the week straddles two months. */
export function weekLabel(monday: string): string {
  const end = addDays(monday, 6);
  const month = (day: string) => new Date(toMs(day)).toLocaleString("en-GB", { month: "short", timeZone: "UTC" });
  const dayNo = (day: string) => new Date(toMs(day)).getUTCDate();
  return month(monday) === month(end)
    ? `${dayNo(monday)} - ${dayNo(end)} ${month(end)}`
    : `${dayNo(monday)} ${month(monday)} - ${dayNo(end)} ${month(end)}`;
}

/** "Mon", "Tue"... for a column heading. */
export const weekdayLabel = (day: string) =>
  new Date(toMs(day)).toLocaleString("en-GB", { weekday: "short", timeZone: "UTC" });
