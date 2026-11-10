// Minimal smoke tests. Not a full test suite.
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { prisma } from "../src/db.js";

const createdIds: string[] = [];

afterAll(async () => {
  // Remove anything these tests created, then close the connection.
  await prisma.client.deleteMany({ where: { id: { in: createdIds } } });
  await prisma.$disconnect();
});

describe("smoke", () => {
  it("health check works", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("database is connected", async () => {
    expect(process.env.DATABASE_URL, "DATABASE_URL must be set").toBeTruthy();
    const rows = await prisma.$queryRaw<{ ok: number }[]>`SELECT 1 AS ok`;
    expect(rows[0].ok).toBe(1);
  });

  it("create client works", async () => {
    const res = await request(app).post("/api/clients").send({ name: "Smoke Test Client" });
    expect(res.status).toBe(201);
    createdIds.push(res.body.id);
    expect(res.body.id).toBeTruthy();
    expect(res.body.name).toBe("Smoke Test Client");
    expect(res.body.goal).toBe("General fitness");
    expect(res.body.level).toBe("Beginner");
    expect(res.body.coachId).toBe("default-coach");
  });

  it("list clients works", async () => {
    const res = await request(app).get("/api/clients");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.some((c: { id: string }) => c.id === createdIds[0])).toBe(true);
  });
});
