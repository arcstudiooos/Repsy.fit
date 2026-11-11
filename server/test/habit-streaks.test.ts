// Prompt 54: the ONE streak function, and its edge cases.
import { describe, expect, it } from "vitest";
import { habitStreaks, lastDays } from "../src/habits.js";

const TODAY = "2026-11-11";

describe("habitStreaks(doneDates, today)", () => {
  it("no logs: 0 and 0", () => {
    expect(habitStreaks([], TODAY)).toEqual({ current: 0, best: 0 });
  });

  it("done every day up to and including today counts today", () => {
    expect(habitStreaks(["2026-11-09", "2026-11-10", "2026-11-11"], TODAY)).toEqual({ current: 3, best: 3 });
  });

  it("today NOT yet logged does not break the streak", () => {
    expect(habitStreaks(["2026-11-08", "2026-11-09", "2026-11-10"], TODAY)).toEqual({ current: 3, best: 3 });
  });

  it("a missed day breaks the streak (yesterday and today both missing)", () => {
    expect(habitStreaks(["2026-11-07", "2026-11-08", "2026-11-09"], TODAY)).toEqual({ current: 0, best: 3 });
  });

  it("a gap in the middle splits the run; best keeps the longer old run", () => {
    const done = ["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-08", "2026-11-09", "2026-11-10", "2026-11-11"];
    expect(habitStreaks(done, TODAY)).toEqual({ current: 4, best: 4 });
    expect(habitStreaks([...done, "2026-11-05"], TODAY)).toEqual({ current: 4, best: 5 });
  });

  it("only today done: streak of 1", () => {
    expect(habitStreaks([TODAY], TODAY)).toEqual({ current: 1, best: 1 });
  });

  it("ignores duplicates, order, and days after today", () => {
    expect(habitStreaks(["2026-11-11", "2026-11-10", "2026-11-10", "2026-11-12"], TODAY)).toEqual({ current: 2, best: 2 });
  });

  it("counts across month and year ends", () => {
    expect(habitStreaks(["2026-12-30", "2026-12-31", "2027-01-01"], "2027-01-01")).toEqual({ current: 3, best: 3 });
  });
});

describe("lastDays(today, n)", () => {
  it("returns n dates, oldest first, ending today", () => {
    expect(lastDays("2026-11-02", 7)).toEqual([
      "2026-10-27",
      "2026-10-28",
      "2026-10-29",
      "2026-10-30",
      "2026-10-31",
      "2026-11-01",
      "2026-11-02",
    ]);
  });
});
