// Prompt 18: one-tap auto-assign (POST /api/clients/:clientId/auto-assign, body { type }).
// The AI writes ONE complete plan of the chosen type, the server SAVES it (source ai,
// status Active) and returns it. If the AI fails, nothing is saved.
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { prisma } = vi.hoisted(() => ({
  prisma: {
    client: { findFirst: vi.fn() },
    assignment: { findMany: vi.fn(), create: vi.fn() },
    progressLog: { findMany: vi.fn() },
    chatMessage: { create: vi.fn() },
  },
}));

vi.mock("../src/db.js", () => ({ prisma }));

import { app } from "../src/app.js";

const client = {
  id: "client-1",
  coachId: "default-coach",
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

const progressLog = { date: "2026-11-06", weightKg: 67.5, adherence: 81, workoutsDone: 4 };

const plan = {
  title: "Lower-body strength A",
  details: "Back squat 4 x 6, rest 120 s\nRomanian deadlift 3 x 8, rest 90 s\nWalking lunge 3 x 10/leg, rest 60 s",
  reasoning: "Maya's goal is fat loss + strength at Intermediate level; adherence was 81% on 2026-11-06.",
};

function stubProvider(content: string) {
  const fetchSpy = vi.fn(async (_input: string, _init?: RequestInit) => ({
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content } }] }),
  }) as unknown as Response);
  vi.stubGlobal("fetch", fetchSpy);
  return fetchSpy;
}

const post = (body: unknown, clientId = client.id) =>
  request(app).post(`/api/clients/${clientId}/auto-assign`).send(body as object);

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("AI_BASE_URL", "https://ai.example/v1");
  vi.stubEnv("AI_API_KEY", "test-key-not-a-real-secret");
  vi.stubEnv("AI_MODEL", "test-model");
  prisma.client.findFirst.mockResolvedValue(client);
  prisma.assignment.findMany.mockResolvedValue([{ type: "Habit", title: "Daily steps", status: "Active" }]);
  prisma.progressLog.findMany.mockResolvedValue([progressLog]);
  prisma.assignment.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: "assignment-new",
    createdAt: new Date("2026-11-10T00:00:00.000Z"),
    ...data,
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("POST /api/clients/:clientId/auto-assign", () => {
  it("rejects a missing or unknown type before calling the AI", async () => {
    const fetchSpy = stubProvider(JSON.stringify(plan));
    for (const body of [{}, { type: "Cardio" }]) {
      const response = await post(body);
      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: expect.stringContaining("type") });
    }
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(prisma.assignment.create).not.toHaveBeenCalled();
  });

  it("rejects an invalid date", async () => {
    const response = await post({ type: "Workout", date: "2026-02-30" });
    expect(response.status).toBe(400);
    expect(response.body.error).toContain("date");
  });

  it("returns 404 Client not found for an unknown client and saves nothing", async () => {
    prisma.client.findFirst.mockResolvedValue(null);
    const fetchSpy = stubProvider(JSON.stringify(plan));
    const response = await post({ type: "Workout" }, "missing");
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "Client not found" });
    expect(prisma.client.findFirst).toHaveBeenCalledWith({ where: { id: "missing", coachId: "default-coach" } });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(prisma.assignment.create).not.toHaveBeenCalled();
  });

  it("asks the AI with the client context and saves ONE ai assignment of that type", async () => {
    const fetchSpy = stubProvider(JSON.stringify(plan));

    const response = await post({ type: "Workout", date: "2026-11-09" });

    expect(response.status).toBe(201);
    expect(response.body).toEqual([
      expect.objectContaining({
        id: "assignment-new",
        clientId: client.id,
        coachId: "default-coach",
        type: "Workout",
        title: plan.title,
        details: plan.details,
        reasoning: plan.reasoning,
        source: "ai",
        status: "Active",
        date: "2026-11-09",
      }),
    ]);
    expect(prisma.assignment.create).toHaveBeenCalledOnce();
    expect(prisma.assignment.create).toHaveBeenCalledWith({
      data: {
        clientId: client.id,
        coachId: "default-coach",
        type: "Workout",
        title: plan.title,
        details: plan.details,
        reasoning: plan.reasoning,
        source: "ai",
        status: "Active",
        date: "2026-11-09",
      },
    });

    const body = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string) as {
      messages: { role: string; content: string }[];
      response_format: { type: string };
    };
    expect(body.response_format).toEqual({ type: "json_object" });
    const [system, user] = body.messages.map((m) => m.content);
    expect(system).toContain("ONE complete, ready-to-use Workout assignment");
    expect(system).toContain("sets x reps");
    expect(system).toContain("rest seconds");
    expect(system).toContain("goal, level");
    // Same client context as the chat (Prompt 15).
    for (const fact of [
      "Maya Patel",
      "Fat loss + strength",
      "Intermediate",
      "Age: 29",
      "Weight: 68 kg",
      "Lower body strength, protein intake",
      "Vegetarian; trains four times weekly.",
      "Daily steps",
      "2026-11-06",
    ]) {
      expect(user).toContain(fact);
    }
    // No chat messages are written by auto-assign.
    expect(prisma.chatMessage.create).not.toHaveBeenCalled();
  });

  it("defaults the date to today (UTC)", async () => {
    stubProvider(JSON.stringify(plan));
    const response = await post({ type: "Recovery" });
    expect(response.status).toBe(201);
    expect(response.body[0].date).toBe(new Date().toISOString().slice(0, 10));
    expect(response.body[0].type).toBe("Recovery");
  });

  it.each([
    ["Nutrition", ["meals with portions", "daily calories", "protein target"]],
    ["Habit", ["step-by-step daily actions"]],
    ["Recovery", ["step-by-step daily actions"]],
  ])("gives type-specific detail rules for %s", async (type, phrases) => {
    const fetchSpy = stubProvider(JSON.stringify(plan));
    const response = await post({ type });
    expect(response.status).toBe(201);
    const system = (JSON.parse(fetchSpy.mock.calls[0][1]?.body as string) as { messages: { content: string }[] })
      .messages[0].content;
    expect(system).toContain(`ONE complete, ready-to-use ${type} assignment`);
    for (const phrase of phrases) expect(system).toContain(phrase);
  });

  it("returns a clear error and saves nothing when the provider fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}) }) as unknown as Response),
    );
    const logError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await post({ type: "Workout" });

    expect(response.status).toBe(502);
    expect(response.body).toEqual({ error: expect.stringContaining("Nothing was saved") });
    expect(prisma.assignment.create).not.toHaveBeenCalled();
    expect(logError.mock.calls.flat().join(" ")).not.toContain("test-key-not-a-real-secret");
  });

  it("saves nothing when AI is not configured", async () => {
    vi.stubEnv("AI_API_KEY", "");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await post({ type: "Habit" });
    expect(response.status).toBe(502);
    expect(prisma.assignment.create).not.toHaveBeenCalled();
  });

  it.each([
    ["not JSON", "here is a plan"],
    ["missing details", JSON.stringify({ title: "Plan", details: "", reasoning: "Because" })],
    ["missing reasoning", JSON.stringify({ title: "Plan", details: "Do things" })],
  ])("saves nothing when the model reply is %s", async (_label, content) => {
    stubProvider(content);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await post({ type: "Nutrition" });
    expect(response.status).toBe(502);
    expect(prisma.assignment.create).not.toHaveBeenCalled();
  });
});
