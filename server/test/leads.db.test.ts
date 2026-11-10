// Prompt 41 "You test" against a real database: a new email is saved (row exists), the same
// email again (any case) gets "You are already on the list." and adds no row.
// Skipped when DATABASE_URL is not set (runs in CI).
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { prisma } from "../src/db.js";

const email = `lead-test-${Date.now()}@example.com`;

describe.skipIf(!process.env.DATABASE_URL)("leads (database)", () => {
  afterAll(async () => {
    await prisma.lead.deleteMany({ where: { email } });
    await prisma.$disconnect();
  });

  it("saves a lead once; a duplicate is a friendly 409", async () => {
    const first = await request(app).post("/api/leads").send({ name: "Test Coach", email });
    expect(first.status).toBe(201);
    expect(await prisma.lead.count({ where: { email } })).toBe(1);

    const again = await request(app).post("/api/leads").send({ name: "Test Coach", email: email.toUpperCase() });
    expect(again.status).toBe(409);
    expect(again.body).toEqual({ error: "You are already on the list." });
    expect(await prisma.lead.count({ where: { email } })).toBe(1);

    const bad = await request(app).post("/api/leads").send({ name: "X", email: "nope" });
    expect(bad.status).toBe(400);
  });
});
