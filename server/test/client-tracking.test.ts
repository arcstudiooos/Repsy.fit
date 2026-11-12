// Prompt 80: the client's habits, daily and weekly check-ins, targets and plan meals; the coach's
// targets route and meals on Nutrition plans. Prisma mocked.
import supertest from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => {
  const mock: Record<string, any> = {
    client: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    habit: { findMany: vi.fn(), findFirst: vi.fn() },
    habitLog: { upsert: vi.fn(), findUnique: vi.fn() },
    dailyCheckIn: { findUnique: vi.fn(), upsert: vi.fn() },
    progressLog: { findMany: vi.fn(), create: vi.fn(), findFirst: vi.fn() },
    reviewItem: { create: vi.fn() },
    assignment: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
    meal: { findMany: vi.fn(), count: vi.fn() },
  };
  mock.$transaction = vi.fn((fn: (tx: unknown) => unknown) => Promise.resolve(fn(mock)));
  return mock;
});
vi.mock("../src/db.js", () => ({ prisma: prismaMock }));
process.env.SESSION_SECRET = "test-secret-test-secret-test-secret";

const { app } = await import("../src/app.js");
const { CLIENT_SESSION_COOKIE, signClientSession } = await import("../src/auth/clientSession.js");
const { resetRateLimits } = await import("../src/auth/rateLimit.js");
const { isRecentDay, clientToday, TOO_FAR_BACK, COACH_ENTERED, ALREADY_SENT } = await import("../src/routes/clientTracking.js");
const signedIn = (await import("./helpers/authedRequest.js")).default;

const utc = (offsetDays: number) => new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);
const TODAY = utc(0);
let status = "active";
const cookie = () => `${CLIENT_SESSION_COOKIE}=${signClientSession("c1", 0)}`;
const as = (m: "get" | "put" | "post", url: string) => (supertest(app) as any)[m](url).set("Cookie", cookie());

beforeEach(() => {
  vi.clearAllMocks();
  resetRateLimits();
  status = "active";
  prismaMock.client.findUnique.mockImplementation(async ({ select }: { select: Record<string, boolean> }) => {
    if (select?.clientSessionVersion) return { clientSessionVersion: 0, passwordHash: "$2b$x", joinStatus: status };
    if (select?.calorieTarget) return { calorieTarget: 2100, proteinTargetG: 140, weeklyCheckInDay: 0 };
    return { id: "c1", coachId: "coach-1" };
  });
  prismaMock.habit.findMany.mockResolvedValue([{ id: "h1", name: "Steps", logs: [{ date: TODAY }, { date: utc(-1) }] }]);
  prismaMock.habit.findFirst.mockResolvedValue({ id: "h1" });
  prismaMock.habitLog.upsert.mockImplementation(async ({ create }: { create: { habitId: string; date: string; done: boolean } }) => create);
  prismaMock.dailyCheckIn.findUnique.mockResolvedValue(null);
  prismaMock.dailyCheckIn.upsert.mockImplementation(async ({ create }: { create: object }) => create);
  prismaMock.progressLog.findMany.mockResolvedValue([]);
  prismaMock.progressLog.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "log-1", createdAt: new Date(), weightKg: null, adherence: null, workoutsDone: null, ...data }));
  prismaMock.reviewItem.create.mockResolvedValue({});
  prismaMock.habitLog.findUnique.mockResolvedValue(null);
  prismaMock.progressLog.findFirst.mockResolvedValue(null);
});

describe("the today / yesterday window", () => {
  const req = (h?: string) => ({ get: (n: string) => (n.toLowerCase() === "x-client-date" ? h : undefined) }) as never;
  const now = new Date("2026-11-12T20:00:00Z"); // already the 13th in India
  it("uses the client's local date from X-Client-Date when it is within a day of UTC", () => {
    expect(clientToday(req("2026-11-13"), now)).toBe("2026-11-13");
    expect(clientToday(req("2026-11-11"), now)).toBe("2026-11-11");
    expect(clientToday(req("2026-11-15"), now)).toBe("2026-11-12");
    expect(clientToday(req("nonsense"), now)).toBe("2026-11-12");
    expect(clientToday(req(), now)).toBe("2026-11-12");
  });
  it("allows exactly that day and the day before", () => {
    expect(isRecentDay("2026-11-13", "2026-11-13")).toBe(true);
    expect(isRecentDay("2026-11-12", "2026-11-13")).toBe(true);
    for (const d of ["2026-11-11", "2026-11-14"]) expect(isRecentDay(d, "2026-11-13"), d).toBe(false);
  });
  it("the route refuses the day before yesterday and tomorrow in the client's calendar", async () => {
    const tomorrow = utc(1);
    const res = await as("put", `/api/client-auth/my-checkins/${tomorrow}`).set("X-Client-Date", TODAY).send({ mood: 3 });
    expect(res.body).toEqual({ error: TOO_FAR_BACK });
    const dbyd = await as("put", `/api/client-auth/my-checkins/${utc(-2)}`).set("X-Client-Date", TODAY).send({ mood: 3 });
    expect(dbyd.body).toEqual({ error: TOO_FAR_BACK });
  });
});

describe("habits", () => {
  it("lists only the client's own active habits with this week and streaks", async () => {
    const res = await as("get", `/api/client-auth/my-habits?date=${TODAY}`);
    expect(res.status).toBe(200);
    expect(prismaMock.habit.findMany.mock.calls[0][0].where).toEqual({ clientId: "c1", active: true });
    expect(res.body.habits[0]).toMatchObject({ id: "h1", name: "Steps", currentStreak: 2 });
    expect(res.body.habits[0].week.at(-1)).toBe(true);
  });

  it("ticks today on an own active habit; refuses other days, other clients' habits and extra fields", async () => {
    expect((await as("put", `/api/client-auth/my-habits/h1/${TODAY}`).send({ done: true })).body).toEqual({ habitId: "h1", date: TODAY, done: true });
    expect(prismaMock.habit.findFirst.mock.calls[0][0].where).toEqual({ id: "h1", clientId: "c1", active: true });
    const old = await as("put", `/api/client-auth/my-habits/h1/${utc(-5)}`).send({ done: true });
    expect(old.status).toBe(400);
    expect(old.body).toEqual({ error: TOO_FAR_BACK });
    prismaMock.habit.findFirst.mockResolvedValueOnce(null);
    expect((await as("put", `/api/client-auth/my-habits/not-mine/${TODAY}`).send({ done: true })).status).toBe(404);
    expect((await as("put", `/api/client-auth/my-habits/h1/${TODAY}`).send({ done: true, habitId: "x" })).status).toBe(400);
    expect(prismaMock.habitLog.upsert.mock.calls[0][0].create.enteredBy).toBe("client");
  });

  it("never changes a coach's tick", async () => {
    prismaMock.habitLog.findUnique.mockResolvedValueOnce({ enteredBy: "coach" });
    const res = await as("put", `/api/client-auth/my-habits/h1/${TODAY}`).send({ done: false });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: COACH_ENTERED });
    expect(prismaMock.habitLog.upsert).not.toHaveBeenCalled();
  });
});

describe("daily check-in", () => {
  it("reads and saves the client's own day with the coach's rules, stored under their coach", async () => {
    expect((await as("get", `/api/client-auth/my-checkins/${TODAY}`)).body).toEqual({ checkIn: null });
    const res = await as("put", `/api/client-auth/my-checkins/${TODAY}`).send({ energy: 4, mood: 5, sleepHours: 7.5, foodNote: " salad " });
    expect(res.status).toBe(201);
    const arg = prismaMock.dailyCheckIn.upsert.mock.calls[0][0];
    expect(arg.where).toEqual({ clientId_date: { clientId: "c1", date: TODAY } });
    expect(arg.create).toMatchObject({ clientId: "c1", coachId: "coach-1", date: TODAY, energy: 4, mood: 5, sleepHours: 7.5, foodNote: "salad", steps: null, enteredBy: "client" });
    expect(arg.update.enteredBy).toBeUndefined();
  });

  it("never overwrites a day the coach entered", async () => {
    prismaMock.dailyCheckIn.findUnique.mockResolvedValueOnce({ id: "d1", enteredBy: "coach" });
    const res = await as("put", `/api/client-auth/my-checkins/${TODAY}`).send({ mood: 1 });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: COACH_ENTERED });
    expect(prismaMock.dailyCheckIn.upsert).not.toHaveBeenCalled();
  });

  it.each([
    [{ energy: 6 }, "energy must be a whole number from 1 to 5."],
    [{ sleepHours: 7.25 }, "sleepHours must be a number of hours from 0 to 16, with at most one decimal."],
    [{ steps: -1 }, "steps must be a whole number from 0 to 100000."],
    [{ coachId: "coach-2" }, "Only the check-in fields can be sent."],
    [{ clientId: "c2" }, "Only the check-in fields can be sent."],
  ])("uses the coach's validation: %j", async (body, error) => {
    const res = await as("put", `/api/client-auth/my-checkins/${TODAY}`).send(body);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error });
  });

  it("refuses back-filling beyond yesterday", async () => {
    const res = await as("put", `/api/client-auth/my-checkins/${utc(-4)}`).send({ mood: 3 });
    expect(res.body).toEqual({ error: TOO_FAR_BACK });
    expect(prismaMock.dailyCheckIn.upsert).not.toHaveBeenCalled();
  });
});

describe("weekly check-in", () => {
  it("creates a progress log under the client's coach and queues it for the coach's review", async () => {
    const res = await as("post", "/api/client-auth/my-progress").send({ date: TODAY, weightKg: 68.2, adherence: 90, workoutsDone: 3, note: "Good week" });
    expect(res.status).toBe(201);
    expect(prismaMock.progressLog.create.mock.calls[0][0].data).toEqual({ enteredBy: "client", date: TODAY, weightKg: 68.2, adherence: 90, workoutsDone: 3, note: "Good week", clientId: "c1", coachId: "coach-1" });
    expect(prismaMock.reviewItem.create.mock.calls[0][0].data).toMatchObject({ coachId: "coach-1", clientId: "c1", kind: "checkin", sourceId: "log-1" });
  });
  it.each([
    [{ date: "2026-02-30" }, "date must be a real date in YYYY-MM-DD form."],
    [{ date: TODAY, adherence: 101 }, "adherence must be between 0 and 100."],
    [{ date: TODAY, note: "x".repeat(501) }, "Please keep the note under 500 characters."],
    [{ date: TODAY, coachId: "coach-2" }, "Only date, weightKg, adherence, workoutsDone and note can be sent."],
  ])("validates %j", async (body, error) => {
    const res = await as("post", "/api/client-auth/my-progress").send(body);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error });
  });
  it("one weekly check-in per day: a second send is refused and queues nothing", async () => {
    prismaMock.progressLog.findFirst.mockResolvedValueOnce({ id: "log-0" });
    const res = await as("post", "/api/client-auth/my-progress").send({ date: TODAY, weightKg: 68 });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: ALREADY_SENT });
    expect(prismaMock.progressLog.findFirst.mock.calls[0][0].where).toEqual({ clientId: "c1", date: TODAY, enteredBy: "client" });
    expect(prismaMock.progressLog.create).not.toHaveBeenCalled();
    expect(prismaMock.reviewItem.create).not.toHaveBeenCalled();
  });
  it("refuses an old date", async () => {
    expect((await as("post", "/api/client-auth/my-progress").send({ date: utc(-10), weightKg: 70 })).body).toEqual({ error: TOO_FAR_BACK });
  });
  it("lists only the client's own logs", async () => {
    await as("get", "/api/client-auth/my-progress");
    expect(prismaMock.progressLog.findMany.mock.calls[0][0].where).toEqual({ clientId: "c1" });
  });
});

describe("targets and plan meals (client)", () => {
  it("returns the client's own targets", async () => {
    expect((await as("get", "/api/client-auth/my-targets")).body).toEqual({ calorieTarget: 2100, proteinTargetG: 140, weeklyCheckInDay: 0 });
  });
  it("a plan's meals come only from the plan's own coach's library, in the coach's order", async () => {
    prismaMock.assignment.findFirst.mockResolvedValue({ id: "a1", type: "Nutrition", title: "Day", details: "", reasoning: "", status: "Active", date: TODAY });
    prismaMock.assignment.findUnique.mockResolvedValue({ mealIds: ["m2", "m1"], coachId: "coach-1" });
    prismaMock.meal.findMany.mockResolvedValue([{ id: "m1", name: "Oats" }, { id: "m2", name: "Eggs" }]);
    const res = await as("get", "/api/client-auth/my-assignments/a1");
    expect(prismaMock.meal.findMany.mock.calls[0][0].where).toEqual({ id: { in: ["m2", "m1"] }, coachId: "coach-1" });
    expect(res.body.meals.map((m: { name: string }) => m.name)).toEqual(["Eggs", "Oats"]);
  });
});

describe("pending clients and coaches", () => {
  it("a pending client gets 403 on every tracking route; a coach session gets 401", async () => {
    status = "pending";
    for (const [m, url] of [["get", "/api/client-auth/my-habits"], ["get", `/api/client-auth/my-checkins/${TODAY}`], ["get", "/api/client-auth/my-progress"], ["get", "/api/client-auth/my-targets"]] as const) {
      expect((await as(m, url)).status, url).toBe(403);
    }
    expect((await signedIn(app).get("/api/client-auth/my-habits")).status).toBe(401);
  });
});

describe("coach: targets and meals on Nutrition plans", () => {
  beforeEach(() => {
    prismaMock.client.findFirst.mockResolvedValue({ id: "c1", coachId: "coach-1" });
    prismaMock.client.update.mockImplementation(async ({ data }: { data: object }) => ({ id: "c1", ...data }));
    prismaMock.assignment.create.mockImplementation(async ({ data }: { data: object }) => ({ id: "a9", ...data }));
  });
  it("saves the client's targets; validates; only this coach's client", async () => {
    const ok = await signedIn(app).patch("/api/clients/c1/targets").send({ calorieTarget: 2100, proteinTargetG: 140 });
    expect(ok.status).toBe(200);
    expect(prismaMock.client.update.mock.calls[0][0]).toEqual({ where: { id: "c1" }, data: { calorieTarget: 2100, proteinTargetG: 140 } });
    expect((await signedIn(app).patch("/api/clients/c1/targets").send({ calorieTarget: 50 })).status).toBe(400);
    // Everything the macro calculator can produce fits (e.g. a small sedentary client, a very heavy one).
    expect((await signedIn(app).patch("/api/clients/c1/targets").send({ calorieTarget: 780, proteinTargetG: 520 })).status).toBe(200);
    expect((await signedIn(app).patch("/api/clients/c1/targets").send({ name: "x" })).status).toBe(400);
    prismaMock.client.findFirst.mockResolvedValueOnce(null);
    expect((await signedIn(app).patch("/api/clients/other/targets").send({ calorieTarget: 2000 })).status).toBe(404);
  });
  it("attaches only the coach's own meals, and only to Nutrition plans", async () => {
    const base = { title: "Day", details: "Eat well", date: TODAY };
    prismaMock.meal.count.mockResolvedValueOnce(2);
    const ok = await signedIn(app).post("/api/clients/c1/assignments").send({ ...base, type: "Nutrition", mealIds: ["m1", "m2", "m1"] });
    expect(ok.status).toBe(201);
    expect(prismaMock.meal.count.mock.calls[0][0].where).toEqual({ id: { in: ["m1", "m2"] }, coachId: "coach-1" });
    expect(prismaMock.assignment.create.mock.calls[0][0].data.mealIds).toEqual(["m1", "m2"]);
    prismaMock.meal.count.mockResolvedValueOnce(1);
    const foreign = await signedIn(app).post("/api/clients/c1/assignments").send({ ...base, type: "Nutrition", mealIds: ["m1", "someone-elses"] });
    expect(foreign.body).toEqual({ error: "One of the meals was not found in your library." });
    const wrongType = await signedIn(app).post("/api/clients/c1/assignments").send({ ...base, type: "Workout", mealIds: ["m1"] });
    expect(wrongType.body).toEqual({ error: "Meals can only be attached to a Nutrition plan." });
  });
});
