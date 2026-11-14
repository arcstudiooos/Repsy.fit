// The CSV export descriptions must match what the CSV actually contains (Inspo C4, Nov 2026).
//
// Each export card in client/src/components/Reports.tsx now tells the coach what is inside the file.
// A promise in the UI that the CSV quietly stopped keeping is worse than no promise at all, so this
// reads both and checks they still agree: every column is spoken for, and nothing is advertised that
// the export does not carry.
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { CSV_COLUMNS } from "../src/csv.js";

const reportsUrl = new URL("../../client/src/components/Reports.tsx", import.meta.url);

/** The words each export card promises, keyed by export type. */
async function descriptions(): Promise<Record<string, string>> {
  const source = await readFile(reportsUrl, "utf8");
  const block = /const EXPORTS[\s\S]*?\n\];/.exec(source);
  if (!block) throw new Error("EXPORTS not found in Reports.tsx");
  const out: Record<string, string> = {};
  for (const m of block[0].matchAll(/type:\s*"(\w+)"[\s\S]*?description:\s*\n?\s*"([^"]+)"/g)) {
    out[m[1]] = m[2].toLowerCase();
  }
  return out;
}

/** Human words that stand for a CSV column name. */
const SPOKEN_FOR: Record<string, string[]> = {
  date: ["date", "day", "by date"],
  paidOn: ["when", "date"],
  weightKg: ["weight"],
  adherence: ["adherence"],
  workoutsDone: ["workouts done"],
  note: ["note"],
  waistCm: ["waist"],
  chestCm: ["chest"],
  armCm: ["arm"],
  hipCm: ["hip"],
  bodyFatPercent: ["body fat"],
  amount: ["what they paid", "amount"],
  method: ["method"],
  type: ["type"],
  title: ["title"],
  details: ["details"],
  reasoning: ["why", "reasoning"],
  source: ["type", "source"],
  status: ["done", "status"],
};

describe("the export cards describe the real CSV", () => {
  it("has a description for every client export", async () => {
    const said = await descriptions();
    for (const type of ["progress", "measurements", "payments", "assignments"]) {
      expect(said[type], `no description for the ${type} export`).toBeTruthy();
      expect(said[type].length).toBeGreaterThan(20);
    }
  });

  it("every column in the CSV is mentioned by its card", async () => {
    const said = await descriptions();
    const missing: string[] = [];
    for (const type of ["progress", "measurements", "payments", "assignments"] as const) {
      for (const column of CSV_COLUMNS[type]) {
        const words = SPOKEN_FOR[column] ?? [column.toLowerCase()];
        if (!words.some((w) => said[type].includes(w))) missing.push(`${type}: "${column}"`);
      }
    }
    // A column the card never mentions is a surprise in the coach's spreadsheet.
    expect(missing).toEqual([]);
  });

  it("the checker really would notice an unmentioned column", async () => {
    // Guards the guard: if the parser returned nothing, the test above would pass vacuously.
    const said = await descriptions();
    expect(Object.keys(said).sort()).toEqual(["assignments", "measurements", "payments", "progress"]);
    expect(said.progress).toContain("weight");
    // A column with no matching words must be reported.
    const pretend = { progress: "just the dates" };
    const unmatched = CSV_COLUMNS.progress.filter((c) => {
      const words = SPOKEN_FOR[c] ?? [c.toLowerCase()];
      return !words.some((w) => pretend.progress.includes(w));
    });
    expect(unmatched.length).toBeGreaterThan(0);
  });

  it("no card promises a measurement the CSV does not carry", async () => {
    const said = await descriptions();
    // Measurements are cm + body fat %: if a card started promising "sleep" or "steps", say so.
    for (const notThere of ["sleep", "steps", "calories", "heart rate"]) {
      expect(said.measurements, `measurements card promises "${notThere}"`).not.toContain(notThere);
    }
  });
});
