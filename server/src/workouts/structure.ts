// Structured workouts (Inspo W3/W5/W6/W7/W8, Nov 2026).
//
// A workout is sections -> exercises, with per-set numbers held as arrays: repsPerSet [12, 12, 10]
// IS "12, 12, 10 reps". This module is the single place that knows:
//   * what a legal section/exercise looks like      (zod, below)
//   * how structure renders back to `details` text   (renderDetails)
//   * how legacy `details` text reads as structure   (parseDetails)
//   * how long a workout should take                 (estimateSeconds)
//
// WHY `details` IS STILL WRITTEN. Everything shipped before Nov 2026 - the client app's checklist,
// progress, CSV export, the AI - reads `Assignment.details`. Rather than rewrite all of it at once,
// a structured workout REGENERATES `details` on every save, in exactly the numbered-line format the
// Manual Planner already wrote. So `details` becomes a derived rendering, old readers keep working
// untouched, and the structured rows are the new source of truth when they exist.
//
// The format, which client/src/clientApp/planLines.ts parses (a drift test keeps the two honest):
//   "1. Back Squat - 4 sets x 6 reps · 60 kg · Rest 120s"
import { z } from "zod";

/** How a section is run. The UI shows these in this order. */
export const PROTOCOLS = [
  "Warm up",
  "Regular",
  "Superset",
  "Circuit",
  "AMRAP",
  "EMOM",
  "TABATA",
  "Cool-down",
] as const;
export type Protocol = (typeof PROTOCOLS)[number];

/** Protocols that are a fixed time box rather than a number of sets. */
export const TIMED_PROTOCOLS: readonly Protocol[] = ["AMRAP", "EMOM", "TABATA"];

/** Inspo W8: what the client can be asked to log back. */
export const RECORD_FIELDS = ["reps", "weight", "duration", "distance", "calories"] as const;
export type RecordField = (typeof RECORD_FIELDS)[number];

const int = (label: string, max: number) =>
  z
    .number({ error: `${label} must be a whole number.` })
    .int(`${label} must be a whole number.`)
    .min(0, `${label} cannot be negative.`)
    .max(max, `${label} must be ${max} or less.`);

export const ExerciseInputSchema = z.object({
  /** Optional link to the catalogue. The name is always required regardless. */
  exerciseId: z.string().trim().min(1).max(40).nullish(),
  name: z
    .string({ error: "Every exercise needs a name." })
    .trim()
    .min(1, "Every exercise needs a name.")
    .max(100, "An exercise name must be 100 characters or fewer."),
  repsPerSet: z.array(int("Reps", 1000)).max(20, "A set list can hold at most 20 sets.").default([]),
  loadPerSet: z.array(z.string().trim().max(30)).max(20, "A load list can hold at most 20 sets.").default([]),
  durationSec: int("Duration", 86_400).nullish(),
  distanceM: int("Distance", 1_000_000).nullish(),
  rpe: z.number().min(1, "RPE runs from 1 to 10.").max(10, "RPE runs from 1 to 10.").nullish(),
  restSec: int("Rest", 3600).default(0),
  notes: z.string().trim().max(1000, "A note must be 1000 characters or fewer.").default(""),
  recordFields: z.array(z.enum(RECORD_FIELDS)).max(RECORD_FIELDS.length).default([]),
});
export type ExerciseInput = z.infer<typeof ExerciseInputSchema>;

export const SectionInputSchema = z.object({
  protocol: z.enum(PROTOCOLS, { error: `A section's protocol must be one of: ${PROTOCOLS.join(", ")}.` }).default("Regular"),
  sets: int("Sets", 50).min(1, "A section runs at least once.").default(1),
  restSec: int("Rest", 3600).default(0),
  durationSec: int("Duration", 86_400).nullish(),
  notes: z.string().trim().max(1000, "A note must be 1000 characters or fewer.").default(""),
  exercises: z.array(ExerciseInputSchema).max(60, "A section can hold at most 60 exercises."),
});
export type SectionInput = z.infer<typeof SectionInputSchema>;

/** The whole structure of one workout. An empty list clears it and hands `details` back its job. */
export const StructureSchema = z.object({
  sections: z.array(SectionInputSchema).max(20, "A workout can hold at most 20 sections."),
});

// ---------------------------------------------------------------------------
// Rendering: structure -> the `details` text every older reader understands.
// ---------------------------------------------------------------------------

/** "12, 12, 10" for varied reps, "12" when every set is the same. */
export const repsLabel = (repsPerSet: number[]): string => {
  if (repsPerSet.length === 0) return "";
  return repsPerSet.every((r) => r === repsPerSet[0]) ? String(repsPerSet[0]) : repsPerSet.join(", ");
};

/** How many sets an exercise prescribes: the longest per-set list, or the section's count. */
export const setCount = (ex: ExerciseInput, sectionSets: number): number =>
  Math.max(ex.repsPerSet.length, ex.loadPerSet.length) || Math.max(1, sectionSets);

/**
 * The canonical `details` text for a structured workout.
 *
 * Numbering runs 1..n across the whole workout, because that is what the client app's checklist
 * keys off. A section with a protocol worth saying (anything but Regular) gets a heading line.
 */
export function renderDetails(sections: SectionInput[]): string {
  const lines: string[] = [];
  let n = 0;
  for (const section of sections) {
    const heading: string[] = [];
    if (section.protocol !== "Regular") heading.push(section.protocol);
    if (section.sets > 1) heading.push(`${section.sets} rounds`);
    if (section.durationSec) heading.push(`${Math.round(section.durationSec / 60)} min`);
    if (heading.length) lines.push(`${heading.join(" - ")}:`);
    if (section.notes) lines.push(section.notes);

    for (const ex of section.exercises) {
      n += 1;
      const sets = setCount(ex, section.sets);
      // Either reps or a timed move, matching the two branches planLines.ts understands.
      const dose = ex.repsPerSet.length
        ? `${sets} sets x ${repsLabel(ex.repsPerSet)} reps`
        : ex.durationSec
          ? `${sets} sets x ${ex.durationSec} s`
          : ex.distanceM
            ? `${sets} sets x ${ex.distanceM} m`
            : `${sets} sets`;
      const parts = [`${n}. ${ex.name} - ${dose}`];
      // The old format carries one load, so take the first; the full per-set list lives in the rows.
      const load = ex.loadPerSet.find((l) => l.trim());
      if (load) parts.push(load.trim());
      const rest = ex.restSec || section.restSec;
      // "Rest Ns" must come straight after the optional load: planLines.ts anchors on it, and
      // anything inserted between the two makes the whole line unparseable. So RPE and notes go on
      // the following indented line, which older readers treat as plain text.
      parts.push(`Rest ${rest}s`);
      lines.push(parts.join(" · "));
      const extras = [ex.rpe ? `RPE ${ex.rpe}` : "", ex.notes].filter(Boolean).join(" · ");
      if (extras) lines.push(`   ${extras}`);
    }
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Estimated time (Inspo W9)
// ---------------------------------------------------------------------------

/** Seconds a single working set is assumed to take when it is reps rather than a clock. */
const SECONDS_PER_REP = 3;
/** A reps-based set with no reps recorded still takes a moment. */
const FALLBACK_SET_SEC = 45;

/**
 * A rough, honest estimate of how long a workout takes, in seconds.
 *
 * Time-boxed protocols (AMRAP/EMOM/TABATA) are their own duration and nothing more. Everything else
 * is work plus rest. It is an estimate, labelled as one in the UI - never presented as a promise.
 */
export function estimateSeconds(sections: SectionInput[]): number {
  let total = 0;
  for (const section of sections) {
    if (TIMED_PROTOCOLS.includes(section.protocol) && section.durationSec) {
      total += section.durationSec * Math.max(1, section.sets) + section.restSec;
      continue;
    }
    let sectionWork = 0;
    for (const ex of section.exercises) {
      const sets = setCount(ex, section.sets);
      const perSet = ex.durationSec
        ? ex.durationSec
        : ex.repsPerSet.length
          ? (ex.repsPerSet.reduce((a, b) => a + b, 0) / ex.repsPerSet.length) * SECONDS_PER_REP
          : FALLBACK_SET_SEC;
      // Rest happens between sets, not after the last one.
      sectionWork += sets * perSet + Math.max(0, sets - 1) * ex.restSec;
    }
    // A section that repeats runs its exercises that many times, with rest between rounds.
    const rounds = Math.max(1, section.sets);
    const perSetLists = section.exercises.some((e) => e.repsPerSet.length || e.loadPerSet.length);
    // When exercises carry their own per-set lists they already account for the rounds.
    total += (perSetLists ? sectionWork : sectionWork * rounds) + Math.max(0, rounds - 1) * section.restSec;
  }
  return Math.round(total);
}

/** "1:05:00" or "42:30" - the header label next to "Estimated time". */
export function clockLabel(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const two = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${two(m)}:${two(sec)}` : `${m}:${two(sec)}`;
}

// ---------------------------------------------------------------------------
// Parsing: legacy `details` text -> structure, on demand.
// ---------------------------------------------------------------------------

// Mirrors EXERCISE in client/src/clientApp/planLines.ts. A drift test asserts both still read the
// same line, so changing one without the other fails CI.
const EXERCISE_LINE =
  /^(\d+)\.\s+(.+?)\s+[—–-]\s+(\d+)\s+sets?\s+[×x]\s+(?:(.+?)\s+reps?|(\d+(?:\.\d+)?)\s*(?:s|sec|seconds)\b)(?:\s+[·•\-–—]\s+((?:\d+(?:\.\d+)?\s*(?:kg|lb)s?(?:\s+(?:each|per)\s+(?:arm|hand|side|leg|dumbbell))?)|bodyweight|BW))?\s+[·•\-–—]\s+Rest\s+(\d+)\s*s\s*$/i;

const DAY_LINE = /^\**\s*(Day\s+\d+\b.*?)\s*\**$/i;

/**
 * Reads the numbered-line format back into sections, so a plan written before structure existed
 * still renders in the structured UI.
 *
 * A "Day N" heading starts a new section (multi-day plans are the one grouping the old format had).
 * Anything unparseable becomes section notes rather than being dropped - never lose a coach's words.
 */
export function parseDetails(details: string): SectionInput[] {
  const sections: SectionInput[] = [];
  let current: SectionInput | null = null;
  const start = (notes = "") => {
    current = { protocol: "Regular", sets: 1, restSec: 0, durationSec: null, notes, exercises: [] };
    sections.push(current);
    return current;
  };

  for (const raw of (details ?? "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;

    const day = DAY_LINE.exec(line);
    if (day && line.length <= 60) {
      start(day[1].replace(/\*+/g, "").trim());
      continue;
    }

    const m = EXERCISE_LINE.exec(line);
    if (m) {
      const section = current ?? start();
      const sets = Number(m[3]);
      const timed = m[5] !== undefined;
      // "12, 12, 10" -> [12, 12, 10]; "6" over 4 sets -> [6, 6, 6, 6]; "8-10" is not a number, so none.
      let repsPerSet: number[] = [];
      if (!timed && m[4]) {
        const each = m[4].split(",").map((r) => Number(r.trim()));
        if (each.length > 1 && each.every((r) => Number.isFinite(r))) repsPerSet = each;
        else if (each.length === 1 && Number.isFinite(each[0])) repsPerSet = Array.from({ length: sets }, () => each[0]);
      }
      const load = m[6] ? (/^bw$/i.test(m[6]) ? "bodyweight" : m[6].trim()) : "";
      section.exercises.push({
        exerciseId: null,
        name: m[2],
        repsPerSet,
        loadPerSet: load ? Array.from({ length: sets }, () => load) : [],
        // A rep range like "8-10" survives as a note, since the arrays only hold numbers.
        durationSec: timed ? Math.round(Number(m[5])) : null,
        distanceM: null,
        rpe: null,
        restSec: Number(m[7]),
        notes: !timed && m[4] && repsPerSet.length === 0 ? `${m[4]} reps` : "",
        recordFields: [],
      });
      continue;
    }

    // Prose: keep it as the section's notes.
    const section = current ?? start();
    section.notes = section.notes ? `${section.notes}\n${line}` : line;
  }
  return sections;
}

/** True when `details` holds at least one line the structured view can show. */
export const looksStructured = (details: string): boolean =>
  parseDetails(details).some((s) => s.exercises.length > 0);
