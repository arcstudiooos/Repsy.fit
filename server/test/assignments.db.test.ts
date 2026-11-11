// Prompt 17 "Test:" line against a real database: ask "Make a workout plan", assign the
// suggestion, then the client's list holds exactly one assignment with source "ai" and
// reasoning filled. Skipped when DATABASE_URL is not set (runs in CI).
import request from "supertest";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { app } from "../src/app.js";
import { prisma } from "../src/db.js";

const createdIds: string[] = [];

describe.skipIf(!process.env.DATABASE_URL)("assign from AI suggestion (database)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  afterAll(async () => {
    await prisma.client.deleteMany({ where: { id: { in: createdIds } } });
    await prisma.$disconnect();
  });

  it("asking saves no assignment; assigning saves exactly one with source ai and reasoning", async () => {
    vi.stubEnv("AI_BASE_URL", "https://ai.example/v1");
    vi.stubEnv("AI_API_KEY", "test-key-not-a-real-secret");
    vi.stubEnv("AI_MODEL", "test-model");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  answer: "Here is a workout plan focused on lower-body strength for this client.",
                  suggestionType: "Workout",
                  suggestionTitle: "Lower-body strength session",
                  suggestionDetails: "Back squat 4x6, Romanian deadlift 3x8",
                  suggestionReasoning: "Supports the client's strength goal.",
                }),
              },
            },
          ],
        }),
      })),
    );

    const created = await request(app).post("/api/clients").send({ name: "Assign Test Client" });
    expect(created.status).toBe(201);
    const clientId: string = created.body.id;
    createdIds.push(clientId);

    const asked = await request(app).post(`/api/clients/${clientId}/chat`).send({ question: "Make a workout plan" });
    expect(asked.status).toBe(201);
    const suggestion = asked.body.suggestion;
    expect(suggestion).not.toBeNull();

    // Nothing is saved until the coach taps Assign (a dismissed suggestion saves nothing).
    const before = await request(app).get(`/api/clients/${clientId}/assignments`);
    expect(before.body).toEqual([]);

    const assigned = await request(app)
      .post(`/api/clients/${clientId}/assignments`)
      .send({ ...suggestion, source: "ai", date: "2026-11-10" });
    expect(assigned.status).toBe(201);

    const list = await request(app).get(`/api/clients/${clientId}/assignments`);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({
      id: assigned.body.id,
      clientId,
      coachId: null,
      type: "Workout",
      source: "ai",
      status: "Active",
      reasoning: "Supports the client's strength goal.",
    });
  });
});
