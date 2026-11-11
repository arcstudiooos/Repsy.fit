// "Needs attention" card (Prompt 50): the rules, with small fixed datasets, plus the endpoint.
// Prisma is mocked, so these run without a database.
import request, { TEST_COACH_ID } from "./helpers/authedRequest.js";
import plainRequest from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { prisma } = vi.hoisted(() => ({
  prisma: {
    client: { findMany: vi.fn() },
    progressLog: { findMany: vi.fn() },
  },
}));

vi.mock("../src/db.js", () => ({ prisma }));

import { app } from "../src/app.js";
import {
  ADHERENCE_MIN_PERCENT,
  ADHERENCE_WINDOW_DAYS,
  INACTIVE_DAYS,
  WEIGHT_STREAK_LOGS,
  findAtRiskClients,
  type AtRiskClientInput,
  type AtRiskLogInput,
} from "../src/atRisk.js";

const TODAY = "2026-11-11";
const OLD = new Date("2026-01-01T00:00:00.000Z");

const client = (id: string, goal = "General fitness", createdAt = OLD): AtRiskClientInput => ({
  id,
  name: `Client ${id}`,
  goal,
  createdAt,
});
const log = (date: string, extra: Partial<AtRiskLogInput> = {}): AtRiskLogInput => ({
  date,
  weightKg: null,
  adherence: null,
  ...extra,
});
const run = (c: AtRiskClientInput, logs: AtRiskLogInput[]) => findAtRiskClients([{ client: c, logs }], TODAY);

describe("thresholds are named constants", () => {
  it("exports the tunable numbers", () => {
    expect(ADHERENCE_MIN_PERCENT).toBe(60);
    expect(ADHERENCE_WINDOW_DAYS).toBe(14);
    expect(INACTIVE_DAYS).toBe(10);
    expect(WEIGHT_STREAK_LOGS).toBe(3);
  });
});

describe("rule 1: adherence under 60% over the last 2 weeks", () => {
  it("lists a client whose average over the last 2 weeks is 45%", () => {
    const out = run(client("a"), [log("2026-11-03", { adherence: 40 }), log("2026-11-10", { adherence: 50 })]);
    expect(out).toHaveLength(1);
    expect(out[0].reasons).toEqual([{ rule: "adherence", text: "Adherence 45% over the last 2 weeks" }]);
  });

  it("does not list 60% or better", () => {
    expect(run(client("a"), [log("2026-11-03", { adherence: 60 }), log("2026-11-10", { adherence: 60 })])).toEqual([]);
  });

  it("ignores logs older than 2 weeks before the latest log", () => {
    // 20% three weeks earlier does not drag the recent 80% down.
    expect(run(client("a"), [log("2026-10-15", { adherence: 20 }), log("2026-11-10", { adherence: 80 })])).toEqual([]);
  });

  it("ignores logs with no adherence", () => {
    expect(run(client("a"), [log("2026-11-10", { weightKg: 70 })])).toEqual([]);
  });
});

describe("rule 2: no check-in in 10+ days", () => {
  it("lists a client whose last log is 10 days old", () => {
    const out = run(client("a"), [log("2026-11-01", { adherence: 90 })]);
    expect(out[0].reasons).toEqual([{ rule: "inactive", text: "No check-in for 10 days" }]);
  });

  it("does not list a log 9 days old", () => {
    expect(run(client("a"), [log("2026-11-02", { adherence: 90 })])).toEqual([]);
  });

  it("lists a client with no logs at all once they are 10+ days old", () => {
    const out = run(client("a"), []);
    expect(out[0].reasons).toEqual([{ rule: "inactive", text: "No check-in logged yet" }]);
  });

  it("does not list a brand-new client with no logs", () => {
    expect(run(client("a", "General fitness", new Date("2026-11-05T00:00:00.000Z")), [])).toEqual([]);
  });
});

describe("rule 3: weight moving opposite to the goal for 3 straight logs", () => {
  const rising = [
    log("2026-10-20", { weightKg: 70 }),
    log("2026-10-27", { weightKg: 70.5 }),
    log("2026-11-03", { weightKg: 71 }),
    log("2026-11-10", { weightKg: 71.5 }),
  ];

  it("lists a fat-loss client whose weight went up 3 logs in a row", () => {
    const out = run(client("a", "Fat loss"), rising);
    expect(out[0].reasons).toEqual([
      { rule: "weight", text: "Weight went up 3 logs in a row (70 → 71.5 kg) while the goal is fat loss" },
    ]);
  });

  it("also covers 'Fat loss + strength'", () => {
    expect(run(client("a", "Fat loss + strength"), rising)).toHaveLength(1);
  });

  it("lists a muscle-gain client whose weight went down 3 logs in a row", () => {
    const falling = rising.map((l, i) => ({ ...l, weightKg: 75 - i }));
    const out = run(client("a", "Muscle gain"), falling);
    expect(out[0].reasons).toEqual([
      { rule: "weight", text: "Weight went down 3 logs in a row (75 → 72 kg) while the goal is muscle gain" },
    ]);
  });

  it("does not list weight moving the right way", () => {
    expect(run(client("a", "Muscle gain"), rising)).toEqual([]);
  });

  it("does not list a streak broken by one flat or lower log", () => {
    const broken = [rising[0], rising[1], log("2026-11-03", { weightKg: 70.5 }), rising[3]];
    expect(run(client("a", "Fat loss"), broken)).toEqual([]);
  });

  it("does not judge goals without a weight direction", () => {
    expect(run(client("a", "Marathon prep + conditioning"), rising)).toEqual([]);
  });

  it("skips logs with no weight when counting the streak", () => {
    const withGap = [rising[0], rising[1], log("2026-11-01", { adherence: 90 }), rising[2], rising[3]];
    expect(run(client("a", "Fat loss"), withGap)).toHaveLength(1);
  });

  it("needs 3 moves, not 2", () => {
    expect(run(client("a", "Fat loss"), rising.slice(1))).toEqual([]);
  });
});

describe("combining and sorting", () => {
  it("shows every reason that fires and sorts the worst client first", () => {
    const mild = { client: client("mild"), logs: [log("2026-11-10", { adherence: 55 })] };
    const bad = {
      client: client("bad"),
      logs: [log("2026-10-20", { adherence: 20 })],
    };
    const calm = { client: client("calm"), logs: [log("2026-11-10", { adherence: 95 })] };
    const out = findAtRiskClients([mild, calm, bad], TODAY);
    expect(out.map((c) => c.clientId)).toEqual(["bad", "mild"]);
    expect(out[0].reasons.map((r) => r.rule)).toEqual(["adherence", "inactive"]);
  });

  it("never uses harsh wording", () => {
    const out = run(client("a", "Fat loss"), [log("2026-10-01", { adherence: 10, weightKg: 70 })]);
    expect(JSON.stringify(out).toLowerCase()).not.toMatch(/fail/);
  });
});

describe("GET /api/at-risk", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.client.findMany.mockResolvedValue([]);
    prisma.progressLog.findMany.mockResolvedValue([]);
  });

  it("needs a signed-in coach", async () => {
    const res = await plainRequest(app).get("/api/at-risk");
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "You are not signed in." });
  });

  it("rejects a bad date", async () => {
    const res = await request(app).get("/api/at-risk?date=nope");
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("reads only this coach's clients and logs and returns the listed clients", async () => {
    prisma.client.findMany.mockResolvedValue([{ id: "c1", name: "Maya", goal: "Fat loss", createdAt: OLD }]);
    prisma.progressLog.findMany.mockResolvedValue([
      { clientId: "c1", date: "2026-11-03", weightKg: null, adherence: 40 },
      { clientId: "c1", date: "2026-11-10", weightKg: null, adherence: 50 },
    ]);
    const res = await request(app).get(`/api/at-risk?date=${TODAY}`);
    expect(prisma.client.findMany.mock.calls[0][0].where.coachId).toBe(TEST_COACH_ID);
    expect(prisma.progressLog.findMany.mock.calls[0][0].where.coachId).toBe(TEST_COACH_ID);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      date: TODAY,
      clients: [
        {
          clientId: "c1",
          clientName: "Maya",
          reasons: [{ rule: "adherence", text: "Adherence 45% over the last 2 weeks" }],
        },
      ],
    });
  });

  it("returns an empty list when nobody needs attention", async () => {
    const res = await request(app).get(`/api/at-risk?date=${TODAY}`);
    expect(res.body).toEqual({ date: TODAY, clients: [] });
  });
});

describe("only 'fat loss' and 'muscle gain' goals are judged on weight direction", () => {
  it.each(["Weight gain for rehab", "Cut and bulk plan", "Lose weight", "General fitness"])("%s: no weight reason", (goal) => {
    const rising = ["2026-11-02", "2026-11-05", "2026-11-08", "2026-11-11"].map((d, i) => log(d, { weightKg: 70 + i, adherence: 90 }));
    const falling = ["2026-11-02", "2026-11-05", "2026-11-08", "2026-11-11"].map((d, i) => log(d, { weightKg: 70 - i, adherence: 90 }));
    for (const logs of [rising, falling]) {
      const reasons = run(client("x", goal), logs).flatMap((r) => r.reasons.map((x) => x.rule));
      expect(reasons).not.toContain("weight");
    }
  });
});
