// Landing performance budget and bundle guard (Prompt 37). Runs after `vite build`.
// Fails the build when:
//  - Three.js / @react-three / gsap is reachable from the first page load or from /app
//    without a dynamic import (they must live in their own lazy chunks), or
//  - the first-load JS (entry + its static imports) exceeds the budget.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const dist = path.resolve(import.meta.dirname, "../dist");
const manifest = JSON.parse(fs.readFileSync(path.join(dist, ".vite/manifest.json"), "utf8"));

const BUDGET_FIRST_LOAD_GZ_KB = 90; // entry chunk + static imports, gzipped
const BUDGET_APP_GZ_KB = 220; // everything /app loads (entry + App chunk), gzipped; v1 was ~209 KB
const HEAVY = /three|react-three|gsap/i;

const entryKey = Object.keys(manifest).find((k) => manifest[k].isEntry);
const byKey = (k) => manifest[k];
function staticClosure(key, seen = new Set()) {
  if (seen.has(key)) return seen;
  seen.add(key);
  for (const imp of byKey(key).imports ?? []) staticClosure(imp, seen);
  return seen;
}
const gz = (file) => zlib.gzipSync(fs.readFileSync(path.join(dist, file))).length;
const errors = [];

// 1. First load (entry) must not pull in heavy 3D / animation code.
const first = [...staticClosure(entryKey)];
for (const k of first) if (HEAVY.test(k) || HEAVY.test(byKey(k).file)) errors.push(`first load includes ${k}`);
const firstKb = first.reduce((n, k) => n + gz(byKey(k).file), 0) / 1024;

// 2. The /app chunk (src/App.tsx) must not statically include heavy code.
const appKey = Object.keys(manifest).find((k) => k.endsWith("src/App.tsx"));
if (!appKey) errors.push("no separate chunk for src/App.tsx");
else for (const k of staticClosure(appKey)) if (HEAVY.test(k) || HEAVY.test(byKey(k).file)) errors.push(`/app includes ${k}`);

// 3. The 3D code must be its own chunk.
const threeKey = Object.keys(manifest).find((k) => k.endsWith("src/landing/three/HeroCanvas.tsx"));
if (!threeKey) errors.push("no separate chunk for the 3D hero (src/landing/three/HeroCanvas.tsx)");

const appKb = appKey ? [...new Set([...first, ...staticClosure(appKey)])].reduce((n, k) => n + gz(byKey(k).file), 0) / 1024 : 0;
if (appKb > BUDGET_APP_GZ_KB) errors.push(`/app loads ${appKb.toFixed(1)} KB gz > budget ${BUDGET_APP_GZ_KB} KB`);
if (firstKb > BUDGET_FIRST_LOAD_GZ_KB) errors.push(`first load ${firstKb.toFixed(1)} KB gz > budget ${BUDGET_FIRST_LOAD_GZ_KB} KB`);

const threeFiles = threeKey ? [...staticClosure(threeKey)].filter((k) => !first.includes(k)) : [];
const threeKb = threeFiles.reduce((n, k) => n + gz(byKey(k).file), 0) / 1024;
console.log(`budget: first load ${firstKb.toFixed(1)} KB gz (budget ${BUDGET_FIRST_LOAD_GZ_KB}), /app ${appKb.toFixed(1)} KB gz (budget ${BUDGET_APP_GZ_KB}), 3D chunk(s) ${threeKb.toFixed(1)} KB gz, lazy`);
if (errors.length) {
  console.error("Bundle guard FAILED:\n - " + errors.join("\n - "));
  process.exit(1);
}
console.log("Bundle guard OK: 3D code is in its own lazy chunk and not in /app or the first load.");
