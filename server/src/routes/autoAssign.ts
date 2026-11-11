// One-tap auto-assign (Prompt 18) - see "API contract" in CLAUDE.md.
// The coach asked for a plan explicitly with this button, so it is SAVED directly
// (source "ai", status Active). If the AI fails, nothing is saved - a generic plan is never
// saved as if it were personalised.
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { ASSIGNMENT_TYPES, PlanGenerationError, generatePlan, loadClientContext } from "./ai.js";
import { isDateString, today } from "./assignments.js";
import { DEMO_COACH_ID, asyncHandler, findClient, validationMessage } from "./clients.js";

const AutoAssignSchema = z.object({
  type: z.enum(ASSIGNMENT_TYPES, { required_error: "type is required." }),
  date: z
    .string()
    .refine(isDateString, "date must be a real date in YYYY-MM-DD form.")
    .default(today),
});

// Mounted at /api/clients/:clientId/auto-assign
export const autoAssignRouter = Router({ mergeParams: true });

// POST /api/clients/:clientId/auto-assign - body { type, date? }. Asks the AI for one plan
// of that type for this client, saves it and returns [the new assignment] (201).
autoAssignRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = AutoAssignSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: validationMessage(parsed.error) });
      return;
    }
    const { clientId } = req.params as { clientId: string };
    const client = await findClient(clientId);
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
        .json({ error: "The AI couldn't create a plan right now. Nothing was saved - please try again." });
      return;
    }
    const assignment = await prisma.assignment.create({
      data: {
        clientId: client.id,
        coachId: DEMO_COACH_ID,
        type,
        title: plan.title,
        details: plan.details,
        reasoning: plan.reasoning,
        source: "ai",
        status: "Active",
        date,
      },
    });
    res.status(201).json([assignment]);
  }),
);
