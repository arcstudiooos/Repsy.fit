// How a client's goal date reads (Inspo C5, Nov 2026).
//
// Pure formatting in client/src/lib so it can be unit-tested from the server suite - the e2e fixture
// cannot easily vary "today", and a countdown that is wrong by a day is worse than no countdown.
const DAY_MS = 86_400_000;

/** Whole days from `today` to `date`, both "YYYY-MM-DD". Negative = in the past. */
export function daysUntil(date: string, today: string): number | null {
  const a = Date.parse(`${date}T00:00:00Z`);
  const b = Date.parse(`${today}T00:00:00Z`);
  // A junk date must not render "NaN days to go".
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((a - b) / DAY_MS);
}

/**
 * The countdown as a coach would say it, or null when there is nothing to say.
 *
 * "today" and "tomorrow" rather than "0 days" and "1 day", because that is how people speak, and a
 * date that has passed says so plainly instead of counting negatives.
 */
export function countdownLabel(date: string | null, today: string): string | null {
  if (!date) return null;
  const days = daysUntil(date, today);
  if (days === null) return null;
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  if (days < 0) return `${Math.abs(days)} days ago`;
  if (days < 14) return `in ${days} days`;
  if (days < 60) {
    const weeks = Math.round(days / 7);
    return `in about ${weeks} weeks`;
  }
  const months = Math.round(days / 30);
  return `in about ${months} months`;
}

/** "Wedding in about 8 weeks" / "in 3 days" / null. What the card actually prints. */
export function goalLine(date: string | null, event: string, today: string): string | null {
  const when = countdownLabel(date, today);
  const what = event.trim();
  if (!when && !what) return null;
  // The words alone are still worth showing: a goal with no date is a goal.
  if (!when) return what;
  return what ? `${what} ${when}` : when;
}
