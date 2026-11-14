// The client snapshot's streak rule (Inspo C5, Nov 2026).
//
// The rule, restated so a failing test here is unambiguous: a day counts when the client finished
// an assignment, filled in a check-in, or logged progress. The current streak is the run of
// counting days ending TODAY or YESTERDAY. Yesterday is deliberate - at 9am a coach must not see a
// three-week streak reported as 0 because the day is young. Any older run has ended.
import { describe, expect, it } from "vitest";
import { currentStreak, isDay, longestStreak } from "../src/clients/snapshot.js";

const TODAY = "2026-11-15";

describe("currentStreak", () => {
  it("counts a run ending today", () => {
    expect(currentStreak({ today: TODAY, activeDays: ["2026-11-13", "2026-11-14", "2026-11-15"] })).toBe(3);
  });

  it("counts a run ending yesterday, because today is not over", () => {
    expect(currentStreak({ today: TODAY, activeDays: ["2026-11-13", "2026-11-14"] })).toBe(2);
  });

  it("is 0 when the last active day is older than yesterday", () => {
    expect(currentStreak({ today: TODAY, activeDays: ["2026-11-11", "2026-11-12", "2026-11-13"] })).toBe(0);
  });

  it("stops at the first gap", () => {
    // 15th and 14th count; the 12th is past a gap on the 13th.
    expect(currentStreak({ today: TODAY, activeDays: ["2026-11-15", "2026-11-14", "2026-11-12", "2026-11-11"] })).toBe(2);
  });

  it("counts a single day", () => {
    expect(currentStreak({ today: TODAY, activeDays: [TODAY] })).toBe(1);
  });

  it("ignores duplicates, which is the normal case: a check-in AND a finished plan on one day", () => {
    expect(currentStreak({ today: TODAY, activeDays: [TODAY, TODAY, TODAY, "2026-11-14"] })).toBe(2);
  });

  it("does not care what order the days arrive in", () => {
    const days = ["2026-11-14", "2026-11-12", "2026-11-15", "2026-11-13"];
    expect(currentStreak({ today: TODAY, activeDays: days })).toBe(4);
  });

  it("is 0 for a client who has done nothing", () => {
    expect(currentStreak({ today: TODAY, activeDays: [] })).toBe(0);
  });

  it("ignores junk days instead of throwing", () => {
    expect(currentStreak({ today: TODAY, activeDays: ["", "nonsense", "2026-13-45", TODAY] })).toBe(1);
  });

  it("is 0 when today itself is junk", () => {
    expect(currentStreak({ today: "not-a-day", activeDays: [TODAY] })).toBe(0);
  });

  it("counts across a month boundary", () => {
    expect(currentStreak({ today: "2026-12-01", activeDays: ["2026-11-29", "2026-11-30", "2026-12-01"] })).toBe(3);
  });

  it("counts across a year boundary", () => {
    expect(currentStreak({ today: "2027-01-01", activeDays: ["2026-12-31", "2027-01-01"] })).toBe(2);
  });

  it("counts across a leap day", () => {
    expect(currentStreak({ today: "2028-03-01", activeDays: ["2028-02-28", "2028-02-29", "2028-03-01"] })).toBe(3);
  });

  it("ignores days in the future", () => {
    // A client's device a day ahead must not inflate the streak beyond the run itself.
    expect(currentStreak({ today: TODAY, activeDays: ["2026-11-20", TODAY] })).toBe(1);
  });
});

describe("longestStreak", () => {
  it("finds the best run, not the current one", () => {
    const days = ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-11-15"];
    expect(longestStreak(days)).toBe(4);
  });

  it("is 0 for nothing and 1 for a single day", () => {
    expect(longestStreak([])).toBe(0);
    expect(longestStreak(["2026-11-15"])).toBe(1);
  });

  it("ignores duplicates and order", () => {
    expect(longestStreak(["2026-11-02", "2026-11-01", "2026-11-02", "2026-11-03"])).toBe(3);
  });

  it("ignores junk", () => {
    expect(longestStreak(["oops", "2026-11-01", "2026-11-02"])).toBe(2);
  });
});

describe("isDay", () => {
  it("accepts a real date and rejects an impossible one", () => {
    expect(isDay("2026-11-15")).toBe(true);
    expect(isDay("2026-02-30")).toBe(false);
    expect(isDay("2026-13-01")).toBe(false);
    expect(isDay("15-11-2026")).toBe(false);
    expect(isDay("")).toBe(false);
  });
});
