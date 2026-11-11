// Daily check-ins (Prompt 53): one row per client per day, validation, and the merged Home list.
import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  client: { findFirst: vi.fn() },
  dailyCheckIn: { findMany: vi.fn(), findUnique: vi.fn(), upsert: vi.fn() },
  progressLog: { findMany: vi.fn() },
  reviewItem: { create: vi.fn() },
}));
vi.mock("../src/db.js", () => ({ prisma: prismaMock }));

const { app } = await import("../src/app.js");
const { default: request } = await import("./helpers/authedRequest.js");
const supertest = (await import("supertest")).default;

const CLIENT = { id: "c1", coachId: "coach-1", name: "Maya Patel" };
const saved = (over: Record<string, unknown> = {}) => ({
  id: "d1",
  coachId: "coach-1",
  clientId: "c1",
  date: "2026-11-11",
  energy: 4,
  mood: 3,
  sleepHours: null,
  recoveryScore: null,
  waterLiters: 2.5,
  steps: 8000,
  foodNote: "High protein",
  createdAt: new Date("2026-11-11T08:00:00.000Z"),
  updatedAt: new Date("2026-11-11T08:00:00.000Z"),
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.client.findFirst.mockResolvedValue(CLIENT);
  prismaMock.dailyCheckIn.findMany.mockResolvedValue([saved()]);
  prismaMock.dailyCheckIn.findUnique.mockResolvedValue(null);
  prismaMock.dailyCheckIn.upsert.mockImplementation(({ create, update }: { create?: Record<string, unknown>; update?: Record<string, unknown> }) =>
    Promise.resolve(saved({ ...(create ?? {}), ...(update ?? {}) })),
  );
  prismaMock.progressLog.findMany.mockResolvedValue([]);
});

describe("GET /api/clients/:clientId/checkins", () => {
  it("returns that client's check-ins, newest first, 14 days by default", async () => {
    const res = await request(app).get("/api/clients/c1/checkins");
    expect(res.status).toBe(200);
    expect(res.body[0]).toMatchObject({ date: "2026-11-11", energy: 4, mood: 3, steps: 8000 });
    expect(prismaMock.dailyCheckIn.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { clientId: "c1", coachId: "coach-1" }, orderBy: [{ date: "desc" }, { id: "desc" }], take: 14 }),
    );
  });

  it("days can be changed, but must be 1-90", async () => {
    await request(app).get("/api/clients/c1/checkins?days=30");
    expect(prismaMock.dailyCheckIn.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 30 }));
    const bad = await request(app).get("/api/clients/c1/checkins?days=200");
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe("days must be a whole number from 1 to 90.");
  });

  it("another coach's client is 404, and signed out is 401", async () => {
    prismaMock.client.findFirst.mockResolvedValue(null);
    const res = await request(app).get("/api/clients/other/checkins");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Client not found" });
    expect((await supertest(app).get("/api/clients/c1/checkins")).status).toBe(401);
  });
});

describe("POST /api/clients/:clientId/checkins", () => {
  it("saves a new day (201) through an upsert keyed on client + date", async () => {
    const res = await request(app)
      .post("/api/clients/c1/checkins")
      .send({ date: "2026-11-11", energy: 4, mood: 3, waterLiters: 2.5, steps: 8000, foodNote: "High protein" });
    expect(res.status).toBe(201);
    expect(prismaMock.dailyCheckIn.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { clientId_date: { clientId: "c1", date: "2026-11-11" } },
        create: expect.objectContaining({ clientId: "c1", coachId: "coach-1", date: "2026-11-11", energy: 4, mood: 3 }),
        update: expect.objectContaining({ energy: 4, mood: 3, waterLiters: 2.5, steps: 8000, foodNote: "High protein" }),
      }),
    );
  });

  it("saving the same day again updates that row (200) instead of adding a second one", async () => {
    prismaMock.dailyCheckIn.findUnique.mockResolvedValue(saved());
    const res = await request(app).post("/api/clients/c1/checkins").send({ date: "2026-11-11", energy: 2 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ energy: 2 });
    expect(prismaMock.dailyCheckIn.upsert).toHaveBeenCalledTimes(1);
  });

  it("a cleared field is saved as empty, not left at its old value", async () => {
    prismaMock.dailyCheckIn.findUnique.mockResolvedValue(saved());
    await request(app).post("/api/clients/c1/checkins").send({ date: "2026-11-11", energy: 5 });
    expect(prismaMock.dailyCheckIn.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ energy: 5, mood: null, steps: null, waterLiters: null, foodNote: "" }) }),
    );
  });

  it.each([
    [{ date: "11-11-2026" }, "date: date must be a real date in YYYY-MM-DD form."],
    [{ date: "2026-11-11", energy: 0 }, "energy: energy must be a whole number from 1 to 5."],
    [{ date: "2026-11-11", mood: 6 }, "mood: mood must be a whole number from 1 to 5."],
    [{ date: "2026-11-11", energy: 2.5 }, "energy: energy must be a whole number from 1 to 5."],
    [{ date: "2026-11-11", sleepHours: 20 }, "sleepHours: sleepHours must be a number of hours from 0 to 16."],
    [{ date: "2026-11-11", waterLiters: -1 }, "waterLiters: waterLiters must be a number from 0 to 20."],
    [{ date: "2026-11-11", steps: 200000 }, "steps: steps must be a whole number from 0 to 100000."],
  ])("rejects bad input in plain words: %j", async (body, message) => {
    const res = await request(app).post("/api/clients/c1/checkins").send(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe(message);
    expect(prismaMock.dailyCheckIn.upsert).not.toHaveBeenCalled();
  });

  it("never saves to another coach's client", async () => {
    prismaMock.client.findFirst.mockResolvedValue(null);
    const res = await request(app).post("/api/clients/other/checkins").send({ date: "2026-11-11", energy: 3 });
    expect(res.status).toBe(404);
    expect(prismaMock.dailyCheckIn.upsert).not.toHaveBeenCalled();
  });
});

describe("Home 'New check-ins' merges daily check-ins (Prompt 49 promise)", () => {
  it("returns both kinds, newest first, max 8", async () => {
    prismaMock.progressLog.findMany.mockResolvedValue([
      {
        id: "p1",
        clientId: "c1",
        weightKg: 70,
        adherence: 84,
        workoutsDone: 3,
        note: "",
        createdAt: new Date("2026-11-11T07:00:00.000Z"),
        client: { name: "Maya Patel" },
      },
    ]);
    prismaMock.dailyCheckIn.findMany.mockResolvedValue([
      { ...saved(), updatedAt: new Date("2026-11-11T09:00:00.000Z"), client: { name: "Maya Patel" } },
    ]);
    const res = await request(app).get("/api/checkins/recent");
    expect(res.status).toBe(200);
    expect(res.body.items.map((i: { kind: string }) => i.kind)).toEqual(["daily", "progress"]);
    expect(res.body.items[0]).toMatchObject({ kind: "daily", clientName: "Maya Patel", energy: 4, mood: 3, date: "2026-11-11" });
    expect(res.body.items.length).toBeLessThanOrEqual(8);
  });
});

describe("the AI context includes recent energy and mood", () => {
  it("sends the client's latest daily check-ins to the model", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: JSON.stringify({ answer: "ok", suggestionType: "None", suggestionTitle: null, suggestionDetails: null, suggestionReasoning: null }) } }] }),
    });
    vi.stubGlobal("fetch", fetchMock);
    process.env.AI_BASE_URL = "https://ai.example.com/v1";
    process.env.AI_API_KEY = "k";
    process.env.AI_MODEL = "m";
    const { loadClientContext, answerQuestion } = await import("../src/routes/ai.js");
    prismaMock.dailyCheckIn.findMany.mockResolvedValue([saved()]);
    prismaMock.progressLog.findMany.mockResolvedValue([]);
    const assignmentMock = prismaMock as unknown as { assignment: { findMany: ReturnType<typeof vi.fn> } };
    assignmentMock.assignment = { findMany: vi.fn().mockResolvedValue([]) };
    const context = await loadClientContext({ ...CLIENT, goal: "Fat loss", level: "Intermediate", focus: "", notes: "", age: null, weightKg: null, heightCm: null, createdAt: new Date() } as never);
    await answerQuestion(context, "How is she doing?");
    const sent = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body) as { messages: { role: string; content: string }[] };
    const userMessage = sent.messages.find((m) => m.role === "user")!.content;
    expect(userMessage).toContain("Latest daily check-ins (newest first):");
    expect(userMessage).toContain("energy 4/5");
    expect(userMessage).toContain("mood 3/5");
    vi.unstubAllGlobals();
  });
});
