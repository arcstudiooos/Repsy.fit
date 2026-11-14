// The forms API (Inspo C1/C2, Nov 2026).
//
// Two rules carry the most weight:
//   * a SAMPLE form (coachId NULL) is read-only - a coach copies it to change it;
//   * a submission SNAPSHOTS the questions it was asked, so an answer stays readable after the form
//     has been edited or deleted.
import request, { TEST_COACH_ID } from "./helpers/authedRequest.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { prisma } = vi.hoisted(() => ({
  prisma: {
    form: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    formSubmission: { findMany: vi.fn(), create: vi.fn() },
    client: { findFirst: vi.fn() },
  },
}));
vi.mock("../src/db.js", () => ({ prisma }));

const { app } = await import("../src/app.js");

const QUESTIONS = [
  { id: "age", type: "single", label: "Your age?", help: "", required: true, options: ["18-24", "25-34"] },
  { id: "goal", type: "text", label: "Your goal?", help: "", required: false, options: [] },
];

const row = (over: Record<string, unknown> = {}) => ({
  id: "f1",
  coachId: TEST_COACH_ID,
  name: "Client intake",
  description: "",
  questions: QUESTIONS,
  active: true,
  createdAt: new Date("2026-11-15T00:00:00.000Z"),
  _count: { submissions: 0 },
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  prisma.form.findMany.mockResolvedValue([]);
  prisma.form.findFirst.mockResolvedValue(null);
  prisma.formSubmission.findMany.mockResolvedValue([]);
  prisma.client.findFirst.mockResolvedValue({ id: "cl1", coachId: TEST_COACH_ID, name: "Maya" });
  prisma.form.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => ({
    ...row(),
    ...data,
    id: "new",
  }));
});

describe("GET /api/forms", () => {
  it("returns the coach's own forms and Repsy's samples, flagging which is which", async () => {
    prisma.form.findMany.mockResolvedValue([row(), row({ id: "s1", coachId: null, name: "Client intake (sample)" })]);
    const res = await request(app).get("/api/forms");
    expect(res.status).toBe(200);
    expect(res.body[0]).toMatchObject({ name: "Client intake", sample: false });
    expect(res.body[1]).toMatchObject({ sample: true });
    expect(res.body[0]).not.toHaveProperty("coachId");
  });

  it("never asks for another coach's forms", async () => {
    await request(app).get("/api/forms");
    expect(prisma.form.findMany.mock.calls[0][0].where).toMatchObject({
      OR: [{ coachId: TEST_COACH_ID }, { coachId: null }],
    });
  });

  it("reports how many submissions each form has", async () => {
    prisma.form.findMany.mockResolvedValue([row({ _count: { submissions: 7 } })]);
    const res = await request(app).get("/api/forms");
    expect(res.body[0].submissionCount).toBe(7);
  });

  it("drops a question an older release wrote, instead of failing the whole list", async () => {
    prisma.form.findMany.mockResolvedValue([row({ questions: [QUESTIONS[0], { id: "x", type: "tarot", label: "?" }] })]);
    const res = await request(app).get("/api/forms");
    expect(res.status).toBe(200);
    expect(res.body[0].questions).toHaveLength(1);
  });
});

describe("POST /api/forms", () => {
  it("creates one owned by the signed-in coach, ignoring a coachId in the body", async () => {
    const res = await request(app)
      .post("/api/forms")
      .send({ name: "My intake", questions: QUESTIONS, coachId: "someone-else" });
    expect(res.status).toBe(201);
    expect(prisma.form.create.mock.calls[0][0].data.coachId).toBe(TEST_COACH_ID);
  });

  it("refuses a form with no name, and one with a one-option choice", async () => {
    const noName = await request(app).post("/api/forms").send({ name: "  " });
    expect(noName.status).toBe(400);
    expect(noName.body.error).toBe("Give the form a name.");

    const badChoice = await request(app)
      .post("/api/forms")
      .send({ name: "F", questions: [{ id: "a", type: "single", label: "x", options: ["only"] }] });
    expect(badChoice.status).toBe(400);
    expect(badChoice.body.error).toContain("at least two options");
    expect(prisma.form.create).not.toHaveBeenCalled();
  });

  it("names which question is wrong when there is more than one", async () => {
    const res = await request(app)
      .post("/api/forms")
      .send({
        name: "F",
        questions: [
          { id: "a", type: "text", label: "Fine" },
          { id: "b", type: "text", label: "" },
        ],
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("question 2");
  });
});

describe("a sample form is read-only", () => {
  it("PUT on a sample is 404, not an edit", async () => {
    prisma.form.findFirst.mockResolvedValue(null); // scoped by coachId, so a sample is absent
    const res = await request(app).put("/api/forms/s1").send({ name: "Hijacked" });
    expect(res.status).toBe(404);
    expect(res.body.error).toContain("not one of yours");
    expect(prisma.form.update).not.toHaveBeenCalled();
  });

  it("DELETE on a sample is 404 and deletes nothing", async () => {
    const res = await request(app).delete("/api/forms/s1");
    expect(res.status).toBe(404);
    expect(prisma.form.delete).not.toHaveBeenCalled();
  });

  it("the lookup for a write is always scoped to this coach", async () => {
    await request(app).delete("/api/forms/f1");
    expect(prisma.form.findFirst.mock.calls[0][0].where).toMatchObject({ id: "f1", coachId: TEST_COACH_ID });
  });

  it("but a sample can be copied, and the copy is the coach's own", async () => {
    prisma.form.findFirst.mockResolvedValue(row({ id: "s1", coachId: null, name: "Client intake" }));
    const res = await request(app).post("/api/forms/s1/copy");
    expect(res.status).toBe(201);
    const data = prisma.form.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ coachId: TEST_COACH_ID, name: "Client intake (copy)" });
    expect(data.questions).toHaveLength(2);
  });
});

describe("submissions", () => {
  const url = "/api/forms/f1/submissions";

  it("records answers, and snapshots the questions as asked", async () => {
    prisma.form.findFirst.mockResolvedValue(row());
    prisma.formSubmission.create.mockResolvedValue({ id: "sub1", createdAt: new Date() });
    const res = await request(app).post(url).send({ clientId: "cl1", answers: { age: "25-34" } });
    expect(res.status).toBe(201);
    const data = prisma.formSubmission.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ formId: "f1", clientId: "cl1", coachId: TEST_COACH_ID });
    expect(data.answers).toEqual({ age: "25-34" });
    // The snapshot is what makes an old answer readable after the form changes.
    expect(data.asked).toHaveLength(2);
    expect(data.asked[0]).toMatchObject({ id: "age", label: "Your age?" });
  });

  it("refuses a choice the coach never offered", async () => {
    prisma.form.findFirst.mockResolvedValue(row());
    const res = await request(app).post(url).send({ clientId: "cl1", answers: { age: "90+" } });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("not one of the choices");
    expect(prisma.formSubmission.create).not.toHaveBeenCalled();
  });

  it("refuses a missing required answer, naming the question", async () => {
    prisma.form.findFirst.mockResolvedValue(row());
    const res = await request(app).post(url).send({ clientId: "cl1", answers: {} });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('"Your age?" needs an answer.');
  });

  it("needs a client, and refuses another coach's client", async () => {
    prisma.form.findFirst.mockResolvedValue(row());
    const none = await request(app).post(url).send({ answers: {} });
    expect(none.status).toBe(400);
    expect(none.body.error).toBe("Choose which client this is for.");

    prisma.client.findFirst.mockResolvedValue(null);
    const other = await request(app).post(url).send({ clientId: "someone-elses", answers: { age: "25-34" } });
    expect(other.status).toBe(404);
    expect(prisma.formSubmission.create).not.toHaveBeenCalled();
  });

  it("refuses an answer shape the column should never hold", async () => {
    prisma.form.findFirst.mockResolvedValue(row());
    const res = await request(app).post(url).send({ clientId: "cl1", answers: { age: { nested: true } } });
    expect(res.status).toBe(400);
    expect(prisma.formSubmission.create).not.toHaveBeenCalled();
  });

  it("lists submissions with the client's name and the questions as asked", async () => {
    prisma.form.findFirst.mockResolvedValue(row());
    prisma.formSubmission.findMany.mockResolvedValue([
      {
        id: "sub1",
        clientId: "cl1",
        client: { id: "cl1", name: "Maya" },
        answers: { age: "25-34" },
        asked: QUESTIONS,
        createdAt: new Date("2026-11-15T00:00:00.000Z"),
      },
    ]);
    const res = await request(app).get(url);
    expect(res.status).toBe(200);
    expect(res.body[0]).toMatchObject({ clientName: "Maya", answers: { age: "25-34" } });
    expect(res.body[0].asked).toHaveLength(2);
  });

  it("only ever lists this coach's submissions", async () => {
    prisma.form.findFirst.mockResolvedValue(row());
    await request(app).get(url);
    expect(prisma.formSubmission.findMany.mock.calls[0][0].where).toMatchObject({ coachId: TEST_COACH_ID });
  });

  it("404s on a form that is not the coach's or a sample", async () => {
    prisma.form.findFirst.mockResolvedValue(null);
    expect((await request(app).get(url)).status).toBe(404);
    expect((await request(app).post(url).send({ clientId: "cl1", answers: {} })).status).toBe(404);
  });
});
