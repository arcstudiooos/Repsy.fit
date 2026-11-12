// Landing page lead capture (Prompt 41) - see "API contract" in CLAUDE.md.
// Public endpoint: stores a name + email only. No password, no payment.
import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler } from "./clients.js";
import { rateLimit } from "../auth/rateLimit.js";

const NewLeadSchema = z.object({
  name: z.string({ required_error: "Please enter your name." }).trim().min(1, "Please enter your name.").max(100, "Name is too long."),
  email: z
    .string({ required_error: "Please enter your email." })
    .trim()
    .toLowerCase()
    .min(1, "Please enter your email.")
    .max(254, "Email is too long.")
    .email("Please enter a valid email address."),
});

export const ALREADY_ON_LIST = "You are already on the list.";

export const leadsRouter = Router();

// POST /api/leads { name, email } -> 201 { id, name, email, createdAt }
// 400 { error } for a missing name or a bad email; 409 { error: "You are already on the list." }
// when that email (case-insensitive) is already saved.
leadsRouter.post(
  "/",
  // The only public write in the app, so it is metered like the sign-in routes (Prompt 73).
  rateLimit("leads", { max: 20 }),
  asyncHandler(async (req, res) => {
    const parsed = NewLeadSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }
    try {
      const lead = await prisma.lead.create({ data: parsed.data });
      res.status(201).json(lead);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        res.status(409).json({ error: ALREADY_ON_LIST });
        return;
      }
      throw err;
    }
  }),
);

/** The Privacy Policy promises website enquiries are kept for at most 12 months. */
export const LEAD_RETENTION_DAYS = 365;

/** Deletes enquiries older than LEAD_RETENTION_DAYS. Run at start-up and once a day (index.ts). */
export async function pruneOldLeads(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - LEAD_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const { count } = await prisma.lead.deleteMany({ where: { createdAt: { lt: cutoff } } });
  return count;
}
