// Prompt 76 against a real database: two coaches get different codes, a lookup ignores letter case,
// and a regenerated code frees the old one. Skipped when DATABASE_URL is not set (runs in CI).
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { prisma } from "../src/db.js";
import { asCoach } from "./helpers/authedRequest.js";

const stamp = Date.now();
const emails = [`join-a-${stamp}@example.com`, `join-b-${stamp}@example.com`];

describe.skipIf(!process.env.DATABASE_URL)("join codes (database)", () => {
  afterAll(async () => {
    await prisma.coach.deleteMany({ where: { email: { in: emails } } });
    await prisma.$disconnect();
  });

  it("gives each coach their own code and looks it up in any case", async () => {
    const [a, b] = await Promise.all(
      emails.map((email, i) => prisma.coach.create({ data: { email, name: i ? "Bea" : "Anna", passwordHash: "x" } })),
    );
    // Two first requests at once still give one code (the conditional write in assignNewCode).
    const [r1, r2] = await Promise.all([asCoach(app, a.id).get("/api/join-code"), asCoach(app, a.id).get("/api/join-code")]);
    expect(r1.body.code).toBe(r2.body.code);
    const ca = r1.body.code as string;
    const cb = (await asCoach(app, b.id).get("/api/join-code")).body.code as string;
    expect(ca).toMatch(/^ANNA-/);
    expect(cb).toMatch(/^BEAX-/);
    expect(ca).not.toBe(cb);
    expect((await prisma.coach.findUnique({ where: { id: a.id } }))?.joinCode).toBe(ca);

    const lower = await request(app).get(`/api/join/${ca.toLowerCase()}`);
    expect(lower.body).toEqual({ coachName: "Anna" });

    const fresh = (await asCoach(app, a.id).post("/api/join-code/regenerate")).body.code as string;
    expect(fresh).not.toBe(ca);
    expect((await request(app).get(`/api/join/${ca}`)).status).toBe(404);
    expect((await request(app).get(`/api/join/${fresh}`)).body).toEqual({ coachName: "Anna" });

    await asCoach(app, a.id).patch("/api/join-code").send({ active: false });
    expect((await request(app).get(`/api/join/${fresh}`)).status).toBe(404);
  });
});
