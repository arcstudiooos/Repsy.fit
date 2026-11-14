// Forms API (Inspo C1/C2, Nov 2026) - see "API contract" in CLAUDE.md.
//
// Two kinds of row in `forms`, exactly like the exercise library:
//   - SAMPLE: coachId NULL. Seeded by migration, shared, read-only. Copy it to change it.
//   - OWN:    coachId set. The coach's own form.
//
// Submissions belong to a client and snapshot the questions they were `asked`, so an answer stays
// readable after the form has been edited or deleted.
import { Router } from "express";
import { prisma } from "../db.js";
import { coachIdOf } from "../auth/requireCoach.js";
import { asyncHandler, findClient } from "./clients.js";
import { AnswersSchema, FormSchema, answerProblem, readAnswers, readQuestions } from "../forms/schema.js";

export const formsRouter = Router();

/** The shape every endpoint returns. `sample` tells the UI whether the edit controls apply. */
const publicForm = (f: {
  id: string;
  coachId: string | null;
  name: string;
  description: string;
  questions: unknown;
  active: boolean;
  createdAt: Date;
  _count?: { submissions: number };
}) => {
  const { questions } = readQuestions(f.questions);
  return {
    id: f.id,
    name: f.name,
    description: f.description,
    questions,
    active: f.active,
    sample: f.coachId === null,
    createdAt: f.createdAt,
    submissionCount: f._count?.submissions ?? 0,
  };
};

/** First problem in plain words, or null. Not validationMessage(): its path prefix means nothing here. */
const formProblem = (body: unknown) => {
  const parsed = FormSchema.safeParse(body ?? {});
  if (parsed.success) return { data: parsed.data, error: null as string | null };
  const issue = parsed.error.issues[0];
  const index = typeof issue.path[1] === "number" ? issue.path[1] + 1 : null;
  return { data: null, error: `${issue.message}${index ? ` (question ${index})` : ""}` };
};

// GET /api/forms - the coach's own forms plus Repsy's samples, newest own first.
formsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const coachId = coachIdOf(req);
    const forms = await prisma.form.findMany({
      where: { OR: [{ coachId }, { coachId: null }] },
      orderBy: [{ coachId: "desc" }, { createdAt: "desc" }, { id: "asc" }],
      include: { _count: { select: { submissions: true } } },
    });
    res.json(forms.map(publicForm));
  }),
);

// GET /api/forms/:formId - one form, the coach's own or a sample.
formsRouter.get(
  "/:formId",
  asyncHandler(async (req, res) => {
    const coachId = coachIdOf(req);
    const form = await prisma.form.findFirst({
      where: { id: req.params.formId, OR: [{ coachId }, { coachId: null }] },
      include: { _count: { select: { submissions: true } } },
    });
    if (!form) {
      res.status(404).json({ error: "That form no longer exists." });
      return;
    }
    res.json(publicForm(form));
  }),
);

// POST /api/forms - 201 with the new form. Always the coach's own; samples are seed-only.
formsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const { data, error } = formProblem(req.body);
    if (!data) {
      res.status(400).json({ error });
      return;
    }
    const form = await prisma.form.create({ data: { ...data, coachId: coachIdOf(req) } });
    res.status(201).json(publicForm({ ...form, _count: { submissions: 0 } }));
  }),
);

// PUT /api/forms/:formId - replaces the form. Own forms only; a sample is 404.
formsRouter.put(
  "/:formId",
  asyncHandler(async (req, res) => {
    const coachId = coachIdOf(req);
    const { data, error } = formProblem(req.body);
    if (!data) {
      res.status(400).json({ error });
      return;
    }
    // Scoped by coachId, so a sample (coachId NULL) and another coach's form are both simply absent.
    const existing = await prisma.form.findFirst({ where: { id: req.params.formId, coachId } });
    if (!existing) {
      res.status(404).json({ error: "That form is not one of yours." });
      return;
    }
    const form = await prisma.form.update({
      where: { id: existing.id },
      data,
      include: { _count: { select: { submissions: true } } },
    });
    res.json(publicForm(form));
  }),
);

// DELETE /api/forms/:formId - 204. Own forms only. Takes its submissions with it, which is why the
// UI says how many first.
formsRouter.delete(
  "/:formId",
  asyncHandler(async (req, res) => {
    const coachId = coachIdOf(req);
    const existing = await prisma.form.findFirst({ where: { id: req.params.formId, coachId } });
    if (!existing) {
      res.status(404).json({ error: "That form is not one of yours." });
      return;
    }
    await prisma.form.delete({ where: { id: existing.id } });
    res.status(204).end();
  }),
);

// POST /api/forms/:formId/copy - copy a sample (or one of the coach's own) into their forms.
formsRouter.post(
  "/:formId/copy",
  asyncHandler(async (req, res) => {
    const coachId = coachIdOf(req);
    const source = await prisma.form.findFirst({
      where: { id: req.params.formId, OR: [{ coachId }, { coachId: null }] },
    });
    if (!source) {
      res.status(404).json({ error: "That form no longer exists." });
      return;
    }
    const { questions } = readQuestions(source.questions);
    const form = await prisma.form.create({
      data: {
        coachId,
        name: `${source.name} (copy)`.slice(0, 120),
        description: source.description,
        questions,
        active: source.active,
      },
    });
    res.status(201).json(publicForm({ ...form, _count: { submissions: 0 } }));
  }),
);

// GET /api/forms/:formId/submissions - the answers given, newest first.
formsRouter.get(
  "/:formId/submissions",
  asyncHandler(async (req, res) => {
    const coachId = coachIdOf(req);
    const form = await prisma.form.findFirst({ where: { id: req.params.formId, OR: [{ coachId }, { coachId: null }] } });
    if (!form) {
      res.status(404).json({ error: "That form no longer exists." });
      return;
    }
    const rows = await prisma.formSubmission.findMany({
      where: { formId: form.id, coachId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: { client: { select: { id: true, name: true } } },
    });
    res.json(
      rows.map((r) => ({
        id: r.id,
        clientId: r.clientId,
        clientName: r.client?.name ?? "A former client",
        answers: readAnswers(r.answers),
        // The questions AS ASKED, so a submission reads correctly even after the form changed.
        asked: readQuestions(r.asked).questions,
        createdAt: r.createdAt,
      })),
    );
  }),
);

// POST /api/forms/:formId/submissions { clientId, answers } - record answers for a client.
//
// The coach fills this in with (or for) a client; the client app does not post here. Answers are
// checked against the form's CURRENT questions, and those questions are snapshotted alongside.
formsRouter.post(
  "/:formId/submissions",
  asyncHandler(async (req, res) => {
    const coachId = coachIdOf(req);
    const form = await prisma.form.findFirst({ where: { id: req.params.formId, OR: [{ coachId }, { coachId: null }] } });
    if (!form) {
      res.status(404).json({ error: "That form no longer exists." });
      return;
    }
    const body = (req.body ?? {}) as { clientId?: unknown; answers?: unknown };
    if (typeof body.clientId !== "string" || !body.clientId) {
      res.status(400).json({ error: "Choose which client this is for." });
      return;
    }
    const client = await findClient(body.clientId, coachId);
    if (!client) {
      res.status(404).json({ error: "Client not found" });
      return;
    }
    const answers = AnswersSchema.safeParse(body.answers ?? {});
    if (!answers.success) {
      res.status(400).json({ error: "Those answers are not in a shape this form understands." });
      return;
    }
    const { questions } = readQuestions(form.questions);
    const problem = answerProblem(questions, answers.data);
    if (problem) {
      res.status(400).json({ error: problem });
      return;
    }
    const row = await prisma.formSubmission.create({
      data: { formId: form.id, coachId, clientId: client.id, answers: answers.data, asked: questions },
    });
    res.status(201).json({ id: row.id, createdAt: row.createdAt });
  }),
);
