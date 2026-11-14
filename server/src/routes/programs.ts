// Programs API (Inspo W10, Nov 2026) - see "Programs" in CLAUDE.md.
//
// A program is a TEMPLATE: Program -> Phase -> Item, where an item sits at a (week, weekday) and
// carries no date. `POST /:programId/assign` materialises ordinary assignment rows on real dates.
//
// Every write looks the program up scoped by coachId, so another coach's program is simply a 404.
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { coachIdOf } from "../auth/requireCoach.js";
import { asyncHandler, findClient } from "./clients.js";
import { ASSIGNMENT_TYPES, isDateString } from "./assignments.js";
import { layOutProgram, programWeeks } from "../programs/layout.js";
import { deriveStructure } from "../workouts/persist.js";

export const programsRouter = Router();

const ItemSchema = z.object({
  week: z.number().int().min(1, "A week number starts at 1.").max(52, "A phase cannot run past 52 weeks."),
  weekday: z.number().int().min(0, "A day must be 0 (Sunday) to 6 (Saturday).").max(6, "A day must be 0 (Sunday) to 6 (Saturday)."),
  type: z.enum(ASSIGNMENT_TYPES, { error: `A type must be one of: ${ASSIGNMENT_TYPES.join(", ")}.` }),
  title: z.string().trim().min(1, "Every item needs a title.").max(120, "A title must be 120 characters or fewer."),
  details: z.string().trim().max(5000, "The details must be 5000 characters or fewer.").default(""),
});

const PhaseSchema = z.object({
  name: z.string().trim().min(1, "Every phase needs a name.").max(80, "A phase name must be 80 characters or fewer."),
  weeks: z.number().int().min(1, "A phase runs for at least one week.").max(52, "A phase cannot run past 52 weeks.").default(1),
  items: z.array(ItemSchema).max(200, "A phase can hold at most 200 items.").default([]),
});

const ProgramSchema = z.object({
  name: z.string().trim().min(1, "Give the program a name.").max(120, "A program name must be 120 characters or fewer."),
  description: z.string().trim().max(500, "A description must be 500 characters or fewer.").default(""),
  phases: z.array(PhaseSchema).max(12, "A program can hold at most 12 phases.").default([]),
});

/** First problem in plain words, naming the phase when there is more than one to look at. */
function problemOf(body: unknown) {
  const parsed = ProgramSchema.safeParse(body ?? {});
  if (parsed.success) return { data: parsed.data, error: null as string | null };
  const issue = parsed.error.issues[0];
  const phaseNo = issue.path[0] === "phases" && typeof issue.path[1] === "number" ? issue.path[1] + 1 : null;
  return { data: null, error: `${issue.message}${phaseNo ? ` (phase ${phaseNo})` : ""}` };
}

type PhaseRow = { id: string; order: number; name: string; weeks: number; items: unknown[] };

const publicProgram = (p: {
  id: string;
  name: string;
  description: string;
  createdAt: Date;
  phases: PhaseRow[];
}) => {
  const phases = [...p.phases].sort((a, b) => a.order - b.order);
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    createdAt: p.createdAt,
    phases: phases.map((ph) => ({
      id: ph.id,
      name: ph.name,
      weeks: ph.weeks,
      items: ph.items,
    })),
    // The two numbers a coach wants before opening anything.
    totalWeeks: programWeeks(phases.map((ph) => ({ order: ph.order, name: ph.name, weeks: ph.weeks, items: [] }))),
    totalItems: phases.reduce((n, ph) => n + ph.items.length, 0),
  };
};

const withPhases = {
  phases: {
    orderBy: { order: "asc" as const },
    include: { items: { orderBy: [{ week: "asc" as const }, { weekday: "asc" as const }, { title: "asc" as const }] } },
  },
};

// GET /api/programs - the coach's programs, newest first.
programsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const programs = await prisma.program.findMany({
      where: { coachId: coachIdOf(req) },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      include: withPhases,
    });
    res.json(programs.map(publicProgram));
  }),
);

// GET /api/programs/:programId
programsRouter.get(
  "/:programId",
  asyncHandler(async (req, res) => {
    const program = await prisma.program.findFirst({
      where: { id: req.params.programId, coachId: coachIdOf(req) },
      include: withPhases,
    });
    if (!program) {
      res.status(404).json({ error: "That program no longer exists." });
      return;
    }
    res.json(publicProgram(program));
  }),
);

/** Phases and items are written whole: a program is small, and it keeps `order` contiguous. */
const phaseWrites = (phases: z.infer<typeof PhaseSchema>[]) =>
  phases.map((phase, order) => ({
    order,
    name: phase.name,
    weeks: phase.weeks,
    items: { create: phase.items.map((i) => ({ week: i.week, weekday: i.weekday, type: i.type, title: i.title, details: i.details })) },
  }));

// POST /api/programs - 201 with the new program.
programsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const { data, error } = problemOf(req.body);
    if (!data) {
      res.status(400).json({ error });
      return;
    }
    const program = await prisma.program.create({
      data: {
        coachId: coachIdOf(req),
        name: data.name,
        description: data.description,
        phases: { create: phaseWrites(data.phases) },
      },
      include: withPhases,
    });
    res.status(201).json(publicProgram(program));
  }),
);

// PUT /api/programs/:programId - replaces the program, phases and all.
programsRouter.put(
  "/:programId",
  asyncHandler(async (req, res) => {
    const coachId = coachIdOf(req);
    const { data, error } = problemOf(req.body);
    if (!data) {
      res.status(400).json({ error });
      return;
    }
    const existing = await prisma.program.findFirst({ where: { id: req.params.programId, coachId } });
    if (!existing) {
      res.status(404).json({ error: "That program is not one of yours." });
      return;
    }
    const program = await prisma.$transaction(async (tx) => {
      // Replace rather than diff: phases cascade to their items, and `order` stays contiguous.
      await tx.programPhase.deleteMany({ where: { programId: existing.id } });
      return tx.program.update({
        where: { id: existing.id },
        data: { name: data.name, description: data.description, phases: { create: phaseWrites(data.phases) } },
        include: withPhases,
      });
    });
    res.json(publicProgram(program));
  }),
);

// DELETE /api/programs/:programId - 204. Assignments already created from it are NOT touched.
programsRouter.delete(
  "/:programId",
  asyncHandler(async (req, res) => {
    const coachId = coachIdOf(req);
    const existing = await prisma.program.findFirst({ where: { id: req.params.programId, coachId } });
    if (!existing) {
      res.status(404).json({ error: "That program is not one of yours." });
      return;
    }
    await prisma.program.delete({ where: { id: existing.id } });
    res.status(204).end();
  }),
);

// POST /api/programs/:programId/copy - 201 with "Name (copy)".
programsRouter.post(
  "/:programId/copy",
  asyncHandler(async (req, res) => {
    const coachId = coachIdOf(req);
    const source = await prisma.program.findFirst({ where: { id: req.params.programId, coachId }, include: withPhases });
    if (!source) {
      res.status(404).json({ error: "That program no longer exists." });
      return;
    }
    const program = await prisma.program.create({
      data: {
        coachId,
        name: `${source.name} (copy)`.slice(0, 120),
        description: source.description,
        phases: {
          create: source.phases.map((ph) => ({
            order: ph.order,
            name: ph.name,
            weeks: ph.weeks,
            items: {
              create: (ph.items as { week: number; weekday: number; type: string; title: string; details: string }[]).map((i) => ({
                week: i.week,
                weekday: i.weekday,
                type: i.type,
                title: i.title,
                details: i.details,
              })),
            },
          })),
        },
      },
      include: withPhases,
    });
    res.status(201).json(publicProgram(program));
  }),
);

/** The program laid out from `startDate`, or a plain-words problem. */
async function plan(req: { params: Record<string, string>; body: unknown }, coachId: string) {
  const body = (req.body ?? {}) as { clientId?: unknown; startDate?: unknown };
  if (typeof body.clientId !== "string" || !body.clientId) return { error: "Choose which client this is for." } as const;
  if (typeof body.startDate !== "string" || !isDateString(body.startDate)) {
    return { error: "Choose the date this program starts." } as const;
  }
  const program = await prisma.program.findFirst({ where: { id: req.params.programId, coachId }, include: withPhases });
  if (!program) return { error: "That program no longer exists.", notFound: true } as const;

  const dated = layOutProgram(
    program.phases.map((ph) => ({
      order: ph.order,
      name: ph.name,
      weeks: ph.weeks,
      items: ph.items as { week: number; weekday: number; type: string; title: string; details: string }[],
    })),
    body.startDate,
  );
  return { program, dated, clientId: body.clientId, startDate: body.startDate } as const;
}

// POST /api/programs/:programId/preview { clientId, startDate } - what assigning WOULD create.
//
// Saves nothing. A coach should see the dates before committing eight weeks of a client's calendar.
programsRouter.post(
  "/:programId/preview",
  asyncHandler(async (req, res) => {
    const coachId = coachIdOf(req);
    const result = await plan(req, coachId);
    if ("error" in result) {
      res.status(result.notFound ? 404 : 400).json({ error: result.error });
      return;
    }
    res.json({ startDate: result.startDate, count: result.dated.length, items: result.dated });
  }),
);

// POST /api/programs/:programId/assign { clientId, startDate } - 201 { created }.
//
// Materialises ordinary assignments. From here the template and these rows are independent: editing
// the program later does not reach back into a client's calendar, which is the point.
programsRouter.post(
  "/:programId/assign",
  asyncHandler(async (req, res) => {
    const coachId = coachIdOf(req);
    const result = await plan(req, coachId);
    if ("error" in result) {
      res.status(result.notFound ? 404 : 400).json({ error: result.error });
      return;
    }
    const client = await findClient(result.clientId, coachId);
    if (!client) {
      res.status(404).json({ error: "Client not found" });
      return;
    }
    if (result.dated.length === 0) {
      res.status(400).json({ error: "That program has nothing in it yet." });
      return;
    }

    const created = await prisma.$transaction(
      result.dated.map((d) =>
        prisma.assignment.create({
          data: {
            clientId: client.id,
            coachId,
            type: d.type,
            title: d.title,
            details: d.details,
            date: d.date,
            source: "program",
            status: "Active",
          },
        }),
      ),
    );

    // Inspo A1/A2: give each workout real structure where its text already reads as one. Best
    // effort - an assignment that cannot be parsed simply has no structure, and nothing fails.
    for (const assignment of created) {
      await deriveStructure(assignment);
    }

    res.status(201).json({ created: created.length, startDate: result.startDate });
  }),
);
