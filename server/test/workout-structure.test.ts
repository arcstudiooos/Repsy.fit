// Structured workouts: the structure module itself (Inspo W3/W5/W6/W7/W8/W9, Nov 2026).
//
// The test that matters most is the ROUND TRIP against the real client parser: a structured workout
// renders to `details`, and client/src/clientApp/planLines.ts - the code the client app's checklist
// actually runs - must read every exercise back. That is what lets structured rows be the new source
// of truth without rewriting the older readers. It imports the client file directly rather than
// copying its regex, so the two cannot drift apart silently.
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  PROTOCOLS,
  RECORD_FIELDS,
  StructureSchema,
  clockLabel,
  estimateSeconds,
  looksStructured,
  parseDetails,
  renderDetails,
  repsLabel,
  setCount,
  type SectionInput,
} from "../src/workouts/structure.js";
import { parsePlanLines } from "../../client/src/clientApp/planLines.js";

const exercise = (over: Partial<SectionInput["exercises"][number]> = {}) => ({
  exerciseId: null,
  name: "Back Squat",
  repsPerSet: [6, 6, 6, 6],
  loadPerSet: [] as string[],
  durationSec: null,
  distanceM: null,
  rpe: null,
  restSec: 120,
  notes: "",
  recordFields: [] as (typeof RECORD_FIELDS)[number][],
  ...over,
});

const section = (over: Partial<SectionInput> = {}): SectionInput => ({
  protocol: "Regular",
  sets: 1,
  restSec: 0,
  durationSec: null,
  notes: "",
  exercises: [exercise()],
  ...over,
});

describe("the client's copy of the estimate has not drifted", () => {
  // The builder shows a live "Estimated time" while the coach types, so the arithmetic is duplicated
  // in client/src/components/WorkoutBuilder.tsx. If the two ever disagree, the number jumps the
  // moment the plan is saved - so the constants and the shape are pinned here.
  it("the client uses the same constants", async () => {
    const builder = await readFile(new URL("../../client/src/components/WorkoutBuilder.tsx", import.meta.url), "utf8");
    expect(builder).toContain("const SECONDS_PER_REP = 3;");
    expect(builder).toContain("const FALLBACK_SET_SEC = 45;");
    // The two branches that matter: a timed protocol is its window, and rest skips the last set.
    expect(builder).toContain("TIMED_PROTOCOLS.includes(section.protocol) && section.durationSec");
    expect(builder).toContain("Math.max(0, sets - 1) * ex.restSec");
    expect(builder).toContain("Math.max(0, rounds - 1) * section.restSec");
  });
});

describe("the client's copy of the constants has not drifted", () => {
  // PROTOCOLS and RECORD_FIELDS are written out in client/src/types.ts so the UI can render them
  // without importing server code. Same convention as content.ts vs billing/plans.ts: duplicate,
  // then fail CI the moment the two disagree.
  it("PROTOCOLS and RECORD_FIELDS match client/src/types.ts", async () => {
    const types = await readFile(new URL("../../client/src/types.ts", import.meta.url), "utf8");
    const listIn = (name: string) => {
      const m = new RegExp(`export const ${name} = \\[([^\\]]*)\\]`).exec(types);
      if (!m) throw new Error(`${name} not found in client/src/types.ts`);
      return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
    };
    expect(listIn("PROTOCOLS")).toEqual([...PROTOCOLS]);
    expect(listIn("RECORD_FIELDS")).toEqual([...RECORD_FIELDS]);
  });
});

describe("repsLabel and setCount", () => {
  it("collapses identical sets and lists varied ones", () => {
    expect(repsLabel([6, 6, 6])).toBe("6");
    expect(repsLabel([12, 12, 10])).toBe("12, 12, 10");
    expect(repsLabel([])).toBe("");
  });

  it("counts sets from the longest per-set list, falling back to the section", () => {
    expect(setCount(exercise({ repsPerSet: [12, 12, 10] }), 1)).toBe(3);
    expect(setCount(exercise({ repsPerSet: [], loadPerSet: ["20 kg", "25 kg"] }), 1)).toBe(2);
    expect(setCount(exercise({ repsPerSet: [], loadPerSet: [] }), 3)).toBe(3);
  });
});

describe("renderDetails stays readable by the client app's parser", () => {
  it("round-trips a plain reps workout", () => {
    const text = renderDetails([section()]);
    expect(text).toBe("1. Back Squat - 4 sets x 6 reps · Rest 120s");
    const [line] = parsePlanLines(text);
    expect(line).toMatchObject({ kind: "exercise", n: 1, name: "Back Squat", sets: 4, reps: "6", restSec: 120 });
  });

  it("round-trips varied per-set reps as the one line a coach would write", () => {
    const text = renderDetails([section({ exercises: [exercise({ repsPerSet: [12, 12, 10] })] })]);
    expect(text).toContain("3 sets x 12, 12, 10 reps");
    const [line] = parsePlanLines(text);
    // The old reader keeps the whole list in `reps` - nothing is lost to it.
    expect(line).toMatchObject({ kind: "exercise", sets: 3, reps: "12, 12, 10" });
  });

  it("round-trips a load and a timed move", () => {
    const loaded = renderDetails([section({ exercises: [exercise({ loadPerSet: ["60 kg", "60 kg", "65 kg", "65 kg"] })] })]);
    expect(parsePlanLines(loaded)[0]).toMatchObject({ load: "60 kg", sets: 4 });

    const timed = renderDetails([section({ exercises: [exercise({ name: "Plank", repsPerSet: [], durationSec: 40 })] })]);
    expect(timed).toContain("1 sets x 40 s");
    expect(parsePlanLines(timed)[0]).toMatchObject({ kind: "exercise", name: "Plank", timed: true, reps: "40 s" });
  });

  it("keeps RPE and notes off the dose line, because the parser anchors on Rest", () => {
    const text = renderDetails([section({ exercises: [exercise({ rpe: 8, notes: "Pause at the bottom." })] })]);
    const [first, second] = text.split("\n");
    // The dose line still parses as an exercise...
    expect(parsePlanLines(first)[0]).toMatchObject({ kind: "exercise", name: "Back Squat" });
    // ...and the extras ride along as a plain text line.
    expect(second).toContain("RPE 8");
    expect(second).toContain("Pause at the bottom.");
    expect(parsePlanLines(text).filter((l) => l.kind === "exercise")).toHaveLength(1);
  });

  it("numbers exercises 1..n across the whole workout, not per section", () => {
    const text = renderDetails([
      section({ protocol: "Warm up", exercises: [exercise({ name: "Jumping Jacks" })] }),
      section({ exercises: [exercise({ name: "Back Squat" }), exercise({ name: "Deadlift" })] }),
    ]);
    const nums = parsePlanLines(text)
      .filter((l) => l.kind === "exercise")
      .map((l) => (l.kind === "exercise" ? l.n : 0));
    expect(nums).toEqual([1, 2, 3]);
  });

  it("writes a heading for a protocol worth saying, and none for a plain section", () => {
    expect(renderDetails([section({ protocol: "Superset", sets: 3 })])).toContain("Superset - 3 rounds:");
    expect(renderDetails([section()]).startsWith("1.")).toBe(true);
  });
});

describe("parseDetails reads legacy plans back", () => {
  it("turns the Manual Planner's lines into a section of exercises", () => {
    const sections = parseDetails("1. Back Squat - 4 sets x 6 reps · 60 kg · Rest 120s\n2. Plank - 3 sets x 40 s · Rest 60s");
    expect(sections).toHaveLength(1);
    expect(sections[0].exercises).toHaveLength(2);
    // "6" over 4 sets becomes four sets of six: the arrays carry it explicitly.
    expect(sections[0].exercises[0]).toMatchObject({ name: "Back Squat", repsPerSet: [6, 6, 6, 6], restSec: 120 });
    expect(sections[0].exercises[0].loadPerSet).toEqual(["60 kg", "60 kg", "60 kg", "60 kg"]);
    expect(sections[0].exercises[1]).toMatchObject({ name: "Plank", durationSec: 40, repsPerSet: [] });
  });

  it("reads a varied set list straight back into an array", () => {
    const [s] = parseDetails("1. Bench Press - 3 sets x 12, 12, 10 reps · Rest 90s");
    expect(s.exercises[0].repsPerSet).toEqual([12, 12, 10]);
  });

  it("starts a new section at each Day heading", () => {
    const sections = parseDetails(
      "Day 1 - Push\n1. Bench Press - 3 sets x 8 reps · Rest 90s\nDay 2 - Pull\n1. Pull-Up - 3 sets x 6 reps · Rest 90s",
    );
    expect(sections).toHaveLength(2);
    expect(sections[0].notes).toBe("Day 1 - Push");
    expect(sections[1].exercises[0].name).toBe("Pull-Up");
  });

  it("never drops a coach's prose: unparseable lines become section notes", () => {
    const [s] = parseDetails("Keep the tempo slow today.\n1. Back Squat - 4 sets x 6 reps · Rest 120s");
    expect(s.notes).toBe("Keep the tempo slow today.");
    expect(s.exercises).toHaveLength(1);
  });

  it("keeps a rep range as a note, since the arrays only hold numbers", () => {
    const [s] = parseDetails("1. Back Squat - 4 sets x 8-10 reps · Rest 120s");
    expect(s.exercises[0].repsPerSet).toEqual([]);
    expect(s.exercises[0].notes).toBe("8-10 reps");
  });

  it("round-trips: render -> parse -> render is stable", () => {
    const original = [section({ exercises: [exercise({ repsPerSet: [12, 12, 10], loadPerSet: ["40 kg", "40 kg", "40 kg"] })] })];
    const once = renderDetails(original);
    const twice = renderDetails(parseDetails(once));
    expect(twice).toBe(once);
  });

  it("looksStructured tells a plan from a paragraph", () => {
    expect(looksStructured("1. Back Squat - 4 sets x 6 reps · Rest 120s")).toBe(true);
    expect(looksStructured("Walk 30 minutes and stretch.")).toBe(false);
    expect(looksStructured("")).toBe(false);
  });
});

describe("estimateSeconds", () => {
  it("adds work and rest, and does not rest after the last set", () => {
    // 4 sets x 6 reps x 3s = 72s work, plus 3 gaps x 120s rest = 360s -> 432s.
    expect(estimateSeconds([section()])).toBe(432);
  });

  it("a timed move costs its own clock", () => {
    // 3 sets x 40s = 120s, plus 2 rests of 60s = 120s -> 240s.
    expect(estimateSeconds([section({ exercises: [exercise({ repsPerSet: [], durationSec: 40, restSec: 60, loadPerSet: ["", "", ""] })] })])).toBe(240);
  });

  it("a time-boxed protocol is its window, not its reps", () => {
    const amrap = section({ protocol: "AMRAP", sets: 1, durationSec: 600, exercises: [exercise({ repsPerSet: [100] })] });
    expect(estimateSeconds([amrap])).toBe(600);
  });

  it("an empty workout takes no time", () => {
    expect(estimateSeconds([])).toBe(0);
    expect(estimateSeconds([section({ exercises: [] })])).toBe(0);
  });

  it("formats as a clock", () => {
    expect(clockLabel(0)).toBe("0:00");
    expect(clockLabel(432)).toBe("7:12");
    expect(clockLabel(3930)).toBe("1:05:30");
  });
});

describe("StructureSchema", () => {
  it("accepts a workout and fills defaults", () => {
    const parsed = StructureSchema.parse({ sections: [{ exercises: [{ name: "Back Squat" }] }] });
    expect(parsed.sections[0]).toMatchObject({ protocol: "Regular", sets: 1, restSec: 0 });
    expect(parsed.sections[0].exercises[0]).toMatchObject({ repsPerSet: [], recordFields: [] });
  });

  it("refuses a nameless exercise, a bad protocol, a bad RPE and a silly set list", () => {
    expect(StructureSchema.safeParse({ sections: [{ exercises: [{ name: "  " }] }] }).success).toBe(false);
    expect(StructureSchema.safeParse({ sections: [{ protocol: "Vibes", exercises: [] }] }).success).toBe(false);
    expect(StructureSchema.safeParse({ sections: [{ exercises: [{ name: "x", rpe: 11 }] }] }).success).toBe(false);
    expect(
      StructureSchema.safeParse({ sections: [{ exercises: [{ name: "x", repsPerSet: Array(21).fill(5) }] }] }).success,
    ).toBe(false);
  });

  it("explains a nameless exercise in plain words", () => {
    const bad = StructureSchema.safeParse({ sections: [{ exercises: [{ name: "" }] }] });
    expect(bad.success).toBe(false);
    if (!bad.success) expect(bad.error.issues[0].message).toBe("Every exercise needs a name.");
  });

  it("an empty section list is legal: it clears the structure", () => {
    expect(StructureSchema.parse({ sections: [] }).sections).toEqual([]);
  });

  it("every protocol and record field is accepted", () => {
    for (const protocol of PROTOCOLS) {
      expect(StructureSchema.safeParse({ sections: [{ protocol, exercises: [] }] }).success).toBe(true);
    }
    const all = StructureSchema.safeParse({
      sections: [{ exercises: [{ name: "x", recordFields: [...RECORD_FIELDS] }] }],
    });
    expect(all.success).toBe(true);
  });
});
