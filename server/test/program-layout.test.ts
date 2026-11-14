// Laying a program template out on the calendar (Inspo W10, Nov 2026).
//
// The decision under test: `startDate` anchors week 1 and is NOT snapped to a Monday. A coach who
// starts a client on a Wednesday means Wednesday - snapping would silently drop the first days of
// their plan.
import { describe, expect, it } from "vitest";
import { layOutProgram, programWeeks, weekdayOf, type PlannedPhase } from "../src/programs/layout.js";

// 2026-11-16 is a Monday. 2026-11-18 is a Wednesday.
const MON = "2026-11-16";
const WED = "2026-11-18";

const item = (week: number, weekday: number, title: string, type = "Workout") => ({
  week,
  weekday,
  type,
  title,
  details: "",
});

const phase = (over: Partial<PlannedPhase> = {}): PlannedPhase => ({
  order: 0,
  name: "Phase 1",
  weeks: 1,
  items: [],
  ...over,
});

describe("weekdayOf", () => {
  it("agrees with the habit module's numbering", () => {
    expect(weekdayOf("2026-11-15")).toBe(0);
    expect(weekdayOf(MON)).toBe(1);
    expect(weekdayOf(WED)).toBe(3);
  });
});

describe("programWeeks", () => {
  it("adds the phases up", () => {
    expect(programWeeks([phase({ weeks: 4 }), phase({ order: 1, weeks: 3 })])).toBe(7);
  });

  it("counts a zero-week phase as one, never nothing", () => {
    expect(programWeeks([phase({ weeks: 0 })])).toBe(1);
  });

  it("is zero for a program with no phases", () => {
    expect(programWeeks([])).toBe(0);
  });
});

describe("layOutProgram", () => {
  it("puts a Monday-start week 1 on the week of the start date", () => {
    const dated = layOutProgram(
      [phase({ weeks: 1, items: [item(1, 1, "Day A"), item(1, 3, "Day B"), item(1, 5, "Day C")] })],
      MON,
    );
    expect(dated.map((d) => [d.date, d.title])).toEqual([
      [MON, "Day A"],
      ["2026-11-18", "Day B"],
      ["2026-11-20", "Day C"],
    ]);
  });

  it("does NOT snap a mid-week start back to Monday", () => {
    // Starting Wednesday means Wednesday. Week 1's Wednesday item is the start date itself; its
    // Friday item is two days later; its MONDAY item is the following Monday, still inside week 1.
    const dated = layOutProgram(
      [phase({ items: [item(1, 3, "Wed session"), item(1, 5, "Fri session"), item(1, 1, "Mon session")] })],
      WED,
    );
    const byTitle = Object.fromEntries(dated.map((d) => [d.title, d.date]));
    expect(byTitle["Wed session"]).toBe(WED);
    expect(byTitle["Fri session"]).toBe("2026-11-20");
    // Not 2026-11-16, which is BEFORE the client started.
    expect(byTitle["Mon session"]).toBe("2026-11-23");
  });

  it("never schedules anything before the start date", () => {
    const everyDay = [0, 1, 2, 3, 4, 5, 6].map((d) => item(1, d, `Day ${d}`));
    for (const start of [MON, WED, "2026-11-15", "2026-11-21"]) {
      for (const d of layOutProgram([phase({ items: everyDay })], start)) {
        expect(d.date >= start, `${d.title} landed before ${start}`).toBe(true);
      }
    }
  });

  it("runs week 2 a week after week 1", () => {
    const dated = layOutProgram([phase({ weeks: 2, items: [item(1, 1, "W1"), item(2, 1, "W2")] })], MON);
    expect(dated.map((d) => d.date)).toEqual([MON, "2026-11-23"]);
  });

  it("runs phases back to back", () => {
    const dated = layOutProgram(
      [
        phase({ order: 0, name: "Base", weeks: 2, items: [item(1, 1, "Base week 1")] }),
        phase({ order: 1, name: "Build", weeks: 2, items: [item(1, 1, "Build week 1")] }),
      ],
      MON,
    );
    // Base runs two weeks, so Build week 1 is the third week of the program.
    expect(dated.map((d) => [d.date, d.phaseName])).toEqual([
      [MON, "Base"],
      ["2026-11-30", "Build"],
    ]);
  });

  it("respects phase order, not the order they arrive in", () => {
    const dated = layOutProgram(
      [
        phase({ order: 1, name: "Second", weeks: 1, items: [item(1, 1, "B")] }),
        phase({ order: 0, name: "First", weeks: 1, items: [item(1, 1, "A")] }),
      ],
      MON,
    );
    expect(dated.map((d) => d.phaseName)).toEqual(["First", "Second"]);
  });

  it("drops an item outside its phase's weeks instead of spilling into the next phase", () => {
    // A phase shortened from 4 weeks to 2 can leave week-3 items behind.
    const dated = layOutProgram(
      [
        phase({ order: 0, name: "Base", weeks: 2, items: [item(1, 1, "Kept"), item(3, 1, "Orphaned")] }),
        phase({ order: 1, name: "Build", weeks: 1, items: [item(1, 1, "Build")] }),
      ],
      MON,
    );
    expect(dated.map((d) => d.title)).toEqual(["Kept", "Build"]);
  });

  it("ignores a week number that could never be real", () => {
    expect(layOutProgram([phase({ items: [item(0, 1, "Zero"), item(-1, 1, "Negative")] })], MON)).toEqual([]);
  });

  it("keeps the type and details of each item", () => {
    const dated = layOutProgram(
      [phase({ items: [{ week: 1, weekday: 1, type: "Nutrition", title: "Meals", details: "1. Oats" }] })],
      MON,
    );
    expect(dated[0]).toMatchObject({ type: "Nutrition", title: "Meals", details: "1. Oats" });
  });

  it("returns oldest first, and is stable within a day", () => {
    const dated = layOutProgram(
      [phase({ weeks: 2, items: [item(1, 1, "Zebra"), item(1, 1, "Apple"), item(2, 1, "Later")] })],
      MON,
    );
    expect(dated.map((d) => d.title)).toEqual(["Apple", "Zebra", "Later"]);
  });

  it("handles an empty program and an empty phase", () => {
    expect(layOutProgram([], MON)).toEqual([]);
    expect(layOutProgram([phase()], MON)).toEqual([]);
  });

  it("crosses a month and a year boundary without drifting", () => {
    const dated = layOutProgram([phase({ weeks: 8, items: [item(1, 1, "A"), item(8, 1, "B")] })], "2026-12-28");
    expect(dated.map((d) => d.date)).toEqual(["2026-12-28", "2027-02-15"]);
  });

  it("does not drift across a daylight-saving change", () => {
    // UTC arithmetic throughout: 8 weeks from late March stays on the same weekday.
    const dated = layOutProgram([phase({ weeks: 8, items: [item(1, 0, "Sun"), item(8, 0, "Sun again")] })], "2026-03-22");
    expect(dated.map((d) => d.date)).toEqual(["2026-03-22", "2026-05-10"]);
    expect(dated.every((d) => weekdayOf(d.date) === 0)).toBe(true);
  });
});
