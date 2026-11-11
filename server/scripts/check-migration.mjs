// Prompt 43 "You test", automated for CI: the coach migration runs on
//   1. a fresh, empty database, and
//   2. a copy that already holds v1 demo data ('default-coach' rows from before Prompt 43):
//      every row survives, counts match before and after, and coachId becomes NULL (unclaimed).
// Uses two throwaway Postgres schemas in the CI database (DATABASE_URL), then drops them.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const NEW = "20261111090000_add_coaches";
const server = path.resolve(import.meta.dirname, "..");
const base = process.env.DATABASE_URL;
if (!base) {
  console.log("check-migration: DATABASE_URL not set, skipped");
  process.exit(0);
}
const urlFor = (schema) => `${base}${base.includes("?") ? "&" : "?"}schema=${schema}`;
const deploy = (schemaFile, url) =>
  execFileSync("npx", ["prisma", "migrate", "deploy", "--schema", schemaFile], { cwd: server, env: { ...process.env, DATABASE_URL: url }, stdio: "inherit", shell: process.platform === "win32" });
const db = (url) => new PrismaClient({ datasourceUrl: url });
const fail = (msg) => {
  console.error("check-migration FAILED: " + msg);
  process.exitCode = 1;
};

// 1. Fresh database.
{
  const url = urlFor("mig_fresh");
  const p = db(url);
  await p.$executeRawUnsafe('DROP SCHEMA IF EXISTS "mig_fresh" CASCADE');
  deploy("prisma/schema.prisma", url);
  const tables = await p.$queryRawUnsafe(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'mig_fresh' ORDER BY 1`);
  const names = tables.map((t) => t.table_name);
  for (const t of ["coaches", "clients", "assignments", "progress_logs", "chat_messages", "leads"]) if (!names.includes(t)) fail(`fresh: table ${t} missing`);
  await p.$executeRawUnsafe('DROP SCHEMA "mig_fresh" CASCADE');
  await p.$disconnect();
  console.log("check-migration: fresh database OK");
}

// 2. Database with demo data from before Prompt 43.
{
  const url = urlFor("mig_demo");
  const p = db(url);
  await p.$executeRawUnsafe('DROP SCHEMA IF EXISTS "mig_demo" CASCADE');
  // Apply every migration EXCEPT the new one, from a temporary copy of the prisma folder.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mig-"));
  fs.copyFileSync(path.join(server, "prisma/schema.prisma"), path.join(tmp, "schema.prisma"));
  fs.cpSync(path.join(server, "prisma/migrations"), path.join(tmp, "migrations"), { recursive: true });
  // Drop the coach migration AND every later one (they depend on it), keeping the v1 state.
  for (const dir of fs.readdirSync(path.join(tmp, "migrations"))) {
    if (/^\d{14}_/.test(dir) && dir >= NEW) fs.rmSync(path.join(tmp, "migrations", dir), { recursive: true });
  }
  deploy(path.join(tmp, "schema.prisma"), url);

  const q = (sql) => p.$executeRawUnsafe(sql);
  for (let i = 0; i < 3; i++) {
    await q(`INSERT INTO "mig_demo"."clients" ("id","name") VALUES ('c${i}','Demo ${i}')`);
    await q(`INSERT INTO "mig_demo"."assignments" ("id","clientId","type","title","details","date") VALUES ('a${i}','c${i}','Workout','Plan','1. Back Squat','2026-11-0${i + 1}')`);
    await q(`INSERT INTO "mig_demo"."progress_logs" ("id","clientId","date","weightKg") VALUES ('p${i}','c${i}','2026-11-0${i + 1}',70)`);
    await q(`INSERT INTO "mig_demo"."chat_messages" ("id","clientId","role","content") VALUES ('m${i}','c${i}','coach','Hi')`);
  }
  await q(`INSERT INTO "mig_demo"."leads" ("id","name","email") VALUES ('l0','Lead','lead@example.com')`);
  const count = async () => {
    const out = {};
    for (const t of ["clients", "assignments", "progress_logs", "chat_messages", "leads"]) {
      out[t] = Number((await p.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "mig_demo"."${t}"`))[0].n);
    }
    return out;
  };
  const before = await count();
  const placeholder = Number((await p.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "mig_demo"."clients" WHERE "coachId" = 'default-coach'`))[0].n);
  if (placeholder !== 3) fail(`demo: expected 3 'default-coach' clients before, got ${placeholder}`);

  deploy("prisma/schema.prisma", url); // applies the coach migration and every later one
  const after = await count();
  if (JSON.stringify(before) !== JSON.stringify(after)) fail(`demo: counts changed ${JSON.stringify(before)} -> ${JSON.stringify(after)}`);
  for (const t of ["clients", "assignments", "progress_logs", "chat_messages"]) {
    const nonNull = Number((await p.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "mig_demo"."${t}" WHERE "coachId" IS NOT NULL`))[0].n);
    if (nonNull !== 0) fail(`demo: ${t} still has ${nonNull} rows with a coachId`);
  }
  const coaches = Number((await p.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "mig_demo"."coaches"`))[0].n);
  if (coaches !== 0) fail(`demo: migration created ${coaches} coach rows (must create none)`);
  console.log(`check-migration: demo data survived, counts before = after = ${JSON.stringify(after)}`);
  await p.$executeRawUnsafe('DROP SCHEMA "mig_demo" CASCADE');
  await p.$disconnect();
  fs.rmSync(tmp, { recursive: true, force: true });
}
if (process.exitCode) process.exit(1);
console.log("check-migration: OK");
