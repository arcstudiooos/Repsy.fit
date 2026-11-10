// Demo seed - see "API contract" in CLAUDE.md.
import { Router } from "express";
import { prisma } from "../db.js";
import { DEFAULT_COACH_ID, asyncHandler } from "./clients.js";

// The prototype's starter roster (Prompt 29), in display order.
const DEMO_CLIENTS = [
  {
    name: "Maya Patel",
    goal: "Fat loss + strength",
    age: 29,
    weightKg: 68,
    heightCm: 165,
    level: "Intermediate",
    focus: "Lower body strength, protein intake",
    notes: "Vegetarian. Trains 4x/week. Sleep inconsistent on weekdays.",
  },
  {
    name: "Arjun Mehta",
    goal: "Muscle gain",
    age: 24,
    weightKg: 62,
    heightCm: 178,
    level: "Beginner",
    focus: "Upper body, calorie surplus",
    notes: "Student, budget meals. Prefers morning workouts.",
  },
  {
    name: "Casey Jordan",
    goal: "Marathon prep + conditioning",
    age: 34,
    weightKg: 74,
    heightCm: 172,
    level: "Advanced",
    focus: "Endurance, injury prevention",
    notes: "History of shin splints. Runs 5x/week.",
  },
];

// Oldest week first: +1.2 kg, +0.6 kg, then the client's current weight.
const DEMO_WEEKS = [
  { weightOffset: 1.2, adherence: 72, workoutsDone: 3, note: "Starting week" },
  { weightOffset: 0.6, adherence: 81, workoutsDone: 4, note: "Better consistency" },
  { weightOffset: 0, adherence: 86, workoutsDone: 4, note: "On track" },
];

const DAY_MS = 86_400_000;
const isoDate = (d: Date) => d.toISOString().slice(0, 10);
const round1 = (n: number) => Math.round(n * 10) / 10;

// Any fixed number works: it only has to be the same for every seed request.
const SEED_LOCK_KEY = 4_284_018_305;

export const seedRouter = Router();

// POST /api/seed/demo - creates the 3 demo clients (each with 3 weekly logs and 1 starter plan)
// and returns them (201). If ANY client exists, nothing is created and it returns [] (200).
seedRouter.post(
  "/demo",
  asyncHandler(async (_req, res) => {
    const now = new Date();
    const today = isoDate(now);

    const created = await prisma.$transaction(async (tx) => {
      // Serialise seeds so two quick taps can't both see "no clients" and seed twice.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${SEED_LOCK_KEY})`;
      if ((await tx.client.count({ where: { coachId: DEFAULT_COACH_ID } })) > 0) return [];

      const clients = [];
      for (const [i, demo] of DEMO_CLIENTS.entries()) {
        clients.push(
          await tx.client.create({
            data: {
              ...demo,
              coachId: DEFAULT_COACH_ID,
              // Distinct createdAt keeps the roster in this order (the list sorts by createdAt).
              createdAt: new Date(now.getTime() + i),
              progressLogs: {
                create: DEMO_WEEKS.map((week, w) => ({
                  coachId: DEFAULT_COACH_ID,
                  // The 3 most recent weeks: 14 days ago, 7 days ago, today.
                  date: isoDate(new Date(now.getTime() - (DEMO_WEEKS.length - 1 - w) * 7 * DAY_MS)),
                  weightKg: round1(demo.weightKg + week.weightOffset),
                  adherence: week.adherence,
                  workoutsDone: week.workoutsDone,
                  note: week.note,
                })),
              },
              assignments: {
                create: [
                  {
                    coachId: DEFAULT_COACH_ID,
                    type: "Workout",
                    title: "Demo starter plan",
                    details: "Full-body session 3x this week - squat, hinge, push, pull. RPE 7-8.",
                    reasoning: "Starter plan to establish baseline.",
                    source: "manual",
                    status: "Active",
                    date: today,
                  },
                ],
              },
            },
          }),
        );
      }
      return clients;
    });

    res.status(created.length ? 201 : 200).json(created);
  }),
);
