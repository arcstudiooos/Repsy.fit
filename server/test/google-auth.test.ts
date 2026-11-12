// "Continue with Google" for coaches: the claim checks, the state cookie, and the three sign-in
// outcomes (linked account, same-email coach gets linked, new coach), with Google's token endpoint
// and the database mocked.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => {
  const mock: Record<string, any> = {
    coach: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
    client: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    $queryRaw: vi.fn().mockResolvedValue([{ "1": 1 }]),
  };
  mock.$transaction = vi.fn((fn: (tx: unknown) => unknown) => Promise.resolve(fn(mock)));
  return mock;
});
vi.mock("../src/db.js", () => ({ prisma: prismaMock }));
const claimMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("../src/auth/claimDemoData.js", () => ({ claimDemoData: claimMock }));

const { app } = await import("../src/app.js");
const supertest = (await import("supertest")).default;
const { identityFromIdToken, GoogleAuthError, GOOGLE_STATE_COOKIE } = await import("../src/auth/google.js");
const { SESSION_COOKIE } = await import("../src/auth/session.js");
const { resetRateLimits } = await import("../src/auth/rateLimit.js");

const CLIENT_ID = "cid.apps.googleusercontent.com";
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
const idToken = (claims: Record<string, unknown>) => `${b64({ alg: "RS256" })}.${b64(claims)}.sig`;
const now = () => Math.floor(Date.now() / 1000);
const good = (over: Record<string, unknown> = {}) => ({
  iss: "https://accounts.google.com",
  aud: CLIENT_ID,
  exp: now() + 600,
  sub: "g-123",
  email: "Ana@Example.com",
  email_verified: true,
  name: "Ana Coach",
  ...over,
});
const coach = (over: Record<string, unknown> = {}) => ({ id: "coach-1", name: "Ana", email: "ana@example.com", sessionVersion: 0, googleSub: null, ...over });

describe("identityFromIdToken", () => {
  it("returns sub, the lower-cased email and the name for a valid token", () => {
    expect(identityFromIdToken(idToken(good()), CLIENT_ID)).toEqual({ sub: "g-123", email: "ana@example.com", name: "Ana Coach", emailAuthoritative: false });
  });
  it("treats Gmail, and Workspace accounts whose hd is the email's domain, as authoritative for the email", () => {
    expect(identityFromIdToken(idToken(good({ email: "ana@gmail.com" })), CLIENT_ID).emailAuthoritative).toBe(true);
    expect(identityFromIdToken(idToken(good({ hd: "example.com" })), CLIENT_ID).emailAuthoritative).toBe(true);
    expect(identityFromIdToken(idToken(good({ hd: "other.com" })), CLIENT_ID).emailAuthoritative).toBe(false);
  });
  it.each([
    ["wrong issuer", { iss: "https://evil.example" }, "token"],
    ["wrong audience", { aud: "someone-else" }, "token"],
    ["expired", { exp: now() - 3600 }, "token"],
    ["no sub", { sub: "" }, "token"],
    ["unverified email", { email_verified: false }, "unverified"],
    ["no email", { email: undefined }, "unverified"],
  ])("rejects a token with %s", (_label, over, reason) => {
    try {
      identityFromIdToken(idToken(good(over)), CLIENT_ID);
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(GoogleAuthError);
      expect((err as InstanceType<typeof GoogleAuthError>).reason).toBe(reason);
    }
  });
  it("rejects garbage", () => {
    expect(() => identityFromIdToken("not-a-jwt", CLIENT_ID)).toThrow(GoogleAuthError);
  });
});

describe("Google sign-in routes", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    resetRateLimits();
    vi.clearAllMocks();
    process.env.GOOGLE_CLIENT_ID = CLIENT_ID;
    process.env.GOOGLE_CLIENT_SECRET = "secret";
    process.env.APP_URL = "https://app.repsy.fit";
    fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ id_token: idToken(good()) }), { status: 200 }));
  });
  afterEach(() => {
    fetchSpy.mockRestore();
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    delete process.env.APP_URL;
  });

  /** Runs /start, then the callback with the state Google would echo back. */
  async function signIn(query: Record<string, string> = {}) {
    const start = await supertest(app).get("/api/auth/google/start").set("Host", "app.repsy.fit");
    const cookie = (start.headers["set-cookie"] as unknown as string[]).find((c) => c.startsWith(GOOGLE_STATE_COOKIE))!;
    const state = new URL(start.headers.location).searchParams.get("state")!;
    const q = new URLSearchParams({ code: "abc", state, ...query }).toString();
    return supertest(app).get(`/api/auth/callback/google?${q}`).set("Cookie", cookie.split(";")[0]);
  }

  it("/providers says whether Google is set up", async () => {
    expect((await supertest(app).get("/api/auth/providers")).body).toEqual({ google: true });
    delete process.env.GOOGLE_CLIENT_SECRET;
    expect((await supertest(app).get("/api/auth/providers")).body).toEqual({ google: false });
  });

  it("/start redirects to Google with the registered redirect URI and a state cookie", async () => {
    const res = await supertest(app).get("/api/auth/google/start").set("Host", "app.repsy.fit");
    expect(res.status).toBe(302);
    expect(res.headers["cache-control"]).toBe("no-store");
    const url = new URL(res.headers.location);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("redirect_uri")).toBe("https://app.repsy.fit/api/auth/callback/google");
    expect(url.searchParams.get("client_id")).toBe(CLIENT_ID);
    expect(url.searchParams.get("scope")).toBe("openid email profile");
    const cookie = (res.headers["set-cookie"] as unknown as string[]).join(";");
    expect(cookie).toContain(`${GOOGLE_STATE_COOKIE}=${url.searchParams.get("state")}.`);
    expect(cookie).toContain("HttpOnly");
  });

  it("/start moves to the registered origin first when opened on another host", async () => {
    const res = await supertest(app).get("/api/auth/google/start").set("Host", "repsy.fit");
    expect(res.headers.location).toBe("https://app.repsy.fit/api/auth/google/start");
    expect(String(res.headers["set-cookie"] ?? "")).not.toContain(GOOGLE_STATE_COOKIE);
  });

  it("/start goes back to the login page when Google is not set up", async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    const res = await supertest(app).get("/api/auth/google/start");
    expect(res.headers.location).toBe("/login?google=off");
  });

  it("signs in the coach already linked to this Google account", async () => {
    prismaMock.coach.findUnique.mockResolvedValueOnce(coach({ googleSub: "g-123" }));
    const res = await signIn();
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/app");
    expect((res.headers["set-cookie"] as unknown as string[]).join(";")).toContain(`${SESSION_COOKIE}=`);
    expect(prismaMock.coach.create).not.toHaveBeenCalled();
    // the code was swapped server to server with the client secret
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://oauth2.googleapis.com/token");
    expect(String(init.body)).toContain("client_secret=secret");
    expect(String(init.body)).toMatch(/code_verifier=[A-Za-z0-9_-]{43}/);
  });

  it("links Google to an existing coach with the same Gmail address, ending the old password and sessions", async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ id_token: idToken(good({ email: "ana@gmail.com" })) }), { status: 200 }));
    prismaMock.coach.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(coach({ email: "ana@gmail.com", passwordHash: "old" }))
      .mockResolvedValueOnce(coach({ email: "ana@gmail.com", googleSub: "g-123", sessionVersion: 1 }));
    prismaMock.coach.updateMany.mockResolvedValueOnce({ count: 1 });
    const res = await signIn();
    expect(res.headers.location).toBe("/app");
    const arg = prismaMock.coach.updateMany.mock.calls[0][0];
    // only if still unlinked; the squatter's password is replaced and their sessions end
    expect(arg.where).toEqual({ id: "coach-1", googleSub: null });
    expect(arg.data.googleSub).toBe("g-123");
    expect(arg.data.sessionVersion).toEqual({ increment: 1 });
    expect(arg.data.passwordHash).toMatch(/^\$2[aby]\$/);
  });

  it("refuses to link by email when Google is not authoritative for the address (non-Gmail, no hd)", async () => {
    prismaMock.coach.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(coach());
    const res = await signIn();
    expect(res.headers.location).toBe("/login?google=link");
    expect(prismaMock.coach.updateMany).not.toHaveBeenCalled();
    expect(String(res.headers["set-cookie"] ?? "")).not.toMatch(new RegExp(`${SESSION_COOKIE}=ey`));
  });

  it("refuses when the same-email coach is already linked to a different Google account", async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ id_token: idToken(good({ email: "ana@gmail.com" })) }), { status: 200 }));
    prismaMock.coach.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(coach({ email: "ana@gmail.com", googleSub: "g-OTHER" }));
    const res = await signIn();
    expect(res.headers.location).toBe("/login?google=link");
    expect(prismaMock.coach.updateMany).not.toHaveBeenCalled();
  });

  it("a duplicate-key race ends in a redirect, signing in whoever got linked", async () => {
    const { Prisma } = await import("@prisma/client");
    prismaMock.coach.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(null).mockResolvedValueOnce(coach({ googleSub: "g-123" }));
    prismaMock.coach.create.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "6" }));
    const res = await signIn();
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/app");
  });

  it("creates a new coach (claiming demo data like register) when nobody matches", async () => {
    prismaMock.coach.findUnique.mockResolvedValue(null);
    prismaMock.coach.create.mockResolvedValueOnce(coach({ id: "coach-new", googleSub: "g-123" }));
    const res = await signIn();
    expect(res.headers.location).toBe("/app");
    const data = prismaMock.coach.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ name: "Ana Coach", email: "ana@example.com", googleSub: "g-123" });
    expect(data.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(claimMock).toHaveBeenCalledWith(expect.anything(), "coach-new");
  });

  it("refuses a callback whose state does not match the cookie (no sign-in, no token exchange)", async () => {
    const res = await supertest(app).get("/api/auth/callback/google?code=abc&state=forged").set("Cookie", `${GOOGLE_STATE_COOKIE}=real`);
    expect(res.headers.location).toBe("/login?google=expired");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(String(res.headers["set-cookie"] ?? "")).not.toContain(`${SESSION_COOKIE}=ey`);
  });

  it("reports a cancelled consent screen", async () => {
    const res = await signIn({ error: "access_denied" });
    expect(res.headers.location).toBe("/login?google=cancelled");
  });

  it("reports a failed code exchange and an unverified email", async () => {
    fetchSpy.mockResolvedValueOnce(new Response("{}", { status: 400 }));
    expect((await signIn()).headers.location).toBe("/login?google=failed");
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ id_token: idToken(good({ email_verified: false })) }), { status: 200 }));
    expect((await signIn()).headers.location).toBe("/login?google=unverified");
    expect(prismaMock.coach.create).not.toHaveBeenCalled();
  });
});
