// Formatting for the client snapshot cards (Inspo C4/C5, Nov 2026).
//
// Kept free of React so it can be unit-tested directly (server/test/snapshot-format.test.ts imports
// it, the same way the workout round-trip imports clientApp/planLines.ts). The e2e fixture pins
// /api/auth/me to one mock coach, so unit conversion cannot be driven from a browser test.
const KG_PER_LB = 0.45359237;

/** Stored weights are always kg; a coach reads them in their own unit. */
export const showWeight = (kg: number | null, units: "kg" | "lb") =>
  kg === null ? "-" : `${Math.round((units === "lb" ? kg / KG_PER_LB : kg) * 10) / 10} ${units}`;

/** "15 Nov" - short, because these cards are a glance not a report. Empty string for no date. */
export function shortDay(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getUTCDate()} ${d.toLocaleString("en-GB", { month: "short", timeZone: "UTC" })}`;
}

/** Whole days from `from` to `to`, or null when either is missing or junk. */
export function daysBetween(from: string | null, to: string | null): number | null {
  if (!from || !to) return null;
  const a = new Date(`${from}T00:00:00.000Z`).getTime();
  const b = new Date(`${to}T00:00:00.000Z`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86_400_000);
}

/** "today" / "yesterday" / "5 days ago" / "none yet" for the last-workout card. */
export function agoLabel(on: string | null, today: string): string {
  const days = daysBetween(on, today);
  if (days === null) return "none yet";
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}
