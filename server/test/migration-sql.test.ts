// Every migration's SQL must be syntactically sane (Nov 2026).
//
// WHY THIS EXISTS: a seed migration that ends a VALUES list with a trailing comma fails with
// Postgres 42601 ("syntax error at or near ON"), and because the Render start command is
// `prisma migrate deploy && node dist/index.js`, a migration that cannot apply stops the server
// ENTIRELY. CI catches it, but only after a full build - and the mistake is invisible on review.
//
// It happened for real: removing duplicate rows from a seed batch left the last remaining row
// carrying its comma. These checks run in milliseconds against every migration, forever.
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const DIR = new URL("../prisma/migrations/", import.meta.url);

function migrations(): { name: string; sql: string }[] {
  return readdirSync(DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => ({
      name: e.name,
      sql: readFileSync(new URL(`${e.name}/migration.sql`, DIR), "utf8"),
    }));
}

/** Strips quoted strings and comments so punctuation INSIDE a recipe or cue is never mistaken for SQL. */
function skeleton(sql: string): string {
  return sql
    .replace(/--[^\n]*/g, "")
    .replace(/'(?:[^']|'')*'/g, "''");
}

describe("migration SQL", () => {
  const all = migrations();

  it("finds the migrations at all (a passing-but-empty guard is worthless)", () => {
    expect(all.length).toBeGreaterThan(25);
  });

  it.each(all.map((m) => [m.name, m] as const))("%s has no trailing comma before ON CONFLICT or ;", (_name, m) => {
    const bare = skeleton(m.sql);
    expect(bare).not.toMatch(/,\s*ON CONFLICT/i);
    expect(bare).not.toMatch(/,\s*;/);
  });

  it.each(all.map((m) => [m.name, m] as const))("%s has balanced single quotes", (_name, m) => {
    // After removing every well-formed quoted string, no stray quote may remain.
    expect(skeleton(m.sql).replace(/''/g, "")).not.toContain("'");
  });

  it.each(all.map((m) => [m.name, m] as const))("%s has balanced parentheses", (_name, m) => {
    const bare = skeleton(m.sql);
    const open = (bare.match(/\(/g) ?? []).length;
    const close = (bare.match(/\)/g) ?? []).length;
    expect(open).toBe(close);
  });

  it.each(all.map((m) => [m.name, m] as const))("%s ends each statement with a semicolon", (_name, m) => {
    const bare = skeleton(m.sql).trim();
    if (bare === "") return;
    expect(bare.endsWith(";")).toBe(true);
  });
});
