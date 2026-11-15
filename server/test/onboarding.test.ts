// Onboarding automation (Inspo C8, Nov 2026): what a new client gets without the coach doing it.
//
// HONEST SCOPE: the client app cannot fill in forms yet, so the intake form is one the COACH is
// prompted to go through. These tests pin that, so nobody later assumes a client was emailed a form.
import request, { TEST_COACH_ID } from "./helpers/authedRequest.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { prisma } = vi.hoisted(() => ({
  prisma: {
    coach: { findUnique: vi.fn(), update: vi.fn() },
    client: { findFirst: vi.fn(), create: vi.fn(), count: vi.fn() },
    threadMessage: { create: vi.fn() },
    form: { findFirst: vi.fn() },
    formSubmission: { findFirst: vi.fn() },
  },
}));
vi.mock("../src/db.js", () => ({ prisma }));
vi.mock("../src/auth/claimDemoData.js", () => ({ claimDemoData: vi.fn() }));

const { sendWelcome, intakeState } = await import("../src/clients/onboarding.js");
const { app } = await import("../src/app.js");

beforeEach(() => {
  vi.clearAllMocks();
  prisma.coach.findUnique.mockResolvedValue({ welcomeMessage: "", intakeFormId: null });
  prisma.client.findFirst.mockResolvedValue({ id: "cl1", coachId: TEST_COACH_ID, name: "Maya" });
  prisma.threadMessage.create.mockResolvedValue({ id: "msg1" });
  prisma.form.findFirst.mockResolvedValue(null);
  prisma.formSubmission.findFirst.mockResolvedValue(null);
});

describe("sendWelcome", () => {
  it("sends the coach's message as the client's first message, unread", async () => {
    prisma.coach.findUnique.mockResolvedValue({ welcomeMessage: "Welcome! Tell me your goals." });
    expect(await sendWelcome(TEST_COACH_ID, "cl1")).toBe(true);
    expect(prisma.threadMessage.create.mock.calls[0][0].data).toMatchObject({
      coachId: TEST_COACH_ID,
      clientId: "cl1",
      sender: "coach",
      body: "Welcome! Tell me your goals.",
      // Unread, so it behaves like a message the coach typed: the client sees it waiting.
      readAt: null,
    });
  });

  it("sends nothing when the coach has not written one", async () => {
    for (const welcomeMessage of ["", "   ", undefined]) {
      vi.clearAllMocks();
      prisma.coach.findUnique.mockResolvedValue({ welcomeMessage });
      expect(await sendWelcome(TEST_COACH_ID, "cl1")).toBe(false);
      expect(prisma.threadMessage.create).not.toHaveBeenCalled();
    }
  });

  it("NEVER throws: a greeting must not be why adding a client fails", async () => {
    prisma.coach.findUnique.mockResolvedValue({ welcomeMessage: "Hello" });
    prisma.threadMessage.create.mockRejectedValue(new Error("deadlock detected"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(sendWelcome(TEST_COACH_ID, "cl1")).resolves.toBe(false);
    expect(spy.mock.calls[0][0]).toContain("still created");
    spy.mockRestore();
  });
});

describe("intakeState", () => {
  it("reports no form when the coach has chosen none", async () => {
    expect(await intakeState(TEST_COACH_ID, "cl1")).toEqual({ form: null, doneAt: null });
  });

  it("reports no form when the chosen one has since been DELETED, rather than erroring", async () => {
    // Exactly why intakeFormId is not a foreign key.
    prisma.coach.findUnique.mockResolvedValue({ intakeFormId: "f-deleted" });
    prisma.form.findFirst.mockResolvedValue(null);
    expect(await intakeState(TEST_COACH_ID, "cl1")).toEqual({ form: null, doneAt: null });
  });

  it("reports the form and that it is not done yet", async () => {
    prisma.coach.findUnique.mockResolvedValue({ intakeFormId: "f1" });
    prisma.form.findFirst.mockResolvedValue({ id: "f1", name: "Client intake", questions: [{}, {}, {}] });
    const state = await intakeState(TEST_COACH_ID, "cl1");
    expect(state.form).toEqual({ id: "f1", name: "Client intake", questionCount: 3 });
    expect(state.doneAt).toBeNull();
  });

  it("reports when it was done", async () => {
    prisma.coach.findUnique.mockResolvedValue({ intakeFormId: "f1" });
    prisma.form.findFirst.mockResolvedValue({ id: "f1", name: "Client intake", questions: [] });
    prisma.formSubmission.findFirst.mockResolvedValue({ createdAt: new Date("2026-11-12T00:00:00.000Z") });
    const state = await intakeState(TEST_COACH_ID, "cl1");
    expect(state.doneAt).toEqual(new Date("2026-11-12T00:00:00.000Z"));
  });

  it("copes with a questions column that is not a list", async () => {
    prisma.coach.findUnique.mockResolvedValue({ intakeFormId: "f1" });
    prisma.form.findFirst.mockResolvedValue({ id: "f1", name: "F", questions: null });
    expect((await intakeState(TEST_COACH_ID, "cl1")).form?.questionCount).toBe(0);
  });

  it("looks only at this client's and this coach's submissions", async () => {
    prisma.coach.findUnique.mockResolvedValue({ intakeFormId: "f1" });
    prisma.form.findFirst.mockResolvedValue({ id: "f1", name: "F", questions: [] });
    await intakeState(TEST_COACH_ID, "cl1");
    expect(prisma.formSubmission.findFirst.mock.calls[0][0].where).toEqual({
      formId: "f1",
      clientId: "cl1",
      coachId: TEST_COACH_ID,
    });
  });
});

describe("GET /api/clients/:id/intake", () => {
  it("answers with the state", async () => {
    prisma.coach.findUnique.mockResolvedValue({ intakeFormId: "f1" });
    prisma.form.findFirst.mockResolvedValue({ id: "f1", name: "Client intake", questions: [{}] });
    const res = await request(app).get("/api/clients/cl1/intake");
    expect(res.status).toBe(200);
    expect(res.body.form).toMatchObject({ name: "Client intake", questionCount: 1 });
  });

  it("404s on another coach's client", async () => {
    prisma.client.findFirst.mockResolvedValue(null);
    expect((await request(app).get("/api/clients/someone-elses/intake")).status).toBe(404);
  });
});

describe("PATCH /api/auth/profile: the onboarding settings", () => {
  beforeEach(() => {
    prisma.coach.update.mockResolvedValue({
      id: TEST_COACH_ID,
      name: "Test",
      email: "t@example.com",
      createdAt: new Date(),
      currency: "INR",
      units: "kg",
      country: "IN",
      welcomeMessage: "Hello",
      intakeFormId: "f1",
    });
  });

  it("saves a welcome message", async () => {
    const res = await request(app).patch("/api/auth/profile").send({ welcomeMessage: "  Welcome aboard  " });
    expect(res.status).toBe(200);
    expect(prisma.coach.update.mock.calls[0][0].data).toEqual({ welcomeMessage: "Welcome aboard" });
  });

  it("clears it with an empty string", async () => {
    await request(app).patch("/api/auth/profile").send({ welcomeMessage: "" });
    expect(prisma.coach.update.mock.calls[0][0].data).toEqual({ welcomeMessage: "" });
  });

  it("refuses an essay", async () => {
    const res = await request(app).patch("/api/auth/profile").send({ welcomeMessage: "x".repeat(1001) });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("1000 characters or fewer");
  });

  it("saves an intake form the coach can see", async () => {
    prisma.form.findFirst.mockResolvedValue({ id: "f1" });
    await request(app).patch("/api/auth/profile").send({ intakeFormId: "f1" });
    expect(prisma.coach.update.mock.calls[0][0].data).toEqual({ intakeFormId: "f1" });
  });

  it("CLEARS an unknown id rather than failing the save", async () => {
    // The coach's intent cannot be honoured; losing their whole save would be worse.
    prisma.form.findFirst.mockResolvedValue(null);
    await request(app).patch("/api/auth/profile").send({ intakeFormId: "f-gone" });
    expect(prisma.coach.update.mock.calls[0][0].data).toEqual({ intakeFormId: null });
  });

  it("treats null and an empty string as 'no intake form'", async () => {
    for (const intakeFormId of [null, "", "   "]) {
      vi.clearAllMocks();
      prisma.coach.update.mockResolvedValue({
        id: TEST_COACH_ID, name: "T", email: "t@e.com", createdAt: new Date(),
        currency: "INR", units: "kg", country: null, welcomeMessage: "", intakeFormId: null,
      });
      await request(app).patch("/api/auth/profile").send({ intakeFormId });
      expect(prisma.coach.update.mock.calls[0][0].data).toEqual({ intakeFormId: null });
      // No lookup needed to clear it.
      expect(prisma.form.findFirst).not.toHaveBeenCalled();
    }
  });

  it("still refuses a field that is not its business", async () => {
    const res = await request(app).patch("/api/auth/profile").send({ email: "new@example.com" });
    expect(res.status).toBe(400);
  });
});
