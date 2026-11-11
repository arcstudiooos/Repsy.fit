// Prompt 44 against a real database: first registration claims demo data, later ones don't,
// and the full register -> me -> logout -> me flow works over HTTP. Skipped without DATABASE_URL.
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.SESSION_SECRET ??= "test-secret-test-secret-test-secret";

import { app } from "../src/app.js";
import { resetRateLimits } from "../src/auth/rateLimit.js";
import { prisma } from "../src/db.js";

const tag = `auth44-${Date.now()}`;
const url = process.env.DATABASE_URL ?? "";
// Deletes every coach and unclaimed data: never run against Render.
const isRenderDb = /render\.com|dpg-/.test(url);
const cookieOf = (res: request.Response) => ((res.headers["set-cookie"] as unknown as string[]) ?? [])[0]?.split(";")[0];

describe.skipIf(!url || isRenderDb)("auth API (database)", () => {
  beforeAll(async () => {
    resetRateLimits();
    await prisma.coach.deleteMany({});
    await prisma.client.deleteMany({ where: { coachId: null } });
  });
  afterAll(async () => {
    await prisma.coach.deleteMany({});
    await prisma.client.deleteMany({ where: { name: { startsWith: tag } } });
    await prisma.$disconnect();
  });

  it("first registration claims demo data; second starts empty; duplicate email is refused", async () => {
    await prisma.client.create({ data: { name: `${tag} Maya` } });
    const first = await request(app).post("/api/auth/register").send({ name: "First", email: `${tag}-1@example.com`, password: "0123456789" });
    expect(first.status).toBe(201);
    expect(first.body.passwordHash).toBeUndefined();
    const claimed = await prisma.client.findFirst({ where: { name: `${tag} Maya` } });
    expect(claimed?.coachId).toBe(first.body.id);

    await prisma.client.create({ data: { name: `${tag} Later` } });
    const second = await request(app).post("/api/auth/register").send({ name: "Second", email: `${tag}-2@example.com`, password: "0123456789" });
    expect(second.status).toBe(201);
    expect(await prisma.client.count({ where: { coachId: second.body.id } })).toBe(0);
    expect(await prisma.client.count({ where: { name: `${tag} Later`, coachId: null } })).toBe(1);

    const dup = await request(app).post("/api/auth/register").send({ name: "Dup", email: `${tag}-1@EXAMPLE.com`, password: "0123456789" });
    expect(dup.status).toBe(409);
    expect(dup.body).toEqual({ error: "That email is already registered." });
  });

  it("register, login, /me, logout, /me again (401); wrong password gives no session", async () => {
    const email = `${tag}-flow@example.com`;
    await request(app).post("/api/auth/register").send({ name: "Flow", email, password: "0123456789" });

    const bad = await request(app).post("/api/auth/login").send({ email, password: "not-the-password" });
    expect(bad.status).toBe(401);
    expect(cookieOf(bad)).toBeUndefined();

    const login = await request(app).post("/api/auth/login").send({ email, password: "0123456789" });
    expect(login.status).toBe(200);
    const cookie = cookieOf(login);
    const me = await request(app).get("/api/auth/me").set("Cookie", cookie);
    expect(me.status).toBe(200);
    expect(me.body.email).toBe(email);
    expect(me.body.passwordHash).toBeUndefined();

    expect((await request(app).post("/api/auth/logout").set("Cookie", cookie)).status).toBe(204);
    expect((await request(app).get("/api/auth/me")).status).toBe(401);
  });
});
