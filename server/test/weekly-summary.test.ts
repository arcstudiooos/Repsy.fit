// Prompt 51: the weekly facts are counted from records, the AI gets ONLY those facts, every number
// in the summary must exist in them, and a failing AI falls back to the plain fact list.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildWeeklyFacts, factsFallbackText, numbersAreGrounded, weekStartOf } from "../src/weeklySummary.js";

const client = (id: string, over: Partial<{ name: string; goal: string; createdAt: Date }> = {}) => ({
  id,
  name: over.name ?? `Client ${id}`,
  goal: over.goal ?? "General fitness",
  createdAt: over.createdAt ?? new Date("2026-01-01T00:00:00.000Z"),
  logs: [],
});

describe("weekStartOf", () => {
  it("returns the Monday of that week", () => {
    expect(weekStartOf("2026-11-11")).toBe("2026-11-09"); // Wednesday -> Monday
    expect(weekStartOf("2026-11-09")).toBe("2026-11-09"); // Monday itself
    expect(weekStartOf("2026-11-15")).toBe("2026-11-09"); // Sunday -> same Monday
  });
});

describe("buildWeeklyFacts", () => {
  const weekStart = "2026-11-09"; // week runs 2026-11-09 .. 2026-11-15

  it("counts only this week's records, and compares adherence with last week", () => {
    const facts = buildWeeklyFacts({
      weekStart,
      clients: [client("c1"), client("c2")],
      logs: [
        { clientId: "c1", date: "2026-11-10", adherence: 90 },
        { clientId: "c2", date: "2026-11-12", adherence: 70 },
        { clientId: "c1", date: "2026-11-15", adherence: 80 },
        { clientId: "c1", date: "2026-11-16", adherence: 100 }, // next week: ignored
        { clientId: "c1", date: "2026-11-05", adherence: 60 }, // last week
        { clientId: "c2", date: "2026-11-03", adherence: 80 }, // last week
      ],
      assignmentsDone: [{ date: "2026-11-10" }, { date: "2026-11-14" }, { date: "2026-11-20" }],
      activeClientIds: ["c1", "c1", "c2"],
    });
    expect(facts).toMatchObject({
      weekStart,
      weekEnd: "2026-11-15",
      activeClients: 2,
      checkIns: 3,
      avgAdherence: 80, // (90 + 70 + 80) / 3
      avgAdherenceChange: 10, // 80 - 70
      assignmentsCompleted: 2,
    });
  });

  it("uses null, never 0, when there is nothing to average or compare", () => {
    const facts = buildWeeklyFacts({ weekStart, clients: [], logs: [], assignmentsDone: [], activeClientIds: [] });
    expect(facts.avgAdherence).toBeNull();
    expect(facts.avgAdherenceChange).toBeNull();
    expect(facts).toMatchObject({ activeClients: 0, checkIns: 0, assignmentsCompleted: 0, atRiskClients: 0 });
  });

  it("counts at-risk clients with the Prompt 50 rules", () => {
    const facts = buildWeeklyFacts({
      weekStart,
      clients: [
        { ...client("low"), logs: [{ date: "2026-11-10", weightKg: null, adherence: 30 }] },
        { ...client("fine"), logs: [{ date: "2026-11-10", weightKg: null, adherence: 95 }] },
      ],
      logs: [
        { clientId: "low", date: "2026-11-10", adherence: 30 },
        { clientId: "fine", date: "2026-11-10", adherence: 95 },
      ],
      assignmentsDone: [],
      activeClientIds: [],
    });
    expect(facts.atRiskClients).toBe(1);
  });
});

describe("numbersAreGrounded", () => {
  const facts = buildWeeklyFacts({
    weekStart: "2026-11-09",
    clients: [client("c1")],
    logs: [{ clientId: "c1", date: "2026-11-10", adherence: 84 }],
    assignmentsDone: [{ date: "2026-11-10" }],
    activeClientIds: ["c1"],
  });

  it("accepts text that only uses numbers from the facts", () => {
    expect(numbersAreGrounded("1 active client logged 1 check-in at 84% adherence; 1 plan completed.", facts)).toBe(true);
    expect(numbersAreGrounded("Week of 2026-11-09: steady work, no clients need attention.", facts)).toBe(true);
    expect(numbersAreGrounded("No numbers at all here.", facts)).toBe(true);
  });

  it("rejects a number the facts do not contain (no inventing numbers)", () => {
    expect(numbersAreGrounded("Adherence averaged 91% this week.", facts)).toBe(false);
    expect(numbersAreGrounded("Your 12 clients are doing well.", facts)).toBe(false);
  });
});

describe("factsFallbackText", () => {
  it("lists every fact in plain words, and says when adherence is not logged", () => {
    const facts = buildWeeklyFacts({ weekStart: "2026-11-09", clients: [], logs: [], assignmentsDone: [], activeClientIds: [] });
    const text = factsFallbackText(facts);
    expect(text).toContain("Active clients this week: 0");
    expect(text).toContain("Check-ins logged: 0");
    expect(text).toContain("Average adherence: not logged");
    expect(text).toContain("Plans completed: 0");
    expect(text).toContain("Clients needing attention: 0 clients");
    expect(numbersAreGrounded(text, facts)).toBe(true);
  });
});

// ----- The endpoint: facts in, AI called with facts only, saved with them -----

const prismaMock = vi.hoisted(() => ({
  client: { findMany: vi.fn() },
  progressLog: { findMany: vi.fn() },
  assignment: { findMany: vi.fn() },
  weeklySummary: { findUnique: vi.fn(), upsert: vi.fn() },
}));
vi.mock("../src/db.js", () => ({ prisma: prismaMock }));

const { app } = await import("../src/app.js");
const { default: request } = await import("./helpers/authedRequest.js");

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

function aiReplies(body: unknown) {
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(body) } }] }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.AI_BASE_URL = "https://ai.example.com/v1";
  process.env.AI_API_KEY = "test-key";
  process.env.AI_MODEL = "test-model";
  prismaMock.client.findMany.mockResolvedValue([{ id: "c1", name: "Maya", goal: "Fat loss", createdAt: new Date("2026-10-01T00:00:00.000Z") }]);
  prismaMock.progressLog.findMany.mockResolvedValue([{ clientId: "c1", date: "2026-11-10", weightKg: 70, adherence: 84 }]);
  prismaMock.assignment.findMany.mockResolvedValue([
    { clientId: "c1", date: "2026-11-10", status: "Done" },
    { clientId: "c1", date: "2026-11-11", status: "Active" },
  ]);
  prismaMock.weeklySummary.findUnique.mockResolvedValue(null);
  prismaMock.weeklySummary.upsert.mockImplementation(({ create, update }: { create?: Record<string, unknown>; update?: Record<string, unknown> }) =>
    Promise.resolve({ id: "s1", weekStart: "2026-11-09", createdAt: new Date("2026-11-11T10:00:00.000Z"), ...(create ?? {}), ...(update ?? {}) }),
  );
});

describe("POST /api/weekly-summary", () => {
  it("sends ONLY the facts to the AI and saves the summary with them", async () => {
    aiReplies({ lines: ["1 active client logged 1 check-in.", "Adherence is 84%."], actions: ["Message Maya", "Plan next week"] });
    const res = await request(app).post("/api/weekly-summary").send({ date: "2026-11-11" });

    expect(res.status).toBe(201);
    expect(res.body.summary.source).toBe("ai");
    expect(res.body.summary.text).toContain("Suggested actions:");
    expect(res.body.summary.facts).toMatchObject({ activeClients: 1, checkIns: 1, avgAdherence: 84, assignmentsCompleted: 1 });

    const sent = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body) as { messages: { role: string; content: string }[] };
    const userMessage = sent.messages.find((m) => m.role === "user")!.content;
    expect(JSON.parse(userMessage)).toEqual(res.body.summary.facts); // the facts object, nothing else
    expect(userMessage).not.toContain("Maya"); // no client names, notes or other data
    expect(prismaMock.weeklySummary.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ coachId: "coach-1", weekStart: "2026-11-09" }) }),
    );
  });

  it("falls back to the plain fact list when the AI call fails", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    const res = await request(app).post("/api/weekly-summary").send({ date: "2026-11-11" });
    expect(res.status).toBe(201);
    expect(res.body.summary.source).toBe("facts");
    expect(res.body.summary.text).toContain("Active clients this week: 1");
    expect(res.body.summary.text).toContain("Average adherence: 84%");
  });

  it("falls back when the AI invents a number that is not in the facts", async () => {
    aiReplies({ lines: ["Your 12 clients averaged 91% adherence."], actions: ["a", "b"] });
    const res = await request(app).post("/api/weekly-summary").send({ date: "2026-11-11" });
    expect(res.body.summary.source).toBe("facts");
    expect(res.body.summary.text).not.toContain("91");
  });

  it("falls back when the reply has the wrong shape (not 2 actions)", async () => {
    aiReplies({ lines: ["Fine week."], actions: ["only one"] });
    expect((await request(app).post("/api/weekly-summary").send({ date: "2026-11-11" })).body.summary.source).toBe("facts");
  });

  it("refuses to replace an existing summary without a confirm, and replaces it with one", async () => {
    prismaMock.weeklySummary.findUnique.mockResolvedValue({ weekStart: "2026-11-09", text: "old", facts: {}, createdAt: new Date() });
    aiReplies({ lines: ["Fresh."], actions: ["a", "b"] });

    const blocked = await request(app).post("/api/weekly-summary").send({ date: "2026-11-11" });
    expect(blocked.status).toBe(409);
    expect(blocked.body).toEqual({ error: "This week's summary is already saved. Confirm to replace it." });
    expect(prismaMock.weeklySummary.upsert).not.toHaveBeenCalled();

    const replaced = await request(app).post("/api/weekly-summary").send({ date: "2026-11-11", replace: true });
    expect(replaced.status).toBe(201);
    expect(replaced.body.summary.text).toContain("Fresh.");
  });

  it("rejects a bad date and never calls the AI", async () => {
    const res = await request(app).post("/api/weekly-summary").send({ date: "11-11-2026" });
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/weekly-summary", () => {
  it("returns null when this week has no summary yet", async () => {
    const res = await request(app).get("/api/weekly-summary?date=2026-11-11");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ weekStart: "2026-11-09", summary: null });
    expect(prismaMock.weeklySummary.findUnique).toHaveBeenCalledWith({
      where: { coachId_weekStart: { coachId: "coach-1", weekStart: "2026-11-09" } },
    });
  });

  it("returns the saved summary with its facts", async () => {
    prismaMock.weeklySummary.findUnique.mockResolvedValue({
      weekStart: "2026-11-09",
      text: "Saved text.",
      facts: { weekStart: "2026-11-09", activeClients: 1 },
      createdAt: new Date("2026-11-11T10:00:00.000Z"),
    });
    const res = await request(app).get("/api/weekly-summary?date=2026-11-11");
    expect(res.body.summary).toMatchObject({ text: "Saved text.", source: "ai", facts: { activeClients: 1 } });
  });
});
