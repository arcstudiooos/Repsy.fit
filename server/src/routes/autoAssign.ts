// One-tap AI plan drafts (Prompt 18; drafts since Nov 2026) - see "API contract" in CLAUDE.md.
// The AI writes ONE plan of the chosen type for this client and the server returns it as a DRAFT:
// nothing is saved. The coach then assigns it as-is, edits it first, parks it for review, or
// discards it (owner's rule: the coach always decides before a plan reaches a client).
import { Router } from "express";
import { z } from "zod";
import { ASSIGNMENT_TYPES, PlanGenerationError, generatePlan, loadClientContext } from "./ai.js";
import { isDateString, today } from "./assignments.js";
import { coachIdOf } from "../auth/requireCoach.js";
import { asyncHandler, findClient, validationMessage } from "./clients.js";

const AutoAssignSchema = z.object({
  type: z.enum(ASSIGNMENT_TYPES, { error: "type is required." }),
  date: z
    .string()
    .refine(isDateString, "date must be a real date in YYYY-MM-DD form.")
    .default(today),
});

// Mounted at /api/clients/:clientId/auto-assign
export const autoAssignRouter = Router({ mergeParams: true });

// POST /api/clients/:clientId/auto-assign - body { type, date? }. Asks the AI for one plan of that
// type for this client and returns 200 { draft: { type, title, details, reasoning, date } }. Saves nothing.
autoAssignRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = AutoAssignSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: validationMessage(parsed.error) });
      return;
    }
    const { clientId } = req.params as { clientId: string };
    const coachId = coachIdOf(req);
    const client = await findClient(clientId, coachId);
    if (!client) {
      res.status(404).json({ error: "Client not found" });
      return;
    }
    const { type, date } = parsed.data;
    const plan = await generatePlan(await loadClientContext(client), type).catch((err: unknown) => {
      if (err instanceof PlanGenerationError) return null;
      throw err;
    });
    if (!plan) {
      res
        .status(502)
        .json({ error: "The AI couldn't create a plan right now. Please try again." });
      return;
    }
    res.json({ draft: { type, title: plan.title, details: plan.details, reasoning: plan.reasoning, date } });
  }),
);
