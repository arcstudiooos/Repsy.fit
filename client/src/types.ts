// Shared types matching the Prisma models in server/prisma/schema.prisma.
// Dates arrive from the API as ISO strings (createdAt) or "YYYY-MM-DD" strings (date).

export const LEVELS = ["Beginner", "Intermediate", "Advanced"] as const;
export type Level = (typeof LEVELS)[number];

/** Suggested goals, in form order. Goal is free text - any other value is allowed too. */
export const GOALS = [
  "Fat loss",
  "Fat loss + strength",
  "Muscle gain",
  "Marathon prep + conditioning",
  "Athletic performance",
  "General fitness",
  "Rehab & mobility",
] as const;

export const ASSIGNMENT_TYPES = ["Workout", "Nutrition", "Habit", "Recovery"] as const;
export type AssignmentType = (typeof ASSIGNMENT_TYPES)[number];

export const ASSIGNMENT_SOURCES = ["ai", "manual"] as const;
export type AssignmentSource = (typeof ASSIGNMENT_SOURCES)[number];

export const ASSIGNMENT_STATUSES = ["Active", "Done", "Paused"] as const;
export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];

export const CHAT_ROLES = ["coach", "ai"] as const;
export type ChatRole = (typeof CHAT_ROLES)[number];

/** "YYYY-MM-DD" */
export type DateString = string;

export interface Client {
  id: string;
  coachId: string;
  name: string;
  /** Free text; suggestions in GOALS. Default "General fitness". */
  goal: string;
  age: number | null;
  weightKg: number | null;
  heightCm: number | null;
  level: Level;
  focus: string;
  /** Notes for AI */
  notes: string;
  createdAt: string;
}

export interface Assignment {
  id: string;
  coachId: string;
  clientId: string;
  type: AssignmentType;
  title: string;
  details: string;
  reasoning: string;
  source: AssignmentSource;
  status: AssignmentStatus;
  date: DateString;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  clientId: string;
  role: ChatRole;
  content: string;
  createdAt: string;
}

export interface ProgressLog {
  id: string;
  coachId: string;
  clientId: string;
  date: DateString;
  weightKg: number | null;
  /** 0-100 */
  adherence: number | null;
  workoutsDone: number | null;
  note: string;
  createdAt: string;
}

// Inputs for create calls: required fields plus any optional ones (server fills defaults).
// coachId is never sent by the client - the server sets it.
export type NewClient = Pick<Client, "name"> &
  Partial<Pick<Client, "goal" | "age" | "weightKg" | "heightCm" | "level" | "focus" | "notes">>;

export type NewAssignment = Pick<Assignment, "type" | "title" | "details" | "date"> &
  Partial<Pick<Assignment, "reasoning" | "source" | "status">>;

export type NewProgressLog = Pick<ProgressLog, "date"> &
  Partial<Pick<ProgressLog, "weightKg" | "adherence" | "workoutsDone" | "note">>;
