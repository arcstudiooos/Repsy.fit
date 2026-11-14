// Habit recurrence and the preset library (Inspo C3, Nov 2026).
//
// Recurrence is the risky half of this feature, because it changes `habitStreaks` - a function that
// already had twelve tests and real data behind it. The rule that makes it safe: a full list of
// seven days must behave EXACTLY as before, since that is what every pre-existing habit means.
import { describe, expect, it } from "vitest";
import {
  EVERY_DAY,
  WEEKDAY_LABELS,
  habitStreaks,
  isScheduled,
  recurrenceLabel,
  weekdayOf,
} from "../src/habits.js";
import { HABIT_CATEGORIES, HABIT_PRESETS } from "../src/habitPresets.js";

// A known week: 2026-11-15 is a Sunday, so 16th is Monday ... 21st Saturday.
const SUN = "2026-11-15";
const MON = "2026-11-16";
const TUE = "2026-11-17";
const WED = "2026-11-18";
const THU = "2026-11-19";
const FRI = "2026-11-20";
const SAT = "2026-11-21";
const MWF = [1, 3, 5];

describe("weekdayOf", () => {
  it("reads the weekday the way Date.getUTCDay does", () => {
    expect([SUN, MON, TUE, WED, THU, FRI, SAT].map(weekdayOf)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("does not drift with daylight saving", () => {
    // UTC arithmetic throughout, so a date in a DST-shifting month still lands on its real weekday.
    expect(weekdayOf("2026-03-29")).toBe(0);
    expect(weekdayOf("2026-10-25")).toBe(0);
  });
});

describe("isScheduled", () => {
  it("treats every day, a full list and an empty list alike", () => {
    for (const days of [EVERY_DAY, [0, 1, 2, 3, 4, 5, 6], []]) {
      expect([SUN, MON, TUE, WED, THU, FRI, SAT].every((d) => isScheduled(d, days))).toBe(true);
    }
  });

  it("defaults to every day when no recurrence is given", () => {
    expect(isScheduled(TUE)).toBe(true);
  });

  it("asks only on the chosen days", () => {
    expect([MON, WED, FRI].every((d) => isScheduled(d, MWF))).toBe(true);
    expect([SUN, TUE, THU, SAT].some((d) => isScheduled(d, MWF))).toBe(false);
  });
});

describe("recurrenceLabel", () => {
  it("reads the way a coach would say it", () => {
    expect(recurrenceLabel(EVERY_DAY)).toBe("Every day");
    expect(recurrenceLabel([])).toBe("Every day");
    expect(recurrenceLabel([1, 2, 3, 4, 5])).toBe("Weekdays");
    expect(recurrenceLabel([0, 6])).toBe("Weekends");
    expect(recurrenceLabel(MWF)).toBe("Mon, Wed, Fri");
  });

  it("lists days Monday first, whatever order they came in", () => {
    // Sunday is last in a coach's week, not first.
    expect(recurrenceLabel([0, 5, 1])).toBe("Mon, Fri, Sun");
  });

  it("ignores a day number that could never be real", () => {
    expect(recurrenceLabel([1, 3, 99, -1])).toBe("Mon, Wed");
  });
});

describe("habitStreaks with a recurrence", () => {
  it("behaves exactly as before for an every-day habit", () => {
    // The guarantee that makes this change safe to deploy over real data.
    expect(habitStreaks([WED, THU, FRI], FRI, EVERY_DAY)).toEqual({ current: 3, best: 3 });
    expect(habitStreaks([WED, THU, FRI], FRI)).toEqual({ current: 3, best: 3 });
    expect(habitStreaks([WED, FRI], FRI, EVERY_DAY)).toEqual({ current: 1, best: 1 });
  });

  it("does not break a Mon/Wed/Fri streak on the days it was never asked for", () => {
    // The whole point of recurrence: without this, Tuesday ruins everything.
    expect(habitStreaks([MON, WED, FRI], FRI, MWF)).toEqual({ current: 3, best: 3 });
  });

  it("still breaks when a scheduled day is actually missed", () => {
    // Wednesday was expected and skipped.
    expect(habitStreaks([MON, FRI], FRI, MWF)).toEqual({ current: 1, best: 1 });
  });

  it("counts back from the last scheduled day when today is not logged yet", () => {
    // Saturday: not a scheduled day, nothing logged. The streak stands at Mon+Wed+Fri.
    expect(habitStreaks([MON, WED, FRI], SAT, MWF)).toEqual({ current: 3, best: 3 });
    // And on Friday itself, before it has been ticked, Mon+Wed still count.
    expect(habitStreaks([MON, WED], FRI, MWF)).toEqual({ current: 2, best: 2 });
  });

  it("carries a streak across the week boundary", () => {
    // Fri 13 Nov (a Friday), then Mon 16, Wed 18: four scheduled days in a row.
    expect(habitStreaks(["2026-11-11", "2026-11-13", MON, WED], WED, MWF)).toEqual({ current: 4, best: 4 });
  });

  it("ignores a tick on a day the habit was not expected", () => {
    // Keen client ticked Tuesday too. It is not a scheduled day, so it neither helps nor hurts.
    expect(habitStreaks([MON, TUE, WED, FRI], FRI, MWF)).toEqual({ current: 3, best: 3 });
  });

  it("ignores the future, duplicates and input order", () => {
    expect(habitStreaks([FRI, MON, MON, WED, "2027-01-01"], FRI, MWF)).toEqual({ current: 3, best: 3 });
  });

  it("remembers the best run after the current one is broken", () => {
    // Mon, Wed, Fri done; then the next Mon and Wed missed; then Fri done again.
    expect(habitStreaks([MON, WED, FRI, "2026-11-27"], "2026-11-27", MWF)).toEqual({ current: 1, best: 3 });
  });

  it("handles a once-a-week habit", () => {
    const mondays = ["2026-11-02", "2026-11-09", MON];
    expect(habitStreaks(mondays, MON, [1])).toEqual({ current: 3, best: 3 });
    // A missed Monday breaks it.
    expect(habitStreaks(["2026-11-02", MON], MON, [1])).toEqual({ current: 1, best: 1 });
  });

  it("returns zero for a habit never done", () => {
    expect(habitStreaks([], FRI, MWF)).toEqual({ current: 0, best: 0 });
  });
});

describe("the preset library", () => {
  it("offers enough to fill the page without typing", () => {
    expect(HABIT_PRESETS.length).toBeGreaterThanOrEqual(25);
  });

  it("puts every preset in a real category, and fills every category", () => {
    for (const p of HABIT_PRESETS) expect(HABIT_CATEGORIES).toContain(p.category);
    for (const c of HABIT_CATEGORIES) {
      expect(HABIT_PRESETS.some((p) => p.category === c), `nothing in ${c}`).toBe(true);
    }
  });

  it("gives every preset a legal recurrence", () => {
    for (const p of HABIT_PRESETS) {
      expect(p.days.length, p.name).toBeGreaterThan(0);
      expect(p.days.length, p.name).toBeLessThanOrEqual(7);
      for (const d of p.days) expect(WEEKDAY_LABELS[d], `${p.name}: ${d}`).toBeDefined();
      expect(new Set(p.days).size, `${p.name} repeats a day`).toBe(p.days.length);
    }
  });

  it("names each habit once, and within the length a habit name allows", () => {
    const names = HABIT_PRESETS.map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
    // NameSchema in routes/habits.ts caps a habit name at 60 characters.
    for (const n of names) expect(n.length, n).toBeLessThanOrEqual(60);
  });

  it("writes each habit as something a client could tick, not a topic", () => {
    // "Drink 3 litres of water", not "Water". Anything one word long is a category, not a habit.
    for (const p of HABIT_PRESETS) expect(p.name.trim().split(/\s+/).length, p.name).toBeGreaterThan(1);
  });
});
