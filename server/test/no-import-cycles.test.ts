// No import cycles in server/src.
//
// WHY THIS EXISTS. On 15 Nov 2026 adding `import { clientToday } from "./clientTracking.js"` to
// routes/clients.ts created the cycle
//
//   routes/clients.ts -> routes/clientTracking.ts -> routes/measurements.ts -> routes/clients.ts
//
// With ES modules that is not an error, it is a TIMING bug: measurements.ts ran while clients.ts was
// still half-evaluated, so `asyncHandler` was `undefined` and every route that wrapped it threw
// "asyncHandler is not a function" at import time. 88 of 98 test files failed at once, and tsc was
// perfectly happy.
//
// The lesson, enforced here: a helper that two routers share belongs in a LEAF module, never in one
// of the routers.
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const srcDir = new URL("../src/", import.meta.url);

async function tsFiles(dir: URL, prefix = ""): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const out: string[] = [];
  for (const e of entries) {
    if (e.isDirectory()) out.push(...(await tsFiles(new URL(`${e.name}/`, dir), `${prefix}${e.name}/`)));
    else if (e.name.endsWith(".ts") && !e.name.endsWith(".d.ts")) out.push(prefix + e.name);
  }
  return out;
}

/** file -> the local files it imports, as paths relative to src/ with .ts endings. */
async function importGraph(): Promise<Map<string, string[]>> {
  const files = await tsFiles(srcDir);
  const known = new Set(files);
  const graph = new Map<string, string[]>();

  for (const file of files) {
    const code = await readFile(new URL(file, srcDir), "utf8");
    // Strip comments so an import named in prose is not counted.
    const clean = code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    const targets: string[] = [];
    for (const m of clean.matchAll(/(?:from|import)\s*["'](\.[^"']+)["']/g)) {
      // "./clientTracking.js" from "routes/clients.ts" -> "routes/clientTracking.ts"
      const resolved = path
        .posix
        .normalize(path.posix.join(path.posix.dirname(file), m[1]))
        .replace(/\.js$/, ".ts");
      if (known.has(resolved)) targets.push(resolved);
    }
    graph.set(file, [...new Set(targets)]);
  }
  return graph;
}

/** Every cycle in the graph, each as the list of files that form it. */
function findCycles(graph: Map<string, string[]>): string[][] {
  const cycles: string[][] = [];
  const seen = new Set<string>();
  const stack: string[] = [];
  const onStack = new Set<string>();

  const walk = (node: string) => {
    stack.push(node);
    onStack.add(node);
    for (const next of graph.get(node) ?? []) {
      if (onStack.has(next)) {
        // Record the cycle from where it starts on the stack.
        const cycle = stack.slice(stack.indexOf(next));
        const key = [...cycle].sort().join(" -> ");
        if (!seen.has(key)) {
          seen.add(key);
          cycles.push([...cycle, next]);
        }
      } else if (!stack.includes(next)) {
        walk(next);
      }
    }
    stack.pop();
    onStack.delete(node);
  };

  for (const node of graph.keys()) walk(node);
  return cycles;
}

describe("server/src has no import cycles", () => {
  it("finds no cycle", async () => {
    const cycles = await importGraph().then(findCycles);
    // Printed as a readable chain so a failure names the exact loop to break.
    expect(cycles.map((c) => c.join(" -> "))).toEqual([]);
  });

  it("the detector really would notice one", async () => {
    // Guards the guard: a graph builder that silently parses nothing would make this useless.
    const graph = await importGraph();
    expect(graph.size).toBeGreaterThan(30);
    expect(graph.get("routes/clients.ts")?.length).toBeGreaterThan(0);
    // A hand-made cycle must be caught.
    const fake = new Map<string, string[]>([
      ["a.ts", ["b.ts"]],
      ["b.ts", ["c.ts"]],
      ["c.ts", ["a.ts"]],
    ]);
    expect(findCycles(fake)).toHaveLength(1);
    // And a plain chain must not be.
    expect(findCycles(new Map([["a.ts", ["b.ts"]], ["b.ts", []]]))).toEqual([]);
  });

  it("the helper two routers share lives in a leaf", async () => {
    // clientToday is used by routes/clients.ts and routes/clientTracking.ts; it must not live in
    // either of them.
    const graph = await importGraph();
    expect(graph.get("clients/snapshot.ts")).toEqual([]);
  });
});
