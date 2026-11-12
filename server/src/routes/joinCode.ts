// Coach join code (Prompt 76) - see "API contract" in CLAUDE.md.
//   Coach (requireCoach, mounted at /api/join-code):
//     GET    /              -> { code, active, approveNewClients, link } (the code is made on first use)
//     POST   /regenerate    -> same shape, with a NEW code; the old one stops working at once
//     PATCH  /              { active?, approveNewClients? } -> same shape
//   Public (mounted at /api/join):
//     GET    /:code         -> { coachName } for an active code; ONE 404 message for an unknown or
//                              turned-off code, so the public route cannot tell them apart.
import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db.js";
import { coachIdOf } from "../auth/requireCoach.js";
import { rateLimit } from "../auth/rateLimit.js";
import { appBaseUrl } from "../auth/resetToken.js";
import { newJoinCode, normalizeJoinCode } from "../auth/joinCode.js";
import { asyncHandler } from "./clients.js";

export const BAD_JOIN_CODE = "This join code is not valid. Please ask your coach for a new one.";
const COACH_GONE = "Your account was not found. Please sign in again.";

type CoachJoin = { joinCode: string | null; joinCodeActive: boolean; approveNewClients: boolean };

/** The public link: APP_URL, else Render's own URL, else (dev) the Vite dev server - see appBaseUrl().
 *  In production with neither set it is a relative path; it never trusts the request's Host header. */
function linkFor(code: string): string {
  return `${appBaseUrl() ?? ""}/join/${code}`;
}

function view(c: CoachJoin & { joinCode: string }) {
  return { code: c.joinCode, active: c.joinCodeActive, approveNewClients: c.approveNewClients, link: linkFor(c.joinCode) };
}

const SELECT = { joinCode: true, joinCodeActive: true, approveNewClients: true } as const;

/** Writes a new random code, retrying on the (very unlikely) clash with another coach's code.
 *  onlyIfMissing: the first-use path. Two first requests at once must agree on ONE code, so the write
 *  only lands while the column is still empty; the loser re-reads and returns the winner's code. */
async function assignNewCode(coachId: string, name: string, onlyIfMissing = false) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      if (onlyIfMissing) {
        await prisma.coach.updateMany({ where: { id: coachId, joinCode: null }, data: { joinCode: newJoinCode(name) } });
        const row = await prisma.coach.findUnique({ where: { id: coachId }, select: SELECT });
        if (!row?.joinCode) throw new Error("Join code was not saved.");
        return row;
      }
      return await prisma.coach.update({ where: { id: coachId }, data: { joinCode: newJoinCode(name) }, select: SELECT });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") continue;
      throw err;
    }
  }
  throw new Error("Could not create a unique join code.");
}

export const joinCodeRouter = Router();

joinCodeRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const coach = await prisma.coach.findUnique({
      where: { id: coachIdOf(req) },
      select: { name: true, joinCode: true, joinCodeActive: true, approveNewClients: true },
    });
    if (!coach) return void res.status(401).json({ error: COACH_GONE });
    // Made lazily on first use (race-safe: see assignNewCode's onlyIfMissing).
    const row = coach.joinCode ? coach : await assignNewCode(coachIdOf(req), coach.name, true);
    res.json(view(row as CoachJoin & { joinCode: string }));
  }),
);

joinCodeRouter.post(
  "/regenerate",
  rateLimit("join-code-regenerate", { keyOf: (req) => `coach:${req.coachId}`, max: 20 }),
  asyncHandler(async (req, res) => {
    const coach = await prisma.coach.findUnique({ where: { id: coachIdOf(req) }, select: { name: true } });
    if (!coach) return void res.status(401).json({ error: COACH_GONE });
    const row = await assignNewCode(coachIdOf(req), coach.name);
    res.json(view(row as CoachJoin & { joinCode: string }));
  }),
);

const PatchSchema = z
  .object({
    active: z.boolean({ invalid_type_error: "active must be true or false." }).optional(),
    approveNewClients: z.boolean({ invalid_type_error: "approveNewClients must be true or false." }).optional(),
  })
  .strict("Only active and approveNewClients can be changed.")
  .refine((v) => v.active !== undefined || v.approveNewClients !== undefined, "Nothing to change.");

joinCodeRouter.patch(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = PatchSchema.safeParse(req.body ?? {});
    if (!parsed.success) return void res.status(400).json({ error: parsed.error.issues[0].message });
    const existing = await prisma.coach.findUnique({ where: { id: coachIdOf(req) }, select: { name: true, joinCode: true } });
    if (!existing) return void res.status(401).json({ error: COACH_GONE });
    if (!existing.joinCode) await assignNewCode(coachIdOf(req), existing.name, true);
    const data: { joinCodeActive?: boolean; approveNewClients?: boolean } = {};
    if (parsed.data.active !== undefined) data.joinCodeActive = parsed.data.active;
    if (parsed.data.approveNewClients !== undefined) data.approveNewClients = parsed.data.approveNewClients;
    const row = await prisma.coach.update({
      where: { id: coachIdOf(req) },
      data,
      select: { joinCode: true, joinCodeActive: true, approveNewClients: true },
    });
    res.json(view(row as CoachJoin & { joinCode: string }));
  }),
);

export const publicJoinRouter = Router();

/** The active coach for a code, or null (unknown, malformed or turned off - all the same to callers). */
export async function coachForCode(raw: unknown) {
  const code = normalizeJoinCode(raw);
  if (!code) return null;
  const coach = await prisma.coach.findUnique({
    where: { joinCode: code },
    select: { id: true, name: true, joinCodeActive: true, approveNewClients: true },
  });
  return coach && coach.joinCodeActive ? coach : null;
}

publicJoinRouter.get(
  "/:code",
  rateLimit("join-lookup", { max: 60 }),
  asyncHandler(async (req, res) => {
    const coach = await coachForCode(req.params.code);
    if (!coach) return void res.status(404).json({ error: BAD_JOIN_CODE });
    res.json({ coachName: coach.name });
  }),
);
