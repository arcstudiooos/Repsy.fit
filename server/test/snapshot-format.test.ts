// Formatting for the client snapshot cards (Inspo C4/C5, Nov 2026).
//
// These live in client/src/lib/snapshotFormat.ts and are tested from here because the e2e fixture
// pins /api/auth/me to a single mock coach, so a browser test cannot change the coach's units.
// Same arrangement as the workout round-trip importing clientApp/planLines.ts.
import { describe, expect, it } from "vitest";
import { agoLabel, daysBetween, shortDay, showWeight } from "../../client/src/lib/snapshotFormat.js";

describe("showWeight", () => {
  it("shows kg as stored", () => {
    expect(showWeight(67.4, "kg")).toBe("67.4 kg");
    expect(showWeight(70, "kg")).toBe("70 kg");
  });

  it("converts to pounds for a coach who reads pounds", () => {
    // 67.4 kg = 148.59... lb
    expect(showWeight(67.4, "lb")).toBe("148.6 lb");
    expect(showWeight(100, "lb")).toBe("220.5 lb");
  });

  it("rounds to one decimal, so a card never shows 148.59237", () => {
    expect(showWeight(67.44999, "kg")).toBe("67.4 kg");
    expect(showWeight(67.45001, "kg")).toBe("67.5 kg");
  });

  it("shows a dash when there is no weight, never 0", () => {
    expect(showWeight(null, "kg")).toBe("-");
    expect(showWeight(null, "lb")).toBe("-");
  });

  it("handles a zero weight without pretending it is missing", () => {
    expect(showWeight(0, "kg")).toBe("0 kg");
  });
});

describe("shortDay", () => {
  it("formats a day the way a glance wants it", () => {
    expect(shortDay("2026-11-15")).toBe("15 Nov");
    expect(shortDay("2026-01-01")).toBe("1 Jan");
  });

  it("is empty for nothing or junk, rather than 'Invalid Date'", () => {
    expect(shortDay(null)).toBe("");
    expect(shortDay("")).toBe("");
    expect(shortDay("not-a-date")).toBe("");
  });
});

describe("daysBetween", () => {
  it("counts whole days", () => {
    expect(daysBetween("2026-11-10", "2026-11-15")).toBe(5);
    expect(daysBetween("2026-11-15", "2026-11-15")).toBe(0);
  });

  it("counts across months and years", () => {
    expect(daysBetween("2026-11-30", "2026-12-01")).toBe(1);
    expect(daysBetween("2026-12-31", "2027-01-01")).toBe(1);
  });

  it("is negative for a day in the future", () => {
    expect(daysBetween("2026-11-20", "2026-11-15")).toBe(-5);
  });

  it("is null for missing or junk input", () => {
    expect(daysBetween(null, "2026-11-15")).toBeNull();
    expect(daysBetween("2026-11-15", null)).toBeNull();
    expect(daysBetween("oops", "2026-11-15")).toBeNull();
  });
});

describe("agoLabel", () => {
  const today = "2026-11-15";

  it("says today, yesterday, or how many days", () => {
    expect(agoLabel("2026-11-15", today)).toBe("today");
    expect(agoLabel("2026-11-14", today)).toBe("yesterday");
    expect(agoLabel("2026-11-10", today)).toBe("5 days ago");
  });

  it("says 'none yet' rather than inventing a date", () => {
    expect(agoLabel(null, today)).toBe("none yet");
  });

  it("treats a future date as today, so a clock skew never reads '-2 days ago'", () => {
    expect(agoLabel("2026-11-20", today)).toBe("today");
  });
});
