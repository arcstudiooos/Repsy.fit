// POST /api/leads (Prompt 41). Prisma is mocked, so these run without a database.
import request from "supertest";
import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { prisma } = vi.hoisted(() => ({ prisma: { lead: { create: vi.fn() } } }));
vi.mock("../src/db.js", () => ({ prisma }));

import { app } from "../src/app.js";

beforeEach(() => {
  vi.clearAllMocks();
  prisma.lead.create.mockImplementation(async ({ data }: { data: { name: string; email: string } }) => ({
    id: "lead-1",
    createdAt: new Date("2026-11-10T00:00:00.000Z"),
    ...data,
  }));
});

describe("POST /api/leads", () => {
  it("saves name + email (trimmed, email lower-cased) and returns 201", async () => {
    const res = await request(app).post("/api/leads").send({ name: "  Priya Coach ", email: " Priya@Example.COM " });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ id: "lead-1", name: "Priya Coach", email: "priya@example.com" });
    expect(prisma.lead.create).toHaveBeenCalledWith({ data: { name: "Priya Coach", email: "priya@example.com" } });
  });

  it("stores nothing else, even if sent (no password, no payment fields)", async () => {
    await request(app).post("/api/leads").send({ name: "A", email: "a@b.co", password: "x", card: "4242" });
    expect(prisma.lead.create).toHaveBeenCalledWith({ data: { name: "A", email: "a@b.co" } });
  });

  it.each([
    ["missing name", { email: "a@b.co" }, "Please enter your name."],
    ["blank name", { name: "   ", email: "a@b.co" }, "Please enter your name."],
    ["missing email", { name: "A" }, "Please enter your email."],
    ["bad email", { name: "A", email: "not-an-email" }, "Please enter a valid email address."],
    ["email with spaces", { name: "A", email: "a b@c.co" }, "Please enter a valid email address."],
  ])("400 for %s with a plain message, saving nothing", async (_n, body, message) => {
    const res = await request(app).post("/api/leads").send(body);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: message });
    expect(prisma.lead.create).not.toHaveBeenCalled();
  });

  it("409 'You are already on the list.' for a duplicate email", async () => {
    prisma.lead.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "6" }),
    );
    const res = await request(app).post("/api/leads").send({ name: "A", email: "a@b.co" });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: "You are already on the list." });
  });

  it("other database errors are a plain 500 with no details", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    prisma.lead.create.mockRejectedValue(new Error("connection refused password=secret"));
    const res = await request(app).post("/api/leads").send({ name: "A", email: "a@b.co" });
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toMatch(/secret|refused/);
  });
});
