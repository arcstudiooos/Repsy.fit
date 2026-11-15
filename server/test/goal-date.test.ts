// The goal date and its countdown (Inspo C5, Nov 2026).
//
// Unit-tested from the server suite because the formatting lives in client/src/lib and the browser
// fixture cannot easily vary "today" - and a countdown wrong by a day is worse than no countdown.
import request, { TEST_COACH_ID } from "./helpers/authedRequest.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { countdownLabel, daysUntil, goalLine } from "../../client/src/lib/goalDate.js";

const { prisma } = vi.hoisted(() => ({
  prisma: { client: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn(), count: vi.fn() }, coach: { findUnique: vi.fn() }, threadMessage: { create: vi.fn() } },
}));
vi.mock("../src/db.js", () => ({ prisma }));

const { app } = await import("../src/app.js");

const TODAY = "2026-11-16";

beforeEach(() => {
  vi.clearAllMocks();
  prisma.client.findFirst.mockResolvedValue({ id: "cl1", coachId: TEST_COACH_ID, name: "Maya" });
  prisma.client.update.mockImplementation(({ data }: { data: Record<string, unknown> }) => ({ id: "cl1", ...data }));
  prisma.coach.findUnique.mockResolvedValue({ welcomeMessage: "" });
});

describe("daysUntil", () => {
  it("counts whole days both ways", () => {
    expect(daysUntil("2026-11-16", TODAY)).toBe(0);
    expect(daysUntil("2026-11-17", TODAY)).toBe(1);
    expect(daysUntil("2026-11-15", TODAY)).toBe(-1);
    expect(daysUntil("2026-12-16", TODAY)).toBe(30);
  });

  it("does not drift across a daylight-saving change", () => {
    // UTC arithmetic: 28 and 29 March 2026 straddle the European clock change.
    expect(daysUntil("2026-03-30", "2026-03-27")).toBe(3);
  });

  it("returns null for junk rather than NaN", () => {
    expect(daysUntil("not a date", TODAY)).toBeNull();
    expect(daysUntil("2026-11-16", "nonsense")).toBeNull();
  });
});

describe("countdownLabel", () => {
  it("speaks the way a coach would", () => {
    expect(countdownLabel("2026-11-16", TODAY)).toBe("today");
    expect(countdownLabel("2026-11-17", TODAY)).toBe("tomorrow");
    expect(countdownLabel("2026-11-19", TODAY)).toBe("in 3 days");
  });

  it("rounds to weeks and months once exact days stop being useful", () => {
    expect(countdownLabel("2026-12-14", TODAY)).toBe("in about 4 weeks");
    expect(countdownLabel("2027-02-14", TODAY)).toBe("in about 3 months");
  });

  it("says a passed date has passed, instead of counting negatives", () => {
    expect(countdownLabel("2026-11-15", TODAY)).toBe("yesterday");
    expect(countdownLabel("2026-11-01", TODAY)).toBe("15 days ago");
  });

  it("says nothing when there is no date, or the date is junk", () => {
    expect(countdownLabel(null, TODAY)).toBeNull();
    expect(countdownLabel("soon", TODAY)).toBeNull();
  });
});

describe("goalLine", () => {
  it("puts the event and the countdown together", () => {
    expect(goalLine("2026-12-14", "Wedding", TODAY)).toBe("Wedding in about 4 weeks");
  });

  it("shows the words alone when there is no date, because a goal is still a goal", () => {
    expect(goalLine(null, "Half marathon", TODAY)).toBe("Half marathon");
  });

  it("shows the countdown alone when the coach wrote no words", () => {
    expect(goalLine("2026-11-17", "  ", TODAY)).toBe("tomorrow");
  });

  it("says nothing when there is nothing to say", () => {
    expect(goalLine(null, "", TODAY)).toBeNull();
    expect(goalLine(null, "   ", TODAY)).toBeNull();
  });
});

describe("PATCH /api/clients/:id/goal", () => {
  it("saves the date and what it is for", async () => {
    const res = await request(app).patch("/api/clients/cl1/goal").send({ goalDate: "2026-12-14", goalEvent: "Wedding" });
    expect(res.status).toBe(200);
    expect(prisma.client.update.mock.calls[0][0].data).toEqual({ goalDate: "2026-12-14", goalEvent: "Wedding" });
  });

  it("clears the date with an empty string or null, and KEEPS the words", async () => {
    // A coach who mistypes the day has not changed what the client is training for.
    for (const goalDate of ["", null]) {
      vi.clearAllMocks();
      prisma.client.findFirst.mockResolvedValue({ id: "cl1", coachId: TEST_COACH_ID });
      prisma.client.update.mockResolvedValue({ id: "cl1" });
      await request(app).patch("/api/clients/cl1/goal").send({ goalDate });
      expect(prisma.client.update.mock.calls[0][0].data).toEqual({ goalDate: null });
    }
  });

  it("refuses a date that is not a date", async () => {
    const res = await request(app).patch("/api/clients/cl1/goal").send({ goalDate: "next summer" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Choose a real date, or clear it.");
    expect(prisma.client.update).not.toHaveBeenCalled();
  });

  it("refuses an essay for the event", async () => {
    const res = await request(app).patch("/api/clients/cl1/goal").send({ goalEvent: "x".repeat(81) });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("80 characters or fewer");
  });

  it("refuses a field that is not its business", async () => {
    const res = await request(app).patch("/api/clients/cl1/goal").send({ name: "Renamed" });
    expect(res.status).toBe(400);
    expect(prisma.client.update).not.toHaveBeenCalled();
  });

  it("needs something to change", async () => {
    expect((await request(app).patch("/api/clients/cl1/goal").send({})).status).toBe(400);
  });

  it("404s on another coach's client", async () => {
    prisma.client.findFirst.mockResolvedValue(null);
    expect((await request(app).patch("/api/clients/someone-elses/goal").send({ goalEvent: "x" })).status).toBe(404);
  });
});

describe("a goal can be set when the client is created", () => {
  it("accepts a date and an event", async () => {
    prisma.client.count.mockResolvedValue(0);
    prisma.client.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => ({ id: "new", ...data }));
    const res = await request(app)
      .post("/api/clients")
      .send({ name: "Asha", goalDate: "2026-12-14", goalEvent: "Wedding" });
    expect([200, 201]).toContain(res.status);
    expect(prisma.client.create.mock.calls[0][0].data).toMatchObject({ goalDate: "2026-12-14", goalEvent: "Wedding" });
  });

  it("refuses a nonsense date at creation too", async () => {
    const res = await request(app).post("/api/clients").send({ name: "Asha", goalDate: "soon" });
    expect(res.status).toBe(400);
    expect(prisma.client.create).not.toHaveBeenCalled();
  });
});
