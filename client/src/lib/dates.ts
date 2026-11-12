// Display-only date formatting for the coach app. Values sent to the server and date inputs stay
// "YYYY-MM-DD" / ISO; these helpers only change what the coach reads.

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** A "YYYY-MM-DD" day (read as a LOCAL day) or an ISO timestamp, as a local Date. */
function toLocalDate(value: string): Date {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
}

/** "Thu, 12 Nov" (the year is added only when it isn't the current year: "Mon, 3 Nov 2025"). */
export function formatDay(value: string, now: Date = new Date()): string {
  const d = toLocalDate(value);
  if (Number.isNaN(d.getTime())) return value;
  // Built by hand so it reads the same in every browser and locale (Intl's "en-GB" drops the comma
  // in Chrome and writes "Sept").
  const text = `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return d.getFullYear() !== now.getFullYear() ? `${text} ${d.getFullYear()}` : text;
}

/** "29 Oct" - short day + month for chart ticks. */
export function formatShortDay(value: string): string {
  const d = toLocalDate(value);
  if (Number.isNaN(d.getTime())) return value;
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** "just now", "5 min ago", "3 h ago", "yesterday", "3 days ago", then the day ("Thu, 12 Nov"). */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const mins = Math.floor((now.getTime() - d.getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  return daysAgo(iso, now) ?? formatDay(iso, now);
}

/** Calendar days between a local day / timestamp and today: "today", "yesterday", "3 days ago"; null past 30 days. */
export function daysAgo(value: string, now: Date = new Date()): string | null {
  const d = toLocalDate(value);
  if (Number.isNaN(d.getTime())) return null;
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(d)) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days <= 30) return `${days} days ago`;
  return null;
}
