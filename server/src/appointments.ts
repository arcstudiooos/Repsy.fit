// Appointments (Prompt 69): shared constants and the one place that turns a viewer's local day into UTC.
export const APPOINTMENT_TYPES = ["Session", "Call", "Check-in review", "Other"] as const;
export const APPOINTMENT_STATUSES = ["Booked", "Done", "Cancelled", "No-show"] as const;
export type AppointmentType = (typeof APPOINTMENT_TYPES)[number];
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

/** Longest appointment: one day. Stops a typo from booking a block that covers the whole week. */
const DAY_MS = 24 * 60 * 60 * 1000;
export const MAX_APPOINTMENT_MS = DAY_MS;

/**
 * The viewer's local calendar day `date` ("YYYY-MM-DD") as a UTC range [from, to).
 * `tzOffsetMinutes` is JavaScript's `Date.getTimezoneOffset()` at that day's local midnight: UTC minus
 * local time, in minutes (India, UTC+5:30, is -330; US Pacific in winter, UTC-8, is 480). 0 = UTC.
 * `tzEndOffsetMinutes` is the offset at the NEXT local midnight. They differ only on a daylight-saving
 * change day, which is 23 or 25 hours long; passing both keeps that day's range exact.
 */
export function localDayRange(date: string, tzOffsetMinutes: number, tzEndOffsetMinutes = tzOffsetMinutes): [Date, Date] {
  const midnightUtc = new Date(`${date}T00:00:00.000Z`).getTime();
  return [new Date(midnightUtc + tzOffsetMinutes * 60_000), new Date(midnightUtc + DAY_MS + tzEndOffsetMinutes * 60_000)];
}
