import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { prisma } = vi.hoisted(() => ({
  prisma: {
    client: { findFirst: vi.fn() },
    assignment: { findMany: vi.fn() },
    progressLog: { findMany: vi.fn() },
    chatMessage: { create: vi.fn() },
  },
}));

vi.mock("../src/db.js", () => ({ prisma }));

import { app } from "../src/app.js";

const client = {
  id: "client-1",
  coachId: null,
  name: "Maya Patel",
  goal: "Fat loss + strength",
  age: 29,
  weightKg: 68,
  heightCm: 165,
  level: "Intermediate",
  focus: "Lower body strength, protein intake",
  notes: "Vegetarian; trains four times weekly.",
  createdAt: new Date("2026-10-01T00:00:00.000Z"),
};

const assignment = {
  id: "assignment-1",
  clientId: client.id,
  type: "Workout",
  title: "Strength block A",
  status: "Active",
  createdAt: new Date("2026-11-05T00:00:00.000Z"),
};

const progressLog = {
  id: "progress-1",
  clientId: client.id,
  date: "2026-11-06",
  weightKg: 67.5,
  adherence: 81,
  workoutsDone: 4,
  createdAt: new Date("2026-11-06T00:00:00.000Z"),
};

const answerPayload = {
  answer: "Maya's goal is fat loss with strength, so keep protein steady and progress the lifts gradually.",
  suggestionType: "Workout",
  suggestionTitle: "Lower-body strength session",
  suggestionDetails: "Use a squat, hinge, and single-leg movement at a controlled effort.",
  suggestionReasoning: "This supports her strength focus while keeping progression manageable.",
};

function stubProviderResult(content: string) {
  const fetchSpy = vi.fn(async (_input: string, _init?: RequestInit) => ({
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content } }] }),
  }) as unknown as Response);
  vi.stubGlobal("fetch", fetchSpy);
  return fetchSpy;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("AI_BASE_URL", "https://ai.example/v1");
  vi.stubEnv("AI_API_KEY", "test-key-not-a-real-secret");
  vi.stubEnv("AI_MODEL", "test-model");

  prisma.client.findFirst.mockResolvedValue(client);
  prisma.assignment.findMany.mockResolvedValue([assignment]);
  prisma.progressLog.findMany.mockResolvedValue([progressLog]);
  prisma.chatMessage.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: `message-${prisma.chatMessage.create.mock.calls.length}`,
    createdAt: new Date("2026-11-10T00:00:00.000Z"),
    ...data,
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("POST /api/clients/:clientId/chat", () => {
  it("rejects an empty question before reading or writing chat data", async () => {
    const response = await request(app).post(`/api/clients/${client.id}/chat`).send({ question: "   " });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: expect.stringContaining("question") });
    expect(prisma.client.findFirst).not.toHaveBeenCalled();
    expect(prisma.chatMessage.create).not.toHaveBeenCalled();
  });

  it("uses client context, validates the model JSON, and saves both sides of the chat", async () => {
    const fetchSpy = stubProviderResult(JSON.stringify(answerPayload));

    const response = await request(app)
      .post(`/api/clients/${client.id}/chat`)
      .send({ question: "What should Maya focus on this week?" });

    expect(response.status).toBe(201);
    expect(response.body.question).toMatchObject({ role: "coach", content: "What should Maya focus on this week?" });
    expect(response.body.reply).toMatchObject({ role: "ai", content: answerPayload.answer });
    expect(response.body.suggestion).toEqual({
      type: "Workout",
      title: answerPayload.suggestionTitle,
      details: answerPayload.suggestionDetails,
      reasoning: answerPayload.suggestionReasoning,
    });

    expect(prisma.client.findFirst).toHaveBeenCalledWith({
      where: { id: client.id, coachId: null },
    });
    expect(prisma.assignment.findMany).toHaveBeenCalledWith({
      where: { clientId: client.id, coachId: null },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 8,
      select: { type: true, title: true, status: true },
    });
    expect(prisma.progressLog.findMany).toHaveBeenCalledWith({
      where: { clientId: client.id, coachId: null },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      take: 6,
      select: { date: true, weightKg: true, adherence: true, workoutsDone: true },
    });
    expect(prisma.chatMessage.create).toHaveBeenCalledTimes(2);
    expect(prisma.chatMessage.create.mock.calls.map(([call]) => call.data.role)).toEqual(["coach", "ai"]);

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://ai.example/v1/chat/completions");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer test-key-not-a-real-secret");
    const requestBody = JSON.parse(init?.body as string) as {
      model: string;
      messages: { role: string; content: string }[];
      response_format: { type: string };
    };
    expect(requestBody.model).toBe("test-model");
    expect(requestBody.response_format).toEqual({ type: "json_object" });
    expect(requestBody.messages[0].content).toContain("You are Repsy AI");
    expect(requestBody.messages[0].content).toContain("3-5 sentences");
    expect(requestBody.messages[0].content).toContain("never diagnose medical conditions");
    expect(requestBody.messages[1].content).toContain("Maya Patel");
    expect(requestBody.messages[1].content).toContain("Fat loss + strength");
    expect(requestBody.messages[1].content).toContain("Intermediate");
    expect(requestBody.messages[1].content).toContain("Age: 29");
    expect(requestBody.messages[1].content).toContain("Weight: 68 kg");
    expect(requestBody.messages[1].content).toContain("Height: 165 cm");
    expect(requestBody.messages[1].content).toContain("Lower body strength, protein intake");
    expect(requestBody.messages[1].content).toContain("Vegetarian; trains four times weekly.");
    expect(requestBody.messages[1].content).toContain("Strength block A");
    expect(requestBody.messages[1].content).toContain("2026-11-06");
    expect(requestBody.messages[1].content).toContain("What should Maya focus on this week?");
    expect(prisma.chatMessage.create.mock.invocationCallOrder[0]).toBeLessThan(fetchSpy.mock.invocationCallOrder[0]);
    expect(fetchSpy.mock.invocationCallOrder[0]).toBeLessThan(prisma.chatMessage.create.mock.invocationCallOrder[1]);
  });

  it("returns no suggestion when the model reports None", async () => {
    stubProviderResult(
      JSON.stringify({
        answer: "Maya is already progressing steadily; keep her current routine consistent this week.",
        suggestionType: "None",
        suggestionTitle: null,
        suggestionDetails: null,
        suggestionReasoning: null,
      }),
    );

    const response = await request(app)
      .post(`/api/clients/${client.id}/chat`)
      .send({ question: "Is a new plan needed?" });

    expect(response.status).toBe(201);
    expect(response.body.suggestion).toBeNull();
    expect(response.body.reply.content).toContain("progressing steadily");
  });

  it("returns and saves a client-specific fallback when the provider rejects the API key", async () => {
    const fetchSpy = vi.fn(async () => ({
      ok: false,
      status: 401,
      json: async () => ({ error: { message: "invalid API key" } }),
    }) as unknown as Response);
    vi.stubGlobal("fetch", fetchSpy);
    const logError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await request(app)
      .post(`/api/clients/${client.id}/chat`)
      .send({ question: "Summarise this client" });

    expect(response.status).toBe(201);
    expect(response.body.reply.content).toContain("Maya Patel");
    expect(response.body.reply.content).toContain("Fat loss + strength");
    expect(response.body.reply.content).toContain("Intermediate");
    expect(response.body.reply.content).toContain("Keep consistency high");
    expect(response.body.reply.content).toContain("Ask me to generate a specific plan");
    expect(response.body.suggestion).toBeNull();
    expect(prisma.chatMessage.create).toHaveBeenCalledTimes(2);
    expect(logError).toHaveBeenCalled();
    expect(logError.mock.calls.flat().join(" ")).not.toContain("test-key-not-a-real-secret");
    expect(fetchSpy).toHaveBeenCalledOnce();
  });

  it("returns 404 for a client outside the current coach and saves nothing", async () => {
    prisma.client.findFirst.mockResolvedValue(null);

    const response = await request(app).post("/api/clients/missing/chat").send({ question: "Hello" });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "Client not found" });
    expect(prisma.assignment.findMany).not.toHaveBeenCalled();
    expect(prisma.progressLog.findMany).not.toHaveBeenCalled();
    expect(prisma.chatMessage.create).not.toHaveBeenCalled();
  });
});
