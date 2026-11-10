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

  // No client API endpoints exist yet, so these two go through Prisma directly.
  // Switch them to HTTP (Supertest) tests when the client endpoints are built.
  it("create client works", async () => {
    const client = await prisma.client.create({ data: { name: "Smoke Test Client" } });
    createdIds.push(client.id);
    expect(client.id).toBeTruthy();
    expect(client.name).toBe("Smoke Test Client");
    expect(client.goal).toBe("General fitness");
    expect(client.level).toBe("Beginner");
  });

  it("list clients works", async () => {
    const clients = await prisma.client.findMany();
    expect(Array.isArray(clients)).toBe(true);
    expect(clients.some((c) => c.id === createdIds[0])).toBe(true);
  });
});
