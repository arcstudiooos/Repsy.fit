// The backup list must name every model in the schema (Nov 2026).
//
// This is the test that stops a backup from silently missing a table. Adding a model to
// schema.prisma without adding it to MODELS means the next backup omits it, and nobody finds out
// until a restore comes up short - which is exactly the moment you cannot afford a surprise.
//
// Runs without a database, so it bites on every push.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MODELS } from "../scripts/backup.mjs";

/** Prisma delegates are the model name with a lowercase first letter. */
const delegateName = (model: string) => model[0].toLowerCase() + model.slice(1);

function schemaModels(): string[] {
  const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
  return [...schema.matchAll(/^model\s+(\w+)\s*\{/gm)].map((m) => delegateName(m[1]));
}

describe("the backup covers the whole schema", () => {
  it("names every model in schema.prisma", () => {
    const missing = schemaModels().filter((m) => !MODELS.includes(m));
    expect(
      missing,
      `These models are in the schema but not in scripts/backup.mjs MODELS, so a backup would silently skip them: ${missing.join(", ")}`,
    ).toEqual([]);
  });

  it("names nothing that is not a model", () => {
    const schema = schemaModels();
    expect(MODELS.filter((m) => !schema.includes(m))).toEqual([]);
  });

  it("lists each model exactly once", () => {
    expect(MODELS).toHaveLength(new Set(MODELS).size);
  });

  it("puts coach and client first, because a restore inserts parents before children", () => {
    expect(MODELS[0]).toBe("coach");
    expect(MODELS[1]).toBe("client");
    // Children of an assignment must come after it, or a foreign key blocks the insert.
    expect(MODELS.indexOf("workoutSection")).toBeGreaterThan(MODELS.indexOf("assignment"));
    expect(MODELS.indexOf("workoutExercise")).toBeGreaterThan(MODELS.indexOf("workoutSection"));
    expect(MODELS.indexOf("programPhase")).toBeGreaterThan(MODELS.indexOf("program"));
    expect(MODELS.indexOf("programItem")).toBeGreaterThan(MODELS.indexOf("programPhase"));
    expect(MODELS.indexOf("habitLog")).toBeGreaterThan(MODELS.indexOf("habit"));
    expect(MODELS.indexOf("formSubmission")).toBeGreaterThan(MODELS.indexOf("form"));
  });
});
