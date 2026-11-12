// Prompt 18 "Test:" line against a real database: generate one of each type for one
// client - 4 distinct, client-specific ai assignments exist. Skipped when DATABASE_URL is
// not set (runs in CI).
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

process.env.SESSION_SECRET ??= "test-secret-test-secret-test-secret";

import { app } from "../src/app.js";
import { prisma } from "../src/db.js";
import { asCoach } from "./helpers/authedRequest.js";

const tag = `auto-assign-${Date.now()}`;
const TYPES = ["Workout", "Nutrition", "Habit", "Recovery"] as const;

describe.skipIf(!process.env.DATABASE_URL)("auto-assign (database)", () => {
  let coachId = "";
  let api: ReturnType<typeof asCoach>;

  beforeAll(async () => {
    coachId = (await prisma.coach.create({ data: { name: "Test", email: `${tag}@example.com`, passwordHash: "x" } })).id;
    api = asCoach(app, coachId);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  afterAll(async () => {
    // Deleting the coach cascades to its clients and everything under them.
    await prisma.coach.deleteMany({ where: { id: coachId } });
    await prisma.$disconnect();
  });

  it("drafts 4 distinct, client-specific plans - one per type - and saves none until the coach assigns one", async () => {
    vi.stubEnv("AI_BASE_URL", "https://ai.example/v1");
    vi.stubEnv("AI_API_KEY", "test-key-not-a-real-secret");
    vi.stubEnv("AI_MODEL", "test-model");
    // The fake model echoes the requested type and a fact from the client context.
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        const { messages } = JSON.parse(init?.body as string) as { messages: { content: string }[] };
        const type = TYPES.find((t) => messages[0].content.includes(`ready-to-use ${t} assignment`))!;
        const goal = /- Goal: (.*)/.exec(messages[1].content)![1];
        return {
          ok: true,
          status: 200,
          json: async () => ({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    title: `${type} plan for Auto Test`,
                    details: `${type} step 1\n${type} step 2`,
                    reasoning: `Goal ${goal}, Beginner level, knee note.`,
                  }),
                },
              },
            ],
          }),
        };
      }),
    );

    const created = await api
      .post("/api/clients")
      .send({ name: "Auto Assign Test Client", goal: "Muscle gain", notes: "Old knee injury" });
    expect(created.status).toBe(201);
    const clientId: string = created.body.id;

    const drafts: { type: string; title: string; details: string; reasoning: string; date: string }[] = [];
    for (const type of TYPES) {
      const res = await api.post(`/api/clients/${clientId}/auto-assign`).send({ type });
      expect(res.status).toBe(200);
      expect(res.body.draft).toMatchObject({ type, title: `${type} plan for Auto Test` });
      expect(res.body.draft.reasoning).toContain("Muscle gain");
      drafts.push(res.body.draft);
    }
    // Drafting saved nothing.
    expect((await api.get(`/api/clients/${clientId}/assignments`)).body).toEqual([]);

    // The coach edits one and assigns it: only that one is saved, with the edit.
    const { date, ...habit } = drafts.find((d) => d.type === "Habit")!;
    const assigned = await api
      .post(`/api/clients/${clientId}/assignments`)
      .send({ ...habit, title: "Edited habit plan", source: "ai", date });
    expect(assigned.status).toBe(201);
    const list = await api.get(`/api/clients/${clientId}/assignments`);
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({ clientId, coachId, type: "Habit", title: "Edited habit plan", source: "ai", status: "Active" });
  });

  it("saves nothing when the AI fails", async () => {
    vi.stubEnv("AI_API_KEY", "");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const created = await api.post("/api/clients").send({ name: "Auto Assign Fail Client" });
    const clientId: string = created.body.id;

    const res = await api.post(`/api/clients/${clientId}/auto-assign`).send({ type: "Workout" });
    expect(res.status).toBe(502);
    const list = await api.get(`/api/clients/${clientId}/assignments`);
    expect(list.body).toEqual([]);
  });
});
