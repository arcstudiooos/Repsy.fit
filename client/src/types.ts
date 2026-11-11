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
  /** Owning coach; null = demo data not yet claimed by a coach. */
  coachId: string | null;
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
  /** Owning coach; null = demo data not yet claimed by a coach. */
  coachId: string | null;
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
  /** Owning coach; null = demo data not yet claimed by a coach. */
  coachId: string | null;
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

/** Server defaults: reasoning "", source "manual", status "Active", date today. */
export type NewAssignment = Pick<Assignment, "type" | "title" | "details"> &
  Partial<Pick<Assignment, "reasoning" | "source" | "status" | "date">>;

/** Auto-assign body: the plan type; date defaults to today (UTC). */
export type AutoAssignInput = { type: AssignmentType; date?: DateString };

/** One row of Today's Tasks (Home tab): a plan due today, or a client with no plan in 7+ days. */
export type TodayTask =
  | { kind: "due"; clientId: string; clientName: string; assignmentId: string; assignmentType: AssignmentType; text: string }
  | { kind: "idle"; clientId: string; clientName: string; daysSince: number | null; text: string };
export type TodayTasks = { date: DateString; tasks: TodayTask[] };

/** One row of the Home "New check-ins" card. `kind` lets daily check-ins (Prompt 53) join the list later. */
export type RecentCheckIn = {
  kind: "progress";
  id: string;
  clientId: string;
  clientName: string;
  createdAt: string;
  weightKg: number | null;
  adherence: number | null;
  workoutsDone: number | null;
  note: string;
};
export type RecentCheckIns = { items: RecentCheckIn[] };

/** One row of the Home "Needs attention" card: a client and every rule that fired, in plain words. */
export type AtRiskReason = { rule: "adherence" | "inactive" | "weight"; text: string };
export type AtRiskClient = { clientId: string; clientName: string; reasons: AtRiskReason[] };
export type AtRiskClients = { date: DateString; clients: AtRiskClient[] };

/** The numbers the Home weekly summary is written from (Prompt 51). Saved with the summary. */
export type WeeklyFacts = {
  weekStart: DateString;
  weekEnd: DateString;
  activeClients: number;
  checkIns: number;
  avgAdherence: number | null;
  avgAdherenceChange: number | null;
  assignmentsCompleted: number;
  atRiskClients: number;
};
/** `source` is "ai" for a written summary, "facts" when the AI was unavailable and the facts are listed. */
export type WeeklySummary = { weekStart: DateString; text: string; facts: WeeklyFacts; createdAt: string; source: "ai" | "facts" };
export type WeeklySummaryResponse = { weekStart: DateString; summary: WeeklySummary | null };

export type NewProgressLog =Pick<ProgressLog, "date"> &
  Partial<Pick<ProgressLog, "weightKg" | "adherence" | "workoutsDone" | "note">>;

/** Landing page "Start free" sign-up (Prompt 41). */
export interface Lead {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}
export type NewLead = Pick<Lead, "name" | "email">;

/** A signed-in coach as the auth API returns it (never includes the password hash). */
export interface Coach {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}
export interface RegisterInput {
  name: string;
  email: string;
  password: string;
}
export type LoginInput = Pick<RegisterInput, "email" | "password">;
/** Password reset and account settings (Prompt 47). */
export interface ResetPasswordInput {
  token: string;
  password: string;
}
export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}
