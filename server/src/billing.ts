// Plans and payments (Prompt 68): the due-date rules in one pure, tested place.
// RECORD-KEEPING ONLY - nothing in the app charges, links to a gateway, or sends reminders.

export const CURRENCIES = ["INR", "USD"] as const;
export type Currency = (typeof CURRENCIES)[number];
export const BILLING_CYCLES = ["Monthly", "Quarterly", "Yearly", "One-time"] as const;
export type BillingCycle = (typeof BILLING_CYCLES)[number];
export const PLAN_STATUSES = ["Active", "Paused", "Ended"] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];
export const PAYMENT_METHODS = ["Cash", "UPI", "Card", "Bank", "Other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** Months one payment covers. One-time plans never advance. */
export const CYCLE_MONTHS: Record<BillingCycle, number> = { Monthly: 1, Quarterly: 3, Yearly: 12, "One-time": 0 };

const daysInMonth = (year: number, month0: number) => new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
const pad = (n: number) => String(n).padStart(2, "0");

/**
 * The due date after `nextDueDate` for one more billing cycle. Months are calendar months, and the
 * day returns to `anchorDay` (the plan's stored due day) whenever that month has it, so a plan due on
 * the 31st goes Jan 31 -> Feb 28 (29 in a leap year) -> Mar 31, never drifting to the 28th.
 * One-time plans return the same date (they do not advance).
 */
export function advanceDueDate(nextDueDate: string, cycle: BillingCycle, anchorDay: number): string {
  const months = CYCLE_MONTHS[cycle];
  if (months === 0) return nextDueDate;
  const [y, m] = nextDueDate.split("-").map(Number);
  const total = m - 1 + months;
  const year = y + Math.floor(total / 12);
  const month0 = total % 12;
  const day = Math.min(anchorDay, daysInMonth(year, month0));
  return `${year}-${pad(month0 + 1)}-${pad(day)}`;
}

/** The day of the month of a YYYY-MM-DD date: what a plan's `anchorDay` is set from. */
export const dayOf = (date: string): number => Number(date.slice(8, 10));

/** Whole days from `today` to `due` (negative = overdue). Both YYYY-MM-DD. */
export function daysUntil(due: string, today: string): number {
  return Math.round((Date.parse(`${due}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}
