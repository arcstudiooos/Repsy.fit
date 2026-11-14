// The Prisma schema and the migration SQL must describe the same tables.
//
// WHY THIS EXISTS. On 15 Nov 2026 the structured-workout release passed 954 unit tests, CI, and
// `check-migration`, then 500'd on every read in production. Cause: a find-and-replace added
// `sections WorkoutSection[]` to three models instead of one (the anchor text was identical in
// Assignment, ChatMessage and ProgressLog), and `prisma format` then helpfully added the reciprocal
// foreign keys `chatMessageId` / `progressLogId` to WorkoutSection. Those two columns existed in
// the schema and in the generated client, but no migration ever created them - so every SELECT and
// INSERT referenced a column that was not there, while `deleteMany` (which names no columns) kept
// working and hid the problem.
//
// Mocked tests cannot catch that: they mock Prisma. This reads both files as text and compares them.
import { readFile, readdir } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const schemaUrl = new URL("../prisma/schema.prisma", import.meta.url);
const migrationsUrl = new URL("../prisma/migrations/", import.meta.url);

/** Every column name the migrations create or add, per table. */
async function columnsFromMigrations(): Promise<Map<string, Set<string>>> {
  const dirs = (await readdir(migrationsUrl, { withFileTypes: true }))
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  const tables = new Map<string, Set<string>>();
  const add = (table: string, column: string) => {
    if (!tables.has(table)) tables.set(table, new Set());
    tables.get(table)!.add(column);
  };

  for (const dir of dirs) {
    const sql = await readFile(new URL(`${dir}/migration.sql`, migrationsUrl), "utf8");
    // Strip comments so a column named in prose is never counted.
    const code = sql.replace(/--[^\n]*/g, "");

    // CREATE TABLE "x" ( "a" TEXT, "b" INTEGER, CONSTRAINT ... )
    for (const m of code.matchAll(/CREATE TABLE\s+"([^"]+)"\s*\(([\s\S]*?)\n\)\s*;/gi)) {
      const [, table, body] = m;
      for (const line of body.split("\n")) {
        const col = /^\s*"([^"]+)"\s+\S/.exec(line);
        if (col) add(table, col[1]);
      }
    }
    // ALTER TABLE "x" ADD COLUMN "y"
    for (const m of code.matchAll(/ALTER TABLE\s+"([^"]+)"\s+ADD COLUMN\s+(?:IF NOT EXISTS\s+)?"([^"]+)"/gi)) {
      add(m[1], m[2]);
    }
    // ALTER TABLE "x" DROP COLUMN "y"
    for (const m of code.matchAll(/ALTER TABLE\s+"([^"]+)"\s+DROP COLUMN\s+(?:IF EXISTS\s+)?"([^"]+)"/gi)) {
      tables.get(m[1])?.delete(m[2]);
    }
    // ALTER TABLE "x" RENAME COLUMN "a" TO "b"
    for (const m of code.matchAll(/ALTER TABLE\s+"([^"]+)"\s+RENAME COLUMN\s+"([^"]+)"\s+TO\s+"([^"]+)"/gi)) {
      tables.get(m[1])?.delete(m[2]);
      add(m[1], m[3]);
    }
    // DROP TABLE "x"
    for (const m of code.matchAll(/DROP TABLE\s+(?:IF EXISTS\s+)?"([^"]+)"/gi)) {
      tables.delete(m[1]);
    }
    // ALTER TABLE "x" RENAME TO "y"
    for (const m of code.matchAll(/ALTER TABLE\s+"([^"]+)"\s+RENAME TO\s+"([^"]+)"/gi)) {
      const old = tables.get(m[1]);
      if (old) {
        tables.set(m[2], old);
        tables.delete(m[1]);
      }
    }
  }
  return tables;
}

/** Scalar columns each Prisma model expects, keyed by its table name. */
async function columnsFromSchema(): Promise<Map<string, { model: string; columns: Set<string> }>> {
  const schema = await readFile(schemaUrl, "utf8");
  const out = new Map<string, { model: string; columns: Set<string> }>();

  for (const m of schema.matchAll(/model\s+(\w+)\s*\{([\s\S]*?)\n\}/g)) {
    const [, model, body] = m;
    const mapped = /@@map\("([^"]+)"\)/.exec(body);
    const table = mapped ? mapped[1] : model;
    const columns = new Set<string>();

    for (const raw of body.split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("//") || line.startsWith("///") || line.startsWith("@@")) continue;
      const field = /^(\w+)\s+(\S+)/.exec(line);
      if (!field) continue;
      const [, name, type] = field;
      // A list of another model is a virtual relation, not a column.
      if (type.endsWith("[]") && /^[A-Z]/.test(type)) continue;
      // An object relation is virtual too; its scalar `@relation(fields: [...])` is the real column.
      if (/^[A-Z]/.test(type.replace(/[?[\]]/g, "")) && !/^(String|Int|Float|Boolean|DateTime|Json|Decimal|BigInt|Bytes)/.test(type)) {
        continue;
      }
      // Respect an explicit column name.
      const named = /@map\("([^"]+)"\)/.exec(line);
      columns.add(named ? named[1] : name);
    }
    out.set(table, { model, columns });
  }
  return out;
}

describe("the Prisma schema matches the migrations", () => {
  it("every column a model expects is created by a migration", async () => {
    const fromMigrations = await columnsFromMigrations();
    const fromSchema = await columnsFromSchema();
    const problems: string[] = [];

    for (const [table, { model, columns }] of fromSchema) {
      const actual = fromMigrations.get(table);
      if (!actual) {
        problems.push(`model ${model}: no migration creates table "${table}"`);
        continue;
      }
      for (const column of columns) {
        if (!actual.has(column)) problems.push(`model ${model}: "${table}"."${column}" is in the schema but no migration creates it`);
      }
    }
    expect(problems).toEqual([]);
  });

  it("every table a migration creates is still described by a model", async () => {
    const fromMigrations = await columnsFromMigrations();
    const fromSchema = await columnsFromSchema();
    // Prisma's own bookkeeping table has no model.
    const ignore = new Set(["_prisma_migrations"]);
    const orphans = [...fromMigrations.keys()].filter((t) => !ignore.has(t) && !fromSchema.has(t));
    expect(orphans).toEqual([]);
  });

  it("the checker really would notice a missing column", async () => {
    // Guards the guard: a parser that silently matches nothing would make this suite useless.
    const fromMigrations = await columnsFromMigrations();
    expect(fromMigrations.get("workout_sections")?.has("protocol")).toBe(true);
    expect(fromMigrations.get("workout_exercises")?.has("repsPerSet")).toBe(true);
    expect(fromMigrations.get("exercises")?.has("muscleGroup")).toBe(true);
    expect(fromMigrations.get("coaches")?.has("units")).toBe(true);
    // The two phantom columns from the 15 Nov 2026 incident must not come back.
    expect(fromMigrations.get("workout_sections")?.has("chatMessageId")).toBe(false);
    const fromSchema = await columnsFromSchema();
    expect(fromSchema.get("workout_sections")?.columns.has("chatMessageId")).toBe(false);
    expect(fromSchema.get("workout_sections")?.columns.has("progressLogId")).toBe(false);
  });

  it("WorkoutSection is related to Assignment only", async () => {
    // The incident started as one relation field copied into three models.
    const schema = await readFile(schemaUrl, "utf8");
    const owners = [...schema.matchAll(/model\s+(\w+)\s*\{([\s\S]*?)\n\}/g)]
      .filter(([, , body]) => /\n\s*\w+\s+WorkoutSection\[\]/.test(body))
      .map(([, model]) => model);
    expect(owners).toEqual(["Assignment"]);
  });
});
