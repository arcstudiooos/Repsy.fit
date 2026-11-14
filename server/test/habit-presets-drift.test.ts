// The habit preset library must not drift between client and server (Inspo C3, Nov 2026).
//
// The client carries its own copy so the picker opens instantly with no round trip. That is only
// safe while the two lists are identical - a preset whose days differ would set a recurrence the
// coach did not choose. Same convention as PROTOCOLS, RECORD_FIELDS and the meal categories.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { HABIT_CATEGORIES, HABIT_PRESETS } from "../src/habitPresets.js";

const clientTypes = readFileSync(new URL("../../client/src/types.ts", import.meta.url), "utf8");

/** Pulls `name`, `category` and `days` out of the client's copy, resolving its EVERY / WEEKDAYS aliases. */
function clientPresets() {
  const block = clientTypes.slice(clientTypes.indexOf("export const HABIT_PRESETS"));
  const body = block.slice(0, block.indexOf("\n];"));
  const rows = [...body.matchAll(/\{\s*name:\s*"([^"]+)",\s*category:\s*"([^"]+)",\s*days:\s*([^}]+?)\s*\}/g)];
  return rows.map(([, name, category, days]) => {
    const resolved = days.trim() === "EVERY" ? [0, 1, 2, 3, 4, 5, 6] : days.trim() === "WEEKDAYS" ? [1, 2, 3, 4, 5] : JSON.parse(days);
    return { name, category, days: resolved };
  });
}

describe("habit presets: client and server agree", () => {
  it("finds the client's copy at all", () => {
    expect(clientPresets().length).toBeGreaterThan(0);
  });

  it("holds the same presets, in the same order, with the same days", () => {
    expect(clientPresets()).toEqual(HABIT_PRESETS.map((p) => ({ name: p.name, category: p.category, days: p.days })));
  });

  it("holds the same categories, in the same order", () => {
    const listed = clientTypes.match(/export const HABIT_CATEGORIES = \[([^\]]+)\]/);
    expect(listed).not.toBeNull();
    const names = [...(listed?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    expect(names).toEqual([...HABIT_CATEGORIES]);
  });
});
