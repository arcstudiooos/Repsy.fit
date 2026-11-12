// Prompt 78: "Continue with Google" for CLIENTS - sign in and join with a code - through the shared
// callback, with Google's token endpoint and the database mocked.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => {
  const mock: Record<string, any> = {
    coach: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
    client: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
    clientInvite: { findMany: vi.fn(), deleteMany: vi.fn() },
    $queryRaw: vi.fn().mockResolvedValue([{ "1": 1 }]),
  };
  mock.$transaction = vi.fn((fn: (tx: unknown) => unknown) => Promise.resolve(fn(mock)));
  return mock;
});
vi.mock("../src/db.js", () => ({ prisma: prismaMock }));
vi.mock("../src/auth/claimDemoData.js", () => ({ claimDemoData: vi.fn().mockResolvedValue(undefined) }));

const { app } = await import("../src/app.js");
const supertest = (await import("supertest")).default;
const { GOOGLE_STATE_COOKIE, attemptFor, newAttempt } = await import("../src/auth/google.js");
const { clientFail } = await import("../src/routes/clientGoogle.js");
const { SESSION_COOKIE } = await import("../src/auth/session.js");
const { CLIENT_SESSION_COOKIE } = await import("../src/auth/clientSession.js");
const { resetRateLimits } = await import("../src/auth/rateLimit.js");
const { verifyPassword } = await import("../src/auth/password.js");

const CLIENT_ID = "cid.apps.googleusercontent.com";
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
const idToken = (claims: Record<string, unknown>) => `${b64({ alg: "RS256" })}.${b64(claims)}.sig`;
const claims = (over: Record<string, unknown> = {}) => ({
  iss: "https://accounts.google.com", aud: CLIENT_ID, exp: Math.floor(Date.now() / 1000) + 600,
  sub: "g-maya", email: "maya@gmail.com", email_verified: true, name: "Maya Patel", ...over,
});
const COACH = { id: "coach-1", name: "Anna", joinCode: "ANNA-7K2Q8M", joinCodeActive: true, approveNewClients: false };

let fetchSpy: ReturnType<typeof vi.spyOn>;
const useToken = (over: Record<string, unknown> = {}) =>
  fetchSpy.mockResolvedValue(new Response(JSON.stringify({ id_token: idToken(claims(over)) }), { status: 200 }));

beforeEach(() => {
  resetRateLimits();
  vi.clearAllMocks();
  process.env.GOOGLE_CLIENT_ID = CLIENT_ID;
  process.env.GOOGLE_CLIENT_SECRET = "secret";
  process.env.APP_URL = "https://app.repsy.fit";
  fetchSpy = vi.spyOn(globalThis, "fetch");
  useToken();
  COACH.joinCodeActive = true;
  COACH.approveNewClients = false;
  prismaMock.coach.findUnique.mockImplementation(async ({ where }: { where: { joinCode?: string } }) => (where.joinCode === COACH.joinCode ? COACH : null));
  prismaMock.client.findUnique.mockResolvedValue(null);
  prismaMock.client.update.mockImplementation(async ({ where }: { where: { id: string } }) => ({ id: where.id, clientSessionVersion: 0 }));
  prismaMock.client.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.client.create.mockImplementation(async () => ({ id: "c-new", clientSessionVersion: 0 }));
  prismaMock.clientInvite.findMany.mockResolvedValue([]);
});
afterEach(() => {
  fetchSpy.mockRestore();
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_SECRET;
  delete process.env.APP_URL;
});

/** /start (client sign-in, or join with ?code=), then the shared callback with the echoed state. */
async function go(code?: string) {
  const start = await supertest(app).get(`/api/client-auth/google/start${code ? `?code=${code}` : ""}`).set("Host", "app.repsy.fit");
  const cookie = (start.headers["set-cookie"] as unknown as string[]).find((c) => c.startsWith(GOOGLE_STATE_COOKIE))!;
  const state = new URL(start.headers.location).searchParams.get("state")!;
  const res = await supertest(app).get(`/api/auth/callback/google?code=abc&state=${state}`).set("Cookie", cookie.split(";")[0]);
  return { start, res, cookies: ([] as string[]).concat(res.headers["set-cookie"] ?? []) };
}
const hasClientCookie = (c: string[]) => c.some((x) => x.startsWith(`${CLIENT_SESSION_COOKIE}=`) && !x.includes("Expires=Thu, 01 Jan 1970"));
const hasCoachCookie = (c: string[]) => c.some((x) => x.startsWith(`${SESSION_COOKIE}=`));

describe("the attempt kind in the state cookie", () => {
  it("round-trips coach, client and join; an old cookie without a kind is a coach attempt", () => {
    for (const kind of ["coach", "client", "join:ANNA-7K2Q8M"] as const) {
      const a = newAttempt(kind);
      expect(attemptFor(a.cookie, a.state)).toEqual({ verifier: a.verifier, kind });
    }
    const old = newAttempt("coach");
    const legacy = old.cookie.split(".").slice(0, 2).join(".");
    expect(attemptFor(legacy, old.state)?.kind).toBe("coach");
    expect(attemptFor(old.cookie, "wrong-state")).toBeNull();
  });

  it("refuses an unknown or malformed kind instead of treating it as a coach attempt", () => {
    const a = newAttempt("client");
    const [s, v] = a.cookie.split(".");
    for (const bad of ["joinx", "join:../app", "join:anna-7k2q8m", "admin", "client.extra"]) {
      expect(attemptFor(`${s}.${v}.${bad}`, s), bad).toBeNull();
    }
  });

  it("client states carry a prefix so a lost cookie still lands on the client pages", () => {
    expect(newAttempt("client").state.startsWith("k~")).toBe(true);
    expect(newAttempt("join:ANNA-7K2Q8M").state.startsWith("k~")).toBe(true);
    expect(newAttempt("coach").state).not.toContain("~");
  });

  it("clientFail only puts a valid, encoded code in the path", () => {
    expect(clientFail("link", "anna-7k2q8m")).toBe("/join/ANNA-7K2Q8M?google=link");
    expect(clientFail("link", "../app")).toBe("/client/login?google=link");
    expect(clientFail("a&b", null)).toBe("/client/login?google=a%26b");
  });
});

describe("GET /api/client-auth/google/start", () => {
  it("uses the ONE registered redirect URI with PKCE, and remembers the join code", async () => {
    const res = await supertest(app).get("/api/client-auth/google/start?code=anna-7k2q8m").set("Host", "app.repsy.fit");
    expect(res.status).toBe(302);
    const url = new URL(res.headers.location);
    expect(url.searchParams.get("redirect_uri")).toBe("https://app.repsy.fit/api/auth/callback/google");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(String(res.headers["set-cookie"])).toMatch(/\.join%3AANNA-7K2Q8M;/); // URL-encoded by res.cookie
    expect(res.headers["referrer-policy"]).toBe("no-referrer");
  });
  it("moves to the registered origin first, keeping the code", async () => {
    const res = await supertest(app).get("/api/client-auth/google/start?code=ANNA-7K2Q8M").set("Host", "repsy.fit");
    expect(res.headers.location).toBe("https://app.repsy.fit/api/client-auth/google/start?code=ANNA-7K2Q8M");
  });
  it("a malformed code, and Google not set up, go back to the client pages", async () => {
    expect((await supertest(app).get("/api/client-auth/google/start?code=garbage")).headers.location).toBe("/client/login?google=badcode");
    delete process.env.GOOGLE_CLIENT_ID;
    expect((await supertest(app).get("/api/client-auth/google/start")).headers.location).toBe("/client/login?google=off");
    expect((await supertest(app).get("/api/client-auth/google/start?code=ANNA-7K2Q8M")).headers.location).toBe("/join/ANNA-7K2Q8M?google=off");
  });
});

describe("the callback for clients", () => {
  it("signs in the client already linked to this Google account (CLIENT cookie only)", async () => {
    prismaMock.client.findUnique.mockImplementation(async ({ where }: { where: { googleSub?: string } }) => (where.googleSub === "g-maya" ? { id: "c1" } : null));
    const { res, cookies } = await go();
    expect(res.headers.location).toBe("/client");
    expect(hasClientCookie(cookies)).toBe(true);
    expect(hasCoachCookie(cookies)).toBe(false);
    expect(prismaMock.client.update.mock.calls[0][0].data.lastGoogleAuthAt).toBeInstanceOf(Date);
    // Never looks at coach Google links.
    expect(prismaMock.coach.findUnique.mock.calls.every(([a]: [{ where: Record<string, unknown> }]) => !("googleSub" in a.where))).toBe(true);
  });

  it("links an existing client by email only when Google owns the address; the old password and sessions end", async () => {
    prismaMock.client.findUnique
      .mockResolvedValueOnce(null) // by googleSub
      .mockResolvedValueOnce({ id: "c1", googleSub: null }) // by loginEmail
      .mockResolvedValueOnce({ id: "c1", clientSessionVersion: 1 });
    const { res, cookies } = await go();
    expect(res.headers.location).toBe("/client");
    expect(hasClientCookie(cookies)).toBe(true);
    const upd = prismaMock.client.updateMany.mock.calls[0][0];
    expect(upd.where).toEqual({ id: "c1", googleSub: null });
    expect(upd.data).toMatchObject({ googleSub: "g-maya", clientSessionVersion: { increment: 1 } });
    expect(await verifyPassword("correct horse battery", upd.data.passwordHash)).toBe(false);
  });

  it("a non-Google-owned address that already signs in is refused (?google=link)", async () => {
    useToken({ email: "maya@example.com" }); // not Gmail, no hd
    prismaMock.client.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "c1", googleSub: null });
    const { res, cookies } = await go();
    expect(res.headers.location).toBe("/client/login?google=link");
    expect(hasClientCookie(cookies)).toBe(false);
    expect(prismaMock.client.updateMany).not.toHaveBeenCalled();
  });

  it("signing in with no client account -> ?google=noaccount (no account is created)", async () => {
    const { res } = await go();
    expect(res.headers.location).toBe("/client/login?google=noaccount");
    expect(prismaMock.client.create).not.toHaveBeenCalled();
  });

  it("joining creates the client under the code's coach (pending when approval is on)", async () => {
    COACH.approveNewClients = true;
    const { res, cookies } = await go("ANNA-7K2Q8M");
    expect(res.headers.location).toBe("/client");
    expect(hasClientCookie(cookies)).toBe(true);
    expect(hasCoachCookie(cookies)).toBe(false);
    expect(prismaMock.client.create.mock.calls[0][0].data).toMatchObject({
      coachId: "coach-1", name: "Maya Patel", loginEmail: "maya@gmail.com", googleSub: "g-maya", joinedVia: "code", joinStatus: "pending",
    });
  });

  it("joining attaches the ONE client the coach invited at this Google-owned address (no duplicate)", async () => {
    prismaMock.clientInvite.findMany.mockResolvedValue([{ clientId: "c-existing" }]);
    prismaMock.client.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "c-existing", clientSessionVersion: 1 });
    const { res } = await go("ANNA-7K2Q8M");
    expect(res.headers.location).toBe("/client");
    expect(prismaMock.client.create).not.toHaveBeenCalled();
    const upd = prismaMock.client.updateMany.mock.calls[0][0];
    expect(upd.where).toEqual({ id: "c-existing", coachId: "coach-1", passwordHash: null, loginEmail: null, googleSub: null });
    expect(upd.data).toMatchObject({ loginEmail: "maya@gmail.com", googleSub: "g-maya" });
  });

  it("does not attach an invited record when Google does not own the address", async () => {
    useToken({ email: "maya@example.com" });
    prismaMock.clientInvite.findMany.mockResolvedValue([{ clientId: "c-existing" }]);
    await go("ANNA-7K2Q8M");
    expect(prismaMock.clientInvite.findMany).not.toHaveBeenCalled();
    expect(prismaMock.client.create).toHaveBeenCalled(); // a new client instead
  });

  it("a code turned off between start and callback is refused", async () => {
    const start = await supertest(app).get("/api/client-auth/google/start?code=ANNA-7K2Q8M").set("Host", "app.repsy.fit");
    COACH.joinCodeActive = false;
    const cookie = (start.headers["set-cookie"] as unknown as string[]).find((c) => c.startsWith(GOOGLE_STATE_COOKIE))!;
    const state = new URL(start.headers.location).searchParams.get("state")!;
    const res = await supertest(app).get(`/api/auth/callback/google?code=abc&state=${state}`).set("Cookie", cookie.split(";")[0]);
    expect(res.headers.location).toBe("/join/ANNA-7K2Q8M?google=badcode");
    expect(prismaMock.client.create).not.toHaveBeenCalled();
  });

  it("a cancelled or expired client attempt goes back to the client page, not the coach login", async () => {
    const start = await supertest(app).get("/api/client-auth/google/start?code=ANNA-7K2Q8M").set("Host", "app.repsy.fit");
    const cookie = (start.headers["set-cookie"] as unknown as string[]).find((c) => c.startsWith(GOOGLE_STATE_COOKIE))!.split(";")[0];
    const state = new URL(start.headers.location).searchParams.get("state")!;
    const cancelled = await supertest(app).get(`/api/auth/callback/google?error=access_denied&state=${state}`).set("Cookie", cookie);
    expect(cancelled.headers.location).toBe("/join/ANNA-7K2Q8M?google=cancelled");
    // Wrong state: the cookie is not trusted at all, so it is treated as an expired COACH attempt.
    const forged = await supertest(app).get("/api/auth/callback/google?code=abc&state=nope").set("Cookie", cookie);
    expect(forged.headers.location).toBe("/login?google=expired");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("an expired client attempt (cookie gone) goes to the client sign-in, not the coach login", async () => {
    const start = await supertest(app).get("/api/client-auth/google/start").set("Host", "app.repsy.fit");
    const state = new URL(start.headers.location).searchParams.get("state")!;
    const res = await supertest(app).get(`/api/auth/callback/google?code=abc&state=${encodeURIComponent(state)}`);
    expect(res.headers.location).toBe("/client/login?google=expired");
  });

  it("on another coach's join link, an existing client account is not signed in silently", async () => {
    prismaMock.client.findUnique.mockImplementation(async ({ where }: { where: { googleSub?: string } }) =>
      where.googleSub === "g-maya" ? { id: "c1", coachId: "coach-OTHER" } : null,
    );
    const { res, cookies } = await go("ANNA-7K2Q8M");
    expect(res.headers.location).toBe("/join/ANNA-7K2Q8M?google=othercoach");
    expect(hasClientCookie(cookies)).toBe(false);
  });

  it("on the same coach's join link, an existing client account just signs in", async () => {
    prismaMock.client.findUnique.mockImplementation(async ({ where }: { where: { googleSub?: string } }) =>
      where.googleSub === "g-maya" ? { id: "c1", coachId: "coach-1" } : null,
    );
    const { res, cookies } = await go("ANNA-7K2Q8M");
    expect(res.headers.location).toBe("/client");
    expect(hasClientCookie(cookies)).toBe(true);
    expect(prismaMock.client.create).not.toHaveBeenCalled();
  });

  it("a race on the unique index recovers by signing in the winner, and records the Google sign-in", async () => {
    const { Prisma } = await import("@prisma/client");
    prismaMock.client.create.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "t" }));
    prismaMock.client.findUnique
      .mockResolvedValueOnce(null) // by googleSub
      .mockResolvedValueOnce(null) // by loginEmail
      .mockResolvedValueOnce({ id: "c-won" }); // the retry after P2002
    const { res, cookies } = await go("ANNA-7K2Q8M");
    expect(res.headers.location).toBe("/client");
    expect(hasClientCookie(cookies)).toBe(true);
    const upd = prismaMock.client.update.mock.calls.at(-1)![0];
    expect(upd.where).toEqual({ id: "c-won" });
    expect(upd.data.lastGoogleAuthAt).toBeInstanceOf(Date);
  });

  it("a CLIENT's Google account going through the COACH flow never touches the client table", async () => {
    // The coach flow looks only at coaches: this Google account is a client's, not a coach's, so it is a
    // brand-new coach sign-up - never a sign-in to the client account.
    prismaMock.coach.findUnique.mockResolvedValue(null);
    prismaMock.coach.create.mockResolvedValue({ id: "coach-new", sessionVersion: 0 });
    const start = await supertest(app).get("/api/auth/google/start").set("Host", "app.repsy.fit");
    const cookie = (start.headers["set-cookie"] as unknown as string[]).find((c) => c.startsWith(GOOGLE_STATE_COOKIE))!.split(";")[0];
    const state = new URL(start.headers.location).searchParams.get("state")!;
    const res = await supertest(app).get(`/api/auth/callback/google?code=abc&state=${state}`).set("Cookie", cookie);
    expect(res.headers.location).toBe("/app");
    const cookies = ([] as string[]).concat(res.headers["set-cookie"] ?? []);
    expect(hasClientCookie(cookies)).toBe(false);
    expect(prismaMock.client.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.client.update).not.toHaveBeenCalled();
  });

  it("a coach Google sign-in never creates or signs in a client", async () => {
    prismaMock.coach.findUnique.mockResolvedValue({ id: "coach-1", sessionVersion: 0, googleSub: "g-maya" });
    const start = await supertest(app).get("/api/auth/google/start").set("Host", "app.repsy.fit");
    const cookie = (start.headers["set-cookie"] as unknown as string[]).find((c) => c.startsWith(GOOGLE_STATE_COOKIE))!.split(";")[0];
    const state = new URL(start.headers.location).searchParams.get("state")!;
    const res = await supertest(app).get(`/api/auth/callback/google?code=abc&state=${state}`).set("Cookie", cookie);
    expect(res.headers.location).toBe("/app");
    const cookies = ([] as string[]).concat(res.headers["set-cookie"] ?? []);
    expect(hasCoachCookie(cookies)).toBe(true);
    expect(hasClientCookie(cookies)).toBe(false);
    expect(prismaMock.client.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.client.create).not.toHaveBeenCalled();
  });
});
