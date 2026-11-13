// Review queue (Prompt 52) - see "API contract" in CLAUDE.md.
// Items waiting for the coach: AI suggestions the coach parked instead of assigning, and new
// progress logs flagged for review. Approve or Dismiss decides one item; nothing is ever decided
// automatically and nothing is deleted - decided rows stay as the client's history.
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { coachIdOf } from "../auth/requireCoach.js";
import { ASSIGNMENT_TYPES } from "./ai.js";
import { asyncHandler, validationMessage } from "./clients.js";
import { isDateString, today } from "./assignments.js";

export const REVIEW_KINDS = ["suggestion", "checkin"] as const;
export const REVIEW_STATUSES = ["Pending", "Approved", "Dismissed"] as const;

export const reviewQueueRouter = Router();

type Row = {
  id: string;
  clientId: string;
  kind: string;
  status: string;
  title: string;
  summary: string;
  type: string | null;
  details: string;
  reasoning: string;
  assignmentId: string | null;
  createdAt: Date;
  decidedAt: Date | null;
  client: { name: string };
};

const shape = (row: Row) => ({
  id: row.id,
  clientId: row.clientId,
  clientName: row.client.name,
  kind: row.kind as (typeof REVIEW_KINDS)[number],
  status: row.status as (typeof REVIEW_STATUSES)[number],
  title: row.title,
  summary: row.summary,
  type: row.type,
  details: row.details,
  reasoning: row.reasoning,
  assignmentId: row.assignmentId,
  createdAt: row.createdAt.toISOString(),
  decidedAt: row.decidedAt ? row.decidedAt.toISOString() : null,
});

const select = {
  id: true,
  clientId: true,
  kind: true,
  status: true,
  title: true,
  summary: true,
  type: true,
  details: true,
  reasoning: true,
  assignmentId: true,
  createdAt: true,
  decidedAt: true,
  client: { select: { name: true } },
} as const;

// GET /api/review-queue?status=pending|decided (default pending) -> { pendingCount, items }.
// pendingCount is always the coach's real pending total, so the Home badge matches the list.
reviewQueueRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const want = req.query.status === "decided" ? "decided" : "pending";
    const coachId = coachIdOf(req);
    const [rows, pendingCount] = await Promise.all([
      prisma.reviewItem.findMany({
        where: { coachId, status: want === "pending" ? "Pending" : { in: ["Approved", "Dismissed"] } },
        orderBy: want === "pending" ? [{ createdAt: "asc" }, { id: "asc" }] : [{ decidedAt: "desc" }, { id: "desc" }],
        take: want === "pending" ? 100 : 50,
        select,
      }),
      prisma.reviewItem.count({ where: { coachId, status: "Pending" } }),
    ]);
    res.json({ pendingCount, items: rows.map(shape) });
  }),
);

const NewItemSchema = z.object({
  clientId: z.string({ error: "clientId is required." }).min(1, "clientId is required."),
  kind: z.enum(REVIEW_KINDS).default("suggestion"),
  title: z.string({ error: "title is required." }).trim().min(1, "title is required.").max(200),
  summary: z.string().trim().max(500).default(""),
  type: z.enum(ASSIGNMENT_TYPES).nullish(),
  details: z.string().trim().max(6000).default(""),
  reasoning: z.string().trim().max(2000).default(""),
  sourceId: z.string().max(60).nullish(),
});

// POST /api/review-queue - park something for the coach to decide later (201 ReviewItem).
reviewQueueRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = NewItemSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: validationMessage(parsed.error) });
      return;
    }
    const coachId = coachIdOf(req);
    const { clientId, ...rest } = parsed.data;
    const client = await prisma.client.findFirst({ where: { id: clientId, coachId }, select: { id: true } });
    if (!client) {
      res.status(404).json({ error: "Client not found" });
      return;
    }
    if (rest.kind === "suggestion" && !rest.type) {
      res.status(400).json({ error: "type is required for a suggestion." });
      return;
    }
    const row = await prisma.reviewItem.create({
      data: { ...rest, type: rest.type ?? null, sourceId: rest.sourceId ?? null, clientId: client.id, coachId },
      select,
    });
    res.status(201).json(shape(row));
  }),
);

/** The pending item, or null when it is not this coach's or already decided. */
async function pendingOr404(req: Parameters<typeof coachIdOf>[0], id: string) {
  return prisma.reviewItem.findFirst({ where: { id, coachId: coachIdOf(req), status: "Pending" }, select });
}

const DecisionSchema = z.object({
  date: z.string().refine(isDateString, "date must be a real date in YYYY-MM-DD form.").optional(),
});

// POST /api/review-queue/:itemId/approve -> { item, assignment }.
// A suggestion becomes a real assignment (source "ai"); a flagged check-in is just marked read.
reviewQueueRouter.post(
  "/:itemId/approve",
  asyncHandler(async (req, res) => {
    const parsed = DecisionSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: validationMessage(parsed.error) });
      return;
    }
    const item = await pendingOr404(req, req.params.itemId);
    if (!item) {
      res.status(404).json({ error: "Review item not found" });
      return;
    }
    const coachId = coachIdOf(req);
    const result = await prisma.$transaction(async (tx) => {
      let assignment = null;
      if (item.kind === "suggestion" && item.type) {
        assignment = await tx.assignment.create({
          data: {
            coachId,
            clientId: item.clientId,
            type: item.type,
            title: item.title,
            details: item.details,
            reasoning: item.reasoning,
            source: "ai",
            status: "Active",
            date: parsed.data.date ?? today(),
          },
        });
      }
      const row = await tx.reviewItem.update({
        where: { id: item.id },
        data: { status: "Approved", decidedAt: new Date(), assignmentId: assignment?.id ?? null },
        select,
      });
      return { row, assignment };
    });
    res.json({ item: shape(result.row), assignment: result.assignment });
  }),
);

// POST /api/review-queue/:itemId/dismiss -> the item, status Dismissed. Nothing is deleted:
// the row stays in the client's history, and a flagged progress log is untouched.
reviewQueueRouter.post(
  "/:itemId/dismiss",
  asyncHandler(async (req, res) => {
    const item = await pendingOr404(req, req.params.itemId);
    if (!item) {
      res.status(404).json({ error: "Review item not found" });
      return;
    }
    const row = await prisma.reviewItem.update({
      where: { id: item.id },
      data: { status: "Dismissed", decidedAt: new Date() },
      select,
    });
    res.json({ item: shape(row), assignment: null });
  }),
);
