// Formatting for the client snapshot cards (Inspo C4/C5, Nov 2026).
//
// Kept free of React so it can be unit-tested directly (server/test/snapshot-format.test.ts imports
// it, the same way the workout round-trip imports clientApp/planLines.ts). The e2e fixture pins
// /api/auth/me to one mock coach, so unit conversion cannot be driven from a browser test.
const KG_PER_LB = 0.45359237;

/** Stored weights are always kg; a coach reads them in their own unit. */
export const showWeight = (kg: number | null, units: "kg" | "lb") =>
  kg === null ? "-" : `${weightIn(kg, units)} ${units}`;

/**
 * A stored kg value as the NUMBER a coach should see, to one decimal. No unit word, so it can go in
 * an input box as well as in a sentence.
 */
export const weightIn = (kg: number, units: "kg" | "lb") =>
  Math.round((units === "lb" ? kg / KG_PER_LB : kg) * 10) / 10;

/**
 * What a coach TYPED, converted to the kg the database stores.
 *
 * The counterpart of `weightIn`, and the half that was missing: every weight INPUT was labelled
 * "kg" while the rest of the app displayed the coach's own unit, so a coach working in pounds typed
 * 150 meaning pounds and 150 KILOS was stored. Kept to 3 decimals of kg: enough that a value
 * round-trips back to the same tenth of a pound, without inventing precision.
 */
export const weightToKg = (value: number, units: "kg" | "lb") =>
  units === "lb" ? Math.round(value * KG_PER_LB * 1000) / 1000 : value;

/** A signed change in the coach's unit: "-1.2 kg overall" / "+3.3 lb overall". */
export function showWeightChange(changeKg: number, units: "kg" | "lb"): string {
  const sign = changeKg > 0 ? "+" : changeKg < 0 ? "-" : "";
  return `${sign}${weightIn(Math.abs(changeKg), units).toFixed(1)} ${units} overall`;
}

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
