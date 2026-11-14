// Grouping assignments into the week x day grid (Inspo W11/N9, Nov 2026).
//
// The grid is the one view where a coach sees a whole block of training at once, so the grouping has
// to be right at the edges: Monday starts the week, weeks run newest first, a week with nothing in it
// is skipped unless it is the one we were asked to keep, and a junk date never takes the page down.
import { describe, expect, it } from "vitest";
import {
  addDays,
  groupByWeek,
  isDay,
  weekDays,
  weekLabel,
  weekStart,
  weekdayLabel,
} from "../../client/src/lib/weekGrid.js";

// Sun 15 Nov 2026 is a Sunday; its Monday is 9 Nov.
describe("weekStart", () => {
  it("returns the Monday of the week", () => {
    expect(weekStart("2026-11-09")).toBe("2026-11-09"); // Monday itself
    expect(weekStart("2026-11-11")).toBe("2026-11-09"); // Wednesday
    expect(weekStart("2026-11-15")).toBe("2026-11-09"); // Sunday belongs to the week that began Mon 9th
  });

  it("treats Sunday as the END of a week, not the start", () => {
    // The whole point of Monday-first: a Sunday session belongs with the week just trained.
    expect(weekStart("2026-11-15")).toBe("2026-11-09");
    expect(weekStart("2026-11-16")).toBe("2026-11-16"); // the next Monday
  });

  it("works across a month and a year boundary", () => {
    expect(weekStart("2026-12-01")).toBe("2026-11-30");
    expect(weekStart("2027-01-01")).toBe("2026-12-28");
  });
});

describe("weekDays and addDays", () => {
  it("gives seven days, Monday first", () => {
    expect(weekDays("2026-11-09")).toEqual([
      "2026-11-09",
      "2026-11-10",
      "2026-11-11",
      "2026-11-12",
      "2026-11-13",
      "2026-11-14",
      "2026-11-15",
    ]);
  });

  it("crosses a leap day", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2028-02-28", 2)).toBe("2028-03-01");
  });
});

describe("groupByWeek", () => {
  const a = (date: string, id = date) => ({ id, date });

  it("puts each item on its own day, in the week it belongs to", () => {
    const rows = groupByWeek([a("2026-11-11"), a("2026-11-11", "second"), a("2026-11-15")]);
    expect(rows).toHaveLength(1);
    expect(rows[0].monday).toBe("2026-11-09");
    expect(rows[0].count).toBe(3);
    // Wednesday is index 2, Sunday index 6.
    expect(rows[0].days[2].items.map((i) => i.id)).toEqual(["2026-11-11", "second"]);
    expect(rows[0].days[6].items).toHaveLength(1);
    expect(rows[0].days[0].items).toEqual([]);
  });

  it("returns newest week first", () => {
    const rows = groupByWeek([a("2026-11-02"), a("2026-11-11"), a("2026-10-26")]);
    expect(rows.map((r) => r.monday)).toEqual(["2026-11-09", "2026-11-02", "2026-10-26"]);
  });

  it("skips empty weeks between two with work in them", () => {
    // A coach who took a fortnight off should not scroll past two blank rows.
    const rows = groupByWeek([a("2026-11-11"), a("2026-10-21")]);
    expect(rows.map((r) => r.monday)).toEqual(["2026-11-09", "2026-10-19"]);
  });

  it("always includes the week it is asked to keep, even when empty", () => {
    const rows = groupByWeek([a("2026-10-21")], "2026-11-15");
    expect(rows.map((r) => r.monday)).toEqual(["2026-11-09", "2026-10-19"]);
    expect(rows[0].count).toBe(0);
  });

  it("does not duplicate the kept week when it already has work", () => {
    const rows = groupByWeek([a("2026-11-11")], "2026-11-15");
    expect(rows).toHaveLength(1);
    expect(rows[0].count).toBe(1);
  });

  it("gives seven days on every row, always", () => {
    for (const row of groupByWeek([a("2026-11-11"), a("2026-10-21")], "2026-12-01")) {
      expect(row.days).toHaveLength(7);
    }
  });

  it("drops a junk date instead of crashing the grid", () => {
    const rows = groupByWeek([a("2026-11-11"), a("not-a-date", "junk"), a("2026-02-30", "impossible")]);
    expect(rows).toHaveLength(1);
    expect(rows[0].count).toBe(1);
  });

  it("is empty for nothing at all", () => {
    expect(groupByWeek([])).toEqual([]);
  });

  it("ignores a junk 'keep this week'", () => {
    expect(groupByWeek([], "rubbish")).toEqual([]);
  });

  it("keeps the order items arrived in within a day", () => {
    // Plans are fetched newest first; the grid must not silently reshuffle them.
    const rows = groupByWeek([a("2026-11-11", "first"), a("2026-11-11", "second"), a("2026-11-11", "third")]);
    expect(rows[0].days[2].items.map((i) => i.id)).toEqual(["first", "second", "third"]);
  });
});

describe("labels", () => {
  it("writes a week inside one month compactly", () => {
    expect(weekLabel("2026-11-09")).toBe("9 - 15 Nov");
  });

  it("names both months when the week straddles them", () => {
    expect(weekLabel("2026-10-26")).toBe("26 Oct - 1 Nov");
  });

  it("names the weekday of a column", () => {
    expect(weekdayLabel("2026-11-09")).toBe("Mon");
    expect(weekdayLabel("2026-11-15")).toBe("Sun");
  });
});

describe("isDay", () => {
  it("accepts real days and rejects the rest", () => {
    expect(isDay("2026-11-15")).toBe(true);
    expect(isDay("2026-02-30")).toBe(false);
    expect(isDay("15-11-2026")).toBe(false);
    expect(isDay("")).toBe(false);
  });
});
