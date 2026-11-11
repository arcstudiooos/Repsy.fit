// Schedule helpers (Prompt 69). Appointment times are stored and sent as UTC instants (ISO strings);
// everything the coach or client reads, and every day boundary of the week view, is the VIEWER's
// local timezone. These are the only places that convert between the two.

const pad = (n: number) => String(n).padStart(2, "0");

/** "YYYY-MM-DD" of a local calendar day. */
export const localDateKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Local midnight of the Monday of the week containing `d`. */
export function weekStartOf(d: Date): Date {
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return start;
}

/** Local midnight `days` days after `d` (DST-safe: moves the calendar date, not 24 h blocks). */
export function addDays(d: Date, days: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
}

/** The 7 local days of the week starting `start`. */
export const weekDays = (start: Date): Date[] => Array.from({ length: 7 }, (_, i) => addDays(start, i));

/** The UTC range (ISO strings) covering the local week starting `start`: [from, to). */
export const weekRangeUtc = (start: Date): { from: string; to: string } => ({
  from: start.toISOString(),
  to: addDays(start, 7).toISOString(),
});

/** UTC ISO string -> the value of an <input type="datetime-local"> in the viewer's timezone. */
export function toLocalInput(iso: string): string {
  const d = new Date(iso);
  return `${localDateKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** An <input type="datetime-local"> value (viewer's local time) -> UTC ISO string; "" or junk -> null. */
export function fromLocalInput(value: string): string | null {
  const d = new Date(value);
  return value && !Number.isNaN(d.getTime()) ? d.toISOString() : null;
}

/** "9:30 AM" in the viewer's locale and timezone. */
export const timeText = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

/** "9:30 AM - 10:30 AM". */
export const timeRangeText = (startsAt: string, endsAt: string) => `${timeText(startsAt)} - ${timeText(endsAt)}`;

/** "Thu, Nov 12" for a local day. */
export const dayHeading = (d: Date) => d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });

/** The viewer's timezone name for the "times shown in" note, e.g. "Asia/Kolkata". */
export const viewerTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "your local time";
