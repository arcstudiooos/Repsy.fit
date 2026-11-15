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
  /** Inspo C5: the day they are working towards, "YYYY-MM-DD", or null. */
  goalDate?: string | null;
  /** Inspo C5: what that day is - a wedding, a race, a holiday. */
  goalEvent?: string;
  createdAt: string;
  /** Client sign-in email once invited (Prompt 65). The password hash is never sent. */
  loginEmail?: string | null;
  /** Prompt 77/84: "coach" (added by the coach) or "code" (joined with the join code). */
  joinedVia?: string;
  joinStatus?: "active" | "pending" | "declined";
  /** GET /api/clients only (Nov 2026): newest daily check-in or progress log day ("YYYY-MM-DD"), null = none. */
  lastCheckIn?: string | null;
  /** GET /api/clients only: average adherence (%) of progress logs in the last 14 days, null = none. */
  adherence?: number | null;
}

/** Prompt 84: a client waiting for approval (or declined), from GET /api/clients/waiting. */
export interface WaitingClient {
  id: string;
  name: string;
  loginEmail: string | null;
  joinStatus: "pending" | "declined";
  joinedVia: string;
  createdAt: string;
}

/** Prompt 84: Home alerts about clients. */
export interface CoachAlerts {
  waiting: number;
  joined: { clientId: string; name: string; at: string }[];
  finished: { clientId: string; clientName: string; assignmentId: string; title: string; type: AssignmentType; effort: number | null; note: string; at: string }[];
  unread: { clientId: string; name: string; count: number }[];
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
  /** Prompt 79: when it was marked Done and by whom; the client's effort (1-10) and note if THEY did. */
  completedAt?: string | null;
  completedBy?: "coach" | "client" | null;
  clientEffort?: number | null;
  clientNote?: string;
  /** Prompt 80: meals from the coach's library on a Nutrition plan. */
  mealIds?: string[];
}

/** Prompt 79: what a CLIENT sees of one of their assignments (no coach id, no AI / manual source). */
export interface ClientAssignment {
  id: string;
  type: AssignmentType;
  title: string;
  details: string;
  reasoning: string;
  status: "Active" | "Done";
  date: DateString;
  completedAt: string | null;
  completedBy: "coach" | "client" | null;
  clientEffort: number | null;
  clientNote: string;
  /** Prompt 80: only on GET one plan - a Nutrition plan's meals from the coach's library. */
  meals?: { id: string; name: string; mealType: string; calories: number; proteinG: number; carbsG: number; fatG: number }[];
}

/** Prompt 80: the client's own tracking. */
export interface MyHabits {
  date: DateString;
  days: DateString[];
  habits: { id: string; name: string; week: boolean[]; currentStreak: number; bestStreak: number }[];
}
export interface MyCheckIn {
  date: DateString;
  energy: number | null;
  mood: number | null;
  sleepHours: number | null;
  recoveryScore: number | null;
  waterLiters: number | null;
  steps: number | null;
  foodNote: string;
}
export interface MyProgressLog {
  id: string;
  date: DateString;
  weightKg: number | null;
  adherence: number | null;
  workoutsDone: number | null;
  note: string;
  createdAt: string;
}
/** Prompt 81: a body measurement as the client sees it. */
export interface MyMeasurement {
  id: string;
  date: DateString;
  waistCm: number | null;
  chestCm: number | null;
  armCm: number | null;
  hipCm: number | null;
  bodyFatPercent: number | null;
  note: string;
  createdBy: "coach" | "client";
  createdAt: string;
}
/** Prompt 82: a message in the client's own thread with their coach. */
export type MyMessage = Pick<ThreadMessage, "id" | "sender" | "body" | "createdAt" | "readAt">;
/** Prompt 83: the client's own account summary. */
export interface MyAccount {
  name: string;
  loginEmail: string | null;
  googleConnected: boolean;
  timezone: string | null;
}
/** Prompt 83: one of the client's own payments (amount in the coach's currency; never the coach's note). */
export interface MyPayment {
  id: string;
  paidOn: DateString;
  amount: number;
  currency: string;
  method: string;
  planName: string;
}
export interface MyTargets {
  calorieTarget: number | null;
  proteinTargetG: number | null;
  weeklyCheckInDay: number;
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
  Partial<Pick<Assignment, "reasoning" | "source" | "status" | "date">> & {
    /** Prompt 80: meals from the coach's library (Nutrition plans only). */
    mealIds?: string[];
  };

/** AI draft request body: the plan type; date defaults to today (UTC). Nothing is saved. */
export type AutoAssignInput = { type: AssignmentType; date?: DateString };

/** One row of Today's Tasks (Home tab): a plan due today, or a client with no plan in 7+ days. */
export type TodayTask =
  | { kind: "due"; clientId: string; clientName: string; assignmentId: string; assignmentType: AssignmentType; text: string }
  | { kind: "idle"; clientId: string; clientName: string; daysSince: number | null; text: string }
  /** Prompt 69: today's Booked appointment (UTC instants; shown in the viewer's local time). */
  | {
      kind: "appointment";
      clientId: string;
      clientName: string;
      appointmentId: string;
      appointmentType: AppointmentType;
      startsAt: string;
      endsAt: string;
      text: string;
    };
export type TodayTasks = { date: DateString; tasks: TodayTask[] };

// ----- Schedule (Prompt 69). startsAt / endsAt are UTC ISO timestamps. -----
export const APPOINTMENT_TYPES = ["Session", "Call", "Check-in review", "Other"] as const;
export type AppointmentType = (typeof APPOINTMENT_TYPES)[number];
export const APPOINTMENT_STATUSES = ["Booked", "Done", "Cancelled", "No-show"] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];
export interface Appointment {
  id: string;
  coachId: string;
  clientId: string;
  clientName: string;
  title: string;
  type: AppointmentType;
  startsAt: string;
  endsAt: string;
  /** Optional place or link, plain text. */
  location: string;
  status: AppointmentStatus;
  /** The coach's private note; never sent to the client. */
  note: string;
  createdAt: string;
}
export type NewAppointment = Pick<Appointment, "clientId" | "title" | "type" | "startsAt" | "endsAt"> &
  Partial<Pick<Appointment, "location" | "status" | "note">>;
/** What a signed-in CLIENT sees of their own upcoming session: no note, no status. */
export interface MySession {
  id: string;
  title: string;
  type: AppointmentType;
  startsAt: string;
  endsAt: string;
  location: string;
}

// ----- Engagement: streaks and leaderboard (Prompt 71). No points, no prizes. -----
/** The three numbers behind every ranking. `habitPercent` is null when the client has no active habits. */
export interface MyStreaks {
  date: string;
  checkInStreak: number;
  habitPercent: number | null;
  workoutsThisWeek: number;
  /** false = nothing logged yet ("Not enough data yet"). */
  enoughData: boolean;
}
export interface EngagementRow {
  clientId: string;
  clientName: string;
  /** 1-based, ties share a rank; null when there is not enough data. */
  rank: number | null;
  checkInStreak: number;
  habitPercent: number | null;
  workoutsThisWeek: number;
  enoughData: boolean;
}
export interface EngagementBoard {
  date: string;
  clients: EngagementRow[];
}

// ----- Business: plans and recorded payments (Prompt 68). Record-keeping only. -----
export const CURRENCIES = ["INR", "USD"] as const;
export type Currency = (typeof CURRENCIES)[number];
export const BILLING_CYCLES = ["Monthly", "Quarterly", "Yearly", "One-time"] as const;
export type BillingCycle = (typeof BILLING_CYCLES)[number];
export const PLAN_STATUSES = ["Active", "Paused", "Ended"] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];
export const PAYMENT_METHODS = ["Cash", "UPI", "Card", "Bank", "Other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export interface ClientPlan {
  id: string;
  coachId: string;
  clientId: string;
  planName: string;
  /** In the coach's currency; formatted for display, never stored with a symbol. */
  priceAmount: number;
  billingCycle: BillingCycle;
  startDate: DateString;
  nextDueDate: DateString;
  /** The day of the month payments fall due (1-31). */
  anchorDay: number;
  status: PlanStatus;
}
export interface Payment {
  id: string;
  clientPlanId: string;
  clientId: string;
  amount: number;
  paidOn: DateString;
  method: PaymentMethod;
  note: string;
}
export type NewClientPlan = Pick<ClientPlan, "planName" | "priceAmount" | "billingCycle" | "startDate"> &
  Partial<Pick<ClientPlan, "nextDueDate" | "status">>;
export type NewPayment = { amount: number; paidOn: DateString; method: PaymentMethod; note?: string };
export interface BusinessPlanRow {
  client: { id: string; name: string };
  plan: ClientPlan;
  lastPayment: { amount: number; paidOn: DateString; method: PaymentMethod } | null;
}
/** What a signed-in CLIENT sees of their own plan: no amounts. */
export interface MyPlan {
  plan: { planName: string; status: PlanStatus; nextDueDate: DateString; priceAmount?: number; billingCycle?: string } | null;
  lastPaymentDate: DateString | null;
  /** Nov 2026: clients see what they pay, in their coach's currency. */
  lastPaymentAmount?: number | null;
  currency?: string;
}

/** A client's sign-in status as the coach sees it (Prompt 65). */
/** Prompt 76: the coach's join code that clients sign up with. */
export interface JoinCode {
  code: string;
  active: boolean;
  approveNewClients: boolean;
  /** The full link to share, e.g. https://app.repsy.fit/join/ANNA-7K2Q8M */
  link: string;
}

export type ClientAccessStatus = "none" | "invited" | "active";
export interface ClientAccess {
  /** The email the client signs in with (set when they used an invite). */
  loginEmail: string | null;
  /** Where the live, unused invite went; it becomes the login email once used. */
  pendingEmail: string | null;
  status: ClientAccessStatus;
  inviteExpiresAt: string | null;
  /** False when the server has no email provider: invites come back as a link to share. */
  emailConfigured: boolean;
}
/** Result of inviting a client: emailed, or a link for the coach to share. */
export type InviteResult =
  | { sent: true; loginEmail: string; inviteExpiresAt: string }
  | { sent: false; loginEmail: string; inviteExpiresAt: string; inviteLink: string; note: string };
/** What a signed-in CLIENT sees about themselves (Prompt 65). */
export type ClientJoinStatus = "active" | "pending" | "declined";
export interface ClientAccount {
  id: string;
  name: string;
  loginEmail: string | null;
  /** Prompt 77: pending / declined clients only see the waiting screen. */
  joinStatus: ClientJoinStatus;
  /** Prompt 77 (GET /me only): the client's own coach's name, and whether to show the welcome questions. */
  coachName?: string | null;
  needsWelcome?: boolean;
}
/** Prompt 77: the welcome questions (GET/PATCH /api/client-auth/me/profile). Weight is always kg. */
export interface ClientProfile {
  goal: string;
  age: number | null;
  heightCm: number | null;
  weightKg: number | null;
  level: Level;
  units: "kg" | "lb";
  injuries: string;
  /** Prompt 80: 0 = Sunday ... 6 = Saturday. */
  weeklyCheckInDay?: number;
  /** True once the client has explicitly agreed to their health details being stored. */
  healthConsent?: boolean;
}
/** Prompt 77: POST /api/client-auth/join replies 201 (signed in) or 202 (check your email). */
export type JoinResult = ({ status?: undefined } & ClientAccount) | { status: "check-email"; message: string };

/** Who wrote a coach <-> client message (Prompt 63). */
export const MESSAGE_SENDERS = ["coach", "client"] as const;
export type MessageSender = (typeof MESSAGE_SENDERS)[number];

/**
 * One coach <-> client message (Prompt 63). NOT an AI Coach chat message (that is `ChatMessage`).
 * `body` is plain text and is always rendered as text, never as HTML.
 */
export interface ThreadMessage {
  id: string;
  coachId: string;
  clientId: string;
  sender: MessageSender;
  body: string;
  createdAt: string;
  /** When the other side read it; for client messages, when the coach opened the thread. */
  readAt: string | null;
}
/** One row of the Messages conversation list (Prompt 64). */
export interface ThreadSummary {
  clientId: string;
  lastMessage: { sender: MessageSender; body: string; createdAt: string } | null;
  /** Client messages the coach has not opened yet. */
  unreadCount: number;
}

/** One page of a thread, oldest -> newest. */
export interface MessageThread {
  messages: ThreadMessage[];
  hasMore: boolean;
}

/** One day's check-in for a client (Prompt 53). One row per client per day. */
export interface DailyCheckIn {
  id: string;
  coachId: string | null;
  clientId: string;
  date: DateString;
  /** 1-5 */
  energy: number | null;
  /** 1-5 */
  mood: number | null;
  /** 0-16, one decimal (filled in by Prompt 55) */
  sleepHours: number | null;
  /** 1-5 (filled in by Prompt 55) */
  recoveryScore: number | null;
  waterLiters: number | null;
  steps: number | null;
  foodNote: string;
  createdAt: string;
  updatedAt: string;
}
/** Body for saving one day. The same date again updates that day. */
export type NewDailyCheckIn = Pick<DailyCheckIn, "date"> &
  Partial<Pick<DailyCheckIn, "energy" | "mood" | "sleepHours" | "recoveryScore" | "waterLiters" | "steps" | "foodNote">>;

/** One set of body measurements on one date (Prompt 56). Only `date` is required. Field names are
 *  the API contract (Prompt 70's CSV export reuses them). Weight is not stored here: it is read from ProgressLog. */
export interface Measurement {
  id: string;
  coachId: string | null;
  clientId: string;
  date: DateString;
  /** above 0, up to 300 */
  waistCm: number | null;
  chestCm: number | null;
  armCm: number | null;
  hipCm: number | null;
  /** above 0, up to 75 */
  bodyFatPercent: number | null;
  note: string;
  /** Prompt 81: who added it. */
  createdBy?: "coach" | "client";
  createdAt: string;
}
export type NewMeasurement = Pick<Measurement, "date"> &
  Partial<Pick<Measurement, "waistCm" | "chestCm" | "armCm" | "hipCm" | "bodyFatPercent" | "note">>;

/** Reports and export (Prompt 70). Inclusive YYYY-MM-DD range; either end may be left out. */
export interface ReportRange {
  from?: DateString;
  to?: DateString;
}
export type ClientExportType = "progress" | "measurements" | "payments" | "assignments";
/** The data behind the printable progress report: never notes, focus, reasoning or chat. */
export interface ProgressReport {
  client: { name: string; goal: string; age: number | null; weightKg: number | null; heightCm: number | null; level: Level };
  range: { from: DateString | null; to: DateString | null };
  logs: Pick<ProgressLog, "date" | "weightKg" | "adherence" | "workoutsDone">[];
  measurements: Pick<Measurement, "date" | "waistCm" | "chestCm" | "armCm" | "hipCm" | "bodyFatPercent">[];
  assignments: { total: number; done: number; byType: { type: AssignmentType; count: number }[] };
  checkIns: {
    count: number;
    energy: number | null;
    mood: number | null;
    sleepHours: number | null;
    recoveryScore: number | null;
    waterLiters: number | null;
    steps: number | null;
  };
}

/** One exercise of a template, in the Manual Planner's shape (Prompt 58). `rest` is seconds. */
export interface TemplateExercise {
  name: string;
  sets: number;
  reps: string;
  rest: number;
}

/** A coach's reusable workout (Prompt 58). Coach-level, not tied to a client. */
export interface WorkoutTemplate {
  id: string;
  coachId: string;
  name: string;
  focus: string;
  exercises: TemplateExercise[];
  notes: string;
  createdAt: string;
}
export type NewWorkoutTemplate = Pick<WorkoutTemplate, "name" | "exercises"> & Partial<Pick<WorkoutTemplate, "focus" | "notes">>;

/** Inspo W10: a reusable multi-week program. A template - it has no dates until it is assigned. */
/** Inspo C5: the day a client is working towards, and what it is. */
export interface GoalPatch {
  goalDate?: string | null;
  goalEvent?: string;
}

export interface ProgramItem {
  id?: string;
  /** 1-based within its phase. */
  week: number;
  /** 0 = Sunday ... 6 = Saturday. */
  weekday: number;
  type: AssignmentType;
  title: string;
  details: string;
}
export interface ProgramPhase {
  id?: string;
  name: string;
  weeks: number;
  items: ProgramItem[];
}
export interface Program {
  id: string;
  name: string;
  description: string;
  phases: ProgramPhase[];
  totalWeeks: number;
  totalItems: number;
  createdAt: string;
}
export type NewProgram = Pick<Program, "name"> & Partial<Pick<Program, "description" | "phases">>;
/** What assigning WOULD create: shown before a coach commits weeks of a client's calendar. */
export interface ProgramPreview {
  startDate: string;
  count: number;
  items: { date: string; type: AssignmentType; title: string; details: string; phaseName: string }[];
}

/** The question types a form can hold (Inspo C1). Mirrors QUESTION_TYPES in server forms/schema.ts. */
export const QUESTION_TYPES = ["single", "multi", "text", "longtext", "number", "date", "scale"] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];
/** Types whose answer is chosen from `options`. */
export const CHOICE_TYPES: readonly QuestionType[] = ["single", "multi"];

/** How each type reads in the builder's dropdown. */
export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  single: "Pick one",
  multi: "Pick any",
  text: "Short text",
  longtext: "Long text",
  number: "A number",
  date: "A date",
  scale: "A rating",
};

export interface FormQuestion {
  id: string;
  type: QuestionType;
  label: string;
  help: string;
  required: boolean;
  options: string[];
}

/** A coach's intake or assessment form. `sample` true = Repsy's, read-only, copy it to change it. */
export interface CoachForm {
  id: string;
  name: string;
  description: string;
  questions: FormQuestion[];
  active: boolean;
  sample: boolean;
  createdAt: string;
  submissionCount: number;
}
export type NewCoachForm = Pick<CoachForm, "name"> &
  Partial<Pick<CoachForm, "description" | "questions" | "active">>;

/** One client's answers, with the questions AS ASKED when they answered. */
export interface FormSubmission {
  id: string;
  clientId: string;
  clientName: string;
  answers: Record<string, string | string[]>;
  asked: FormQuestion[];
  createdAt: string;
}

/**
 * Inspo N1: the food categories. Mirrors FOOD_CATEGORIES in server routes/foods.ts (drift-tested).
 * India-first order: a coach here reaches for grains and pulses before anything else.
 */
export const FOOD_CATEGORIES = [
  "Grains",
  "Pulses",
  "Dairy and eggs",
  "Meat and fish",
  "Vegetables",
  "Fruit",
  "Nuts and fats",
  "Supplements and drinks",
  "Snacks and sweets",
] as const;
export type FoodCategory = (typeof FOOD_CATEGORIES)[number];

/** Inspo N1: one food, with the macros of ONE serving. `stock` true = Repsy's, read-only. */
export interface Food {
  id: string;
  name: string;
  category: FoodCategory;
  /** How the serving reads: "1 roti", "1 cup", "100 g". */
  servingLabel: string;
  servingG: number;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
  stock: boolean;
}
export type NewFood = Omit<Food, "id" | "stock" | "fiberG"> & Partial<Pick<Food, "fiberG">>;

/** Inspo N1/N7: a food and how much of it, while building up a meal. */
export interface FoodPortion {
  food: Food;
  servings: number;
}

/** Inspo C8: what a new client gets automatically, set once in the coach's account. */
export interface OnboardingSettings {
  welcomeMessage: string;
  intakeFormId: string | null;
}

/** Inspo C8: has this client's intake been done? `form` null = the coach chose none. */
export interface IntakeState {
  form: { id: string; name: string; questionCount: number } | null;
  doneAt: string | null;
}

/**
 * Inspo N3: which diet a meal suits. Mirrors DIET_TYPES in server routes/meals.ts (drift-tested).
 * Jain and Halal are here because "vegetarian" alone does not answer what an Indian client asks.
 */
export const DIET_TYPES = ["Any", "Vegetarian", "Eggetarian", "Vegan", "Jain", "Halal", "Non-vegetarian"] as const;
export type DietType = (typeof DIET_TYPES)[number];

/** Inspo N4: when the meal is eaten. Mirrors MEAL_TYPES in server routes/meals.ts (drift-tested). */
export const MEAL_TYPES = [
  "On waking up",
  "Early morning",
  "Breakfast",
  "After breakfast",
  "Mid-morning",
  "Morning snack",
  "Lunch",
  "Snack",
  "Evening snack",
  "Dinner",
  "After dinner",
  "Bed time",
  "Before workout",
  "During workout",
  "Between workouts",
  "After workout",
  "Non-training day",
] as const;
export type MealType = (typeof MEAL_TYPES)[number];

/** A coach's reusable meal (Prompt 60). Coach-level. Every value is typed in by the coach. */
/**
 * The numbers above a client's workspace (Inspo C4/C5). Nulls mean "no data yet" and are shown as
 * blanks, never as zero.
 */
export interface ClientSnapshot {
  latestWeightKg: number | null;
  latestWeightOn: string | null;
  adherencePercent: number | null;
  /** The window the adherence average covers, so the card can say so. */
  adherenceDays: number;
  lastWorkoutOn: string | null;
  lastWorkoutTitle: string | null;
  totalWorkoutsDone: number;
  /** Consecutive days with a finished plan, check-in or progress log, ending today or yesterday. */
  currentStreak: number;
  longestStreak: number;
}

/** How a section is run (Inspo W5). Mirrors PROTOCOLS in server src/workouts/structure.ts. */
export const PROTOCOLS = ["Warm up", "Regular", "Superset", "Circuit", "AMRAP", "EMOM", "TABATA", "Cool-down"] as const;
export type Protocol = (typeof PROTOCOLS)[number];
/** Protocols that are a fixed time box rather than a number of sets. */
export const TIMED_PROTOCOLS: readonly Protocol[] = ["AMRAP", "EMOM", "TABATA"];

/** What the client can be asked to log back (Inspo W8). Mirrors RECORD_FIELDS on the server. */
export const RECORD_FIELDS = ["reps", "weight", "duration", "distance", "calories"] as const;
export type RecordField = (typeof RECORD_FIELDS)[number];

/** One exercise inside a section. Per-set numbers are arrays: repsPerSet [12,12,10] is three sets. */
export interface WorkoutExerciseInput {
  exerciseId?: string | null;
  name: string;
  repsPerSet: number[];
  loadPerSet: string[];
  durationSec?: number | null;
  distanceM?: number | null;
  rpe?: number | null;
  restSec: number;
  notes: string;
  recordFields: RecordField[];
}

/** One block of a structured workout. */
export interface WorkoutSectionInput {
  protocol: Protocol;
  sets: number;
  restSec: number;
  durationSec?: number | null;
  notes: string;
  exercises: WorkoutExerciseInput[];
}

/**
 * A workout's structure. `stored` false means these sections were parsed from the plan's text on
 * demand (a plan written before structure existed) - saving them makes the structure real.
 */
export interface WorkoutStructure {
  stored: boolean;
  sections: WorkoutSectionInput[];
  estimatedSeconds: number;
  /** Only on a save: the regenerated plan text. */
  details?: string;
}

/** Equipment tags for the exercise library (Inspo W1). Mirrors EQUIPMENT in server routes/exercises.ts. */
export const EQUIPMENT = [
  "Bodyweight",
  "Barbell",
  "Dumbbell",
  "Kettlebell",
  "Machine",
  "Cable",
  "Resistance band",
  "Pull up bar",
  "Medicine ball",
  "Other",
] as const;
export type Equipment = (typeof EQUIPMENT)[number];

/** Muscle groups. Mirrors MUSCLE_GROUPS in server routes/exercises.ts. */
export const MUSCLE_GROUPS = [
  "Chest",
  "Back",
  "Shoulders",
  "Arms",
  "Legs",
  "Glutes",
  "Core",
  "Full body",
  "Cardio",
  "Mobility",
] as const;
export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];

/** One movement in the catalogue. `stock` true = seeded by Repsy, shared, read-only to the coach. */
export interface Exercise {
  id: string;
  name: string;
  equipment: Equipment;
  muscleGroup: MuscleGroup;
  /** A link only; Repsy never hosts or embeds it. Empty string when there is none. */
  mediaUrl: string;
  instructions: string;
  stock: boolean;
}
export type NewExercise = Pick<Exercise, "name"> &
  Partial<Pick<Exercise, "equipment" | "muscleGroup" | "mediaUrl" | "instructions">>;

export interface Meal {
  id: string;
  /** NULL for a Repsy stock meal shared by every coach. Prefer `stock` over testing this. */
  coachId: string | null;
  /** True for a shared Repsy stock meal: read-only, copy it to change it. */
  stock: boolean;
  name: string;
  mealType: MealType;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  /** Inspo N2: the fourth macro. 0 when the coach did not record it. */
  fiberG: number;
  ingredients: string;
  steps: string;
  /** Inspo N3: which diet it suits. "Any" when the coach has not said. */
  dietType: DietType;
  /** Inspo N8: ids of meals this one can be swapped for. A suggestion, not a constraint. */
  swapIds: string[];
  createdAt: string;
}
export type NewMeal = Pick<Meal, "name" | "mealType" | "calories" | "proteinG" | "carbsG" | "fatG"> &
  Partial<Pick<Meal, "fiberG" | "ingredients" | "steps" | "dietType" | "swapIds">>;

export const SEXES = ["Female", "Male"] as const;
export type Sex = (typeof SEXES)[number];
export const ACTIVITY_LEVELS = ["Sedentary", "Light", "Moderate", "Active", "Athlete"] as const;
export type ActivityLevel = (typeof ACTIVITY_LEVELS)[number];

/** Macro calculator input (Prompt 61). Adults only: the server refuses an age under 18. */
export interface MacroInput {
  weightKg: number;
  heightCm: number;
  age: number;
  sex: Sex;
  activity: ActivityLevel;
  /** Free text; the goal list is suggested. */
  goal: string;
}
/** A starting estimate for coaching only (whole numbers). Nothing is stored. */
export interface MacroResult {
  bmr: number;
  tdee: number;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

/** A habit the coach tracks for one client (Prompt 54), with its this-week ticks and streaks. */
/**
 * Inspo C3: the habit preset library. Duplicated from server/src/habitPresets.ts for an instant
 * picker with no round trip; a drift test keeps the two identical.
 */
export const HABIT_CATEGORIES = ["Nutrition", "Movement", "Sleep and recovery", "Mind", "Lifestyle"] as const;
export type HabitCategory = (typeof HABIT_CATEGORIES)[number];
export interface HabitPreset {
  name: string;
  category: HabitCategory;
  days: number[];
}
/** Mon-first, as a coach reads a week. 0 = Sunday, matching the server. */
export const WEEKDAY_ORDER: readonly number[] = [1, 2, 3, 4, 5, 6, 0];
export const WEEKDAY_LABELS: Record<number, string> = {
  0: "Sun",
  1: "Mon",
  2: "Tue",
  3: "Wed",
  4: "Thu",
  5: "Fri",
  6: "Sat",
};
export const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];

export interface Habit {
  id: string;
  coachId: string;
  clientId: string;
  name: string;
  /** false = archived (hidden from the grid, history kept) */
  active: boolean;
  createdAt: string;
  /** Inspo C3: the weekdays this habit is expected on. All seven = every day. */
  days: number[];
  /** "Every day", "Weekdays", "Mon, Wed, Fri" - the server's own wording. */
  recurrence: string;
  /** Is it expected today? A habit not due today is not a miss. */
  scheduledToday: boolean;
  /** Which of `HabitWeek.days` it was expected on, same order. */
  weekScheduled: boolean[];
  /** Done flags for `HabitWeek.days`, same order. */
  week: boolean[];
  currentStreak: number;
  bestStreak: number;
}
/** The this-week grid: `days` are the last 7 dates (oldest first, ending `date`), one row per active habit. */
export type HabitWeek = { date: DateString; days: DateString[]; habits: Habit[] };
/** What add / rename / archive return: the habit row without the week data. */
export type HabitRecord = Omit<Habit, "week" | "currentStreak" | "bestStreak">;
export type HabitUpdate = Partial<Pick<HabitRecord, "name" | "active">>;
export type HabitTick = { habitId: string; date: DateString; done: boolean };

/** One row of the Home "New check-ins" card: a progress log or a daily check-in (Prompt 53). */
export type RecentCheckIn =
  | {
      kind: "daily";
      id: string;
      clientId: string;
      clientName: string;
      createdAt: string;
      date: DateString;
      energy: number | null;
      mood: number | null;
      sleepHours: number | null;
      waterLiters: number | null;
      steps: number | null;
      foodNote: string;
    }
  | {
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
export type AtRiskReason = { rule: "adherence" | "inactive" | "weight" | "sleep"; text: string };
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

/** One thing waiting for the coach in the review queue (Prompt 52). Decided items are kept as history. */
export const REVIEW_STATUSES = ["Pending", "Approved", "Dismissed"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];
export type ReviewItem = {
  id: string;
  clientId: string;
  clientName: string;
  /** "suggestion" = an AI plan the coach parked; "checkin" = a new progress log to look at. */
  kind: "suggestion" | "checkin";
  status: ReviewStatus;
  title: string;
  summary: string;
  type: AssignmentType | null;
  details: string;
  reasoning: string;
  assignmentId: string | null;
  createdAt: string;
  decidedAt: string | null;
};
export type ReviewQueue = { pendingCount: number; items: ReviewItem[] };
/** Body for parking an AI suggestion. `type` is required when kind is "suggestion". */
export type NewReviewItem = {
  clientId: string;
  kind?: "suggestion" | "checkin";
  title: string;
  summary?: string;
  type?: AssignmentType | null;
  details?: string;
  reasoning?: string;
  sourceId?: string | null;
};

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
  /** Prompt 68: the currency of plan prices and payments. */
  currency?: Currency;
  /** The coach's weight unit across the dashboard (Nov 2026). Stored weights are always kg. */
  units?: "kg" | "lb";
  /** ISO-3166 alpha-2, or null. Sets the currency default and later the payment method. */
  country?: string | null;
  /** Inspo C8: sent to a new client as their first message. Empty = send nothing. */
  welcomeMessage?: string;
  /** Inspo C8: the form a new client should be taken through, or null. */
  intakeFormId?: string | null;
}
export interface RegisterInput {
  name: string;
  email: string;
  password: string;
  units?: "kg" | "lb";
  country?: string;
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

const EVERY = EVERY_DAY;
const WEEKDAYS = [1, 2, 3, 4, 5];

/** Inspo C3: must match server/src/habitPresets.ts exactly (drift-tested). */
export const HABIT_PRESETS: readonly HabitPreset[] = [
  // Nutrition
  { name: "Drink 3 litres of water", category: "Nutrition", days: EVERY },
  { name: "Eat protein with every meal", category: "Nutrition", days: EVERY },
  { name: "Five portions of vegetables", category: "Nutrition", days: EVERY },
  { name: "No sugary drinks", category: "Nutrition", days: EVERY },
  { name: "Log every meal", category: "Nutrition", days: EVERY },
  { name: "Cook dinner at home", category: "Nutrition", days: WEEKDAYS },
  { name: "No late-night snacking", category: "Nutrition", days: EVERY },
  { name: "Eat breakfast within an hour of waking", category: "Nutrition", days: EVERY },
  // Movement
  { name: "10,000 steps", category: "Movement", days: EVERY },
  { name: "Train as planned", category: "Movement", days: [1, 3, 5] },
  { name: "Ten minutes of stretching", category: "Movement", days: EVERY },
  { name: "Take the stairs", category: "Movement", days: WEEKDAYS },
  { name: "A twenty minute walk after dinner", category: "Movement", days: EVERY },
  { name: "Stand up every hour", category: "Movement", days: WEEKDAYS },
  { name: "Warm up before training", category: "Movement", days: [1, 3, 5] },
  // Sleep and recovery
  { name: "Seven hours of sleep", category: "Sleep and recovery", days: EVERY },
  { name: "In bed by 11pm", category: "Sleep and recovery", days: EVERY },
  { name: "No screens an hour before bed", category: "Sleep and recovery", days: EVERY },
  { name: "Wake at the same time", category: "Sleep and recovery", days: EVERY },
  { name: "A rest day, properly", category: "Sleep and recovery", days: [0] },
  // Mind
  { name: "Ten minutes of meditation", category: "Mind", days: EVERY },
  { name: "Write down three things that went well", category: "Mind", days: EVERY },
  { name: "Ten minutes outside in daylight", category: "Mind", days: EVERY },
  { name: "No phone for the first thirty minutes", category: "Mind", days: EVERY },
  { name: "Read for fifteen minutes", category: "Mind", days: EVERY },
  // Lifestyle
  { name: "Weigh in", category: "Lifestyle", days: [1] },
  { name: "Take progress photos", category: "Lifestyle", days: [0] },
  { name: "Plan tomorrow the night before", category: "Lifestyle", days: EVERY },
  { name: "Message your coach", category: "Lifestyle", days: [0] },
  { name: "No alcohol", category: "Lifestyle", days: EVERY },
  { name: "Pack a gym bag the night before", category: "Lifestyle", days: [0, 2, 4] },
];
