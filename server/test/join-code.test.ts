// Prompt 76: coach join codes - the code format, and the routes with Prisma mocked.
import request from "supertest";
import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { prisma } = vi.hoisted(() => ({
  prisma: { coach: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() } },
}));
vi.mock("../src/db.js", () => ({ prisma }));

process.env.SESSION_SECRET = "test-secret-test-secret-test-secret";

import { app } from "../src/app.js";
import { resetRateLimits } from "../src/auth/rateLimit.js";
import { CODE_ALPHABET, JOIN_CODE_RE, namePrefix, newJoinCode, normalizeJoinCode } from "../src/auth/joinCode.js";
import { BAD_JOIN_CODE } from "../src/routes/joinCode.js";
import signedIn, { asCoach } from "./helpers/authedRequest.js";

type Row = { id: string; name: string; joinCode: string | null; joinCodeActive: boolean; approveNewClients: boolean };
let coaches: Row[];

beforeEach(() => {
  vi.clearAllMocks();
  resetRateLimits();
  delete process.env.APP_URL;
  coaches = [
    { id: "coach-1", name: "Anna Rivers", joinCode: null, joinCodeActive: true, approveNewClients: false },
    { id: "coach-2", name: "Bo", joinCode: "BOXX-ABCDEF", joinCodeActive: true, approveNewClients: false },
  ];
  prisma.coach.findUnique.mockImplementation(async ({ where }: { where: { id?: string; joinCode?: string } }) =>
    coaches.find((c) => (where.id !== undefined ? c.id === where.id : c.joinCode === where.joinCode)) ?? null,
  );
  prisma.coach.update.mockImplementation(async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
    if (data.joinCode && coaches.some((c) => c.id !== where.id && c.joinCode === data.joinCode)) {
      throw new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "test" });
    }
    const c = coaches.find((x) => x.id === where.id)!;
    Object.assign(c, data);
    return { ...c };
  });
  prisma.coach.updateMany.mockImplementation(async ({ where, data }: { where: { id: string; joinCode: null }; data: Partial<Row> }) => {
    const c = coaches.find((x) => x.id === where.id && x.joinCode === null);
    if (!c) return { count: 0 };
    if (coaches.some((x) => x.id !== where.id && x.joinCode === data.joinCode)) {
      throw new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "test" });
    }
    Object.assign(c, data);
    return { count: 1 };
  });
});

describe("join code format", () => {
  it("is 4 name letters + '-' + 6 unambiguous characters", () => {
    expect(namePrefix("Anna Rivers")).toBe("ANNA");
    expect(namePrefix("Jo")).toBe("JOXX");
    expect(namePrefix("Zoë 'Z' O'Neil")).toBe("ZOEZ");
    expect(namePrefix("李 42")).toBe("XXXX");
    for (let i = 0; i < 500; i++) {
      const code = newJoinCode("Anna");
      expect(code).toMatch(JOIN_CODE_RE);
      expect(code.slice(5)).not.toMatch(/[01OIL]/);
    }
    expect(CODE_ALPHABET).toHaveLength(31);
    expect(CODE_ALPHABET).not.toMatch(/[01OIL]/);
  });

  it("drops biased bytes so every character is equally likely", () => {
    // 248..255 are skipped; 0 -> '2', 30 -> 'Z', 31 -> '2' again.
    const bytes = Buffer.from([255, 250, 0, 30, 31, 248, 1, 2, 3, 4, 5, 6]);
    expect(newJoinCode("Bo", () => bytes)).toBe("BOXX-2Z2345");
  });

  it("looks codes up trimmed and upper-cased; rejects anything else", () => {
    expect(normalizeJoinCode(" anna-7k2q8m ")).toBe("ANNA-7K2Q8M");
    expect(normalizeJoinCode("ANNA-7K2Q8")).toBeNull();
    expect(normalizeJoinCode("ANNA-7K2Q8O")).toBeNull(); // O is not in the alphabet
    expect(normalizeJoinCode(42)).toBeNull();
  });
});

describe("GET /api/join-code (coach)", () => {
  it("needs a signed-in coach", async () => {
    expect((await request(app).get("/api/join-code")).status).toBe(401);
  });

  it("makes the code on first use, then returns the same one", async () => {
    const first = await signedIn(app).get("/api/join-code");
    expect(first.status).toBe(200);
    expect(first.body.code).toMatch(/^ANNA-[2-9A-HJKMNP-Z]{6}$/);
    expect(first.body).toMatchObject({ active: true, approveNewClients: false });
    expect(first.body.link).toMatch(new RegExp(`/join/${first.body.code}$`));
    const again = await signedIn(app).get("/api/join-code");
    expect(again.body.code).toBe(first.body.code);
    expect(prisma.coach.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.coach.updateMany.mock.calls[0][0].where).toEqual({ id: "coach-1", joinCode: null });
  });

  it("builds the link from APP_URL when set, and never from the Host header", async () => {
    process.env.APP_URL = "https://app.repsy.fit/";
    const res = await signedIn(app).get("/api/join-code").set("Host", "evil.example");
    expect(res.body.link).toBe(`https://app.repsy.fit/join/${res.body.code}`);
  });

  it("two first requests at once agree on one code", async () => {
    // Both see an empty column; only one conditional write lands, and both return the stored code.
    const [a, b] = await Promise.all([signedIn(app).get("/api/join-code"), signedIn(app).get("/api/join-code")]);
    expect(a.body.code).toBe(b.body.code);
    expect(coaches[0].joinCode).toBe(a.body.code);
  });

  it("retries when a new code clashes with another coach's", async () => {
    let n = 0;
    const real = prisma.coach.updateMany.getMockImplementation()!;
    prisma.coach.updateMany.mockImplementation(async (args: { where: { id: string; joinCode: null }; data: Partial<Row> }) => {
      if (n++ === 0) return real({ ...args, data: { ...args.data, joinCode: "BOXX-ABCDEF" } });
      return real(args);
    });
    const res = await signedIn(app).get("/api/join-code");
    expect(res.status).toBe(200);
    expect(res.body.code).not.toBe("BOXX-ABCDEF");
    expect(prisma.coach.updateMany).toHaveBeenCalledTimes(2);
  });

  it("only ever reads and writes the signed-in coach's row", async () => {
    await asCoach(app, "coach-2").get("/api/join-code");
    await asCoach(app, "coach-2").post("/api/join-code/regenerate");
    for (const [args] of prisma.coach.update.mock.calls) expect(args.where).toEqual({ id: "coach-2" });
    for (const [args] of prisma.coach.updateMany.mock.calls) expect(args.where.id).toBe("coach-2");
    expect(coaches[0].joinCode).toBeNull();
  });
});

describe("POST /api/join-code/regenerate", () => {
  it("replaces the code; the old one stops working at once", async () => {
    const old = (await asCoach(app, "coach-2").get("/api/join-code")).body.code;
    expect((await request(app).get(`/api/join/${old}`)).status).toBe(200);
    const res = await asCoach(app, "coach-2").post("/api/join-code/regenerate");
    expect(res.status).toBe(200);
    expect(res.body.code).not.toBe(old);
    expect(res.body.code).toMatch(/^BOXX-/);
    expect((await request(app).get(`/api/join/${old}`)).body).toEqual({ error: BAD_JOIN_CODE });
    expect((await request(app).get(`/api/join/${res.body.code}`)).body).toEqual({ coachName: "Bo" });
  });
});

describe("PATCH /api/join-code", () => {
  it("turns the code off and on, and sets approval", async () => {
    let res = await asCoach(app, "coach-2").patch("/api/join-code").send({ active: false });
    expect(res.body).toMatchObject({ code: "BOXX-ABCDEF", active: false, approveNewClients: false });
    res = await asCoach(app, "coach-2").patch("/api/join-code").send({ approveNewClients: true, active: true });
    expect(res.body).toMatchObject({ active: true, approveNewClients: true });
  });

  it("makes a code first if the coach has none", async () => {
    const res = await signedIn(app).patch("/api/join-code").send({ approveNewClients: true });
    expect(res.status).toBe(200);
    expect(res.body.code).toMatch(/^ANNA-/);
    expect(res.body.approveNewClients).toBe(true);
  });

  it.each([
    [{}, "Nothing to change."],
    [{ active: "no" }, "active must be true or false."],
    [{ joinCode: "MINE-222222" }, "Only active and approveNewClients can be changed."],
  ])("rejects %j", async (body, error) => {
    const res = await signedIn(app).patch("/api/join-code").send(body);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error });
  });
});

describe("GET /api/join/:code (public)", () => {
  it("returns only the coach's name, for any letter case", async () => {
    const res = await request(app).get("/api/join/boxx-abcdef");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ coachName: "Bo" });
  });

  it("answers unknown, malformed and turned-off codes with the same 404", async () => {
    coaches[1].joinCodeActive = false;
    for (const code of ["BOXX-ABCDEF", "NOPE-222222", "garbage", "BOXX-ABCDE0"]) {
      const res = await request(app).get(`/api/join/${code}`);
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: BAD_JOIN_CODE });
    }
  });

  it("is rate limited", async () => {
    let last = 0;
    for (let i = 0; i < 61; i++) last = (await request(app).get("/api/join/NOPE-222222")).status;
    expect(last).toBe(429);
  });
});
