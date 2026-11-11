// Small typed fetch wrapper for the Repsy API.
// Everything except the client list itself is scoped to ONE client (clientId is
// required), so a view can never load mixed data from two clients.
// Server endpoints arrive in later prompts; until then calls fail with a clear
// ApiError ("Endpoint not available yet: ...").

import type {
  Assignment,
  AssignmentStatus,
  AssignmentType,
  AtRiskClients,
  AutoAssignInput,
  ChangePasswordInput,
  ChatMessage,
  Client,
  ClientAccess,
  ClientAccount,
  Coach,
  DailyCheckIn,
  HabitRecord,
  HabitTick,
  HabitUpdate,
  HabitWeek,
  InviteResult,
  Lead,
  LoginInput,
  MacroInput,
  MacroResult,
  Meal,
  Measurement,
  MessageThread,
  NewAssignment,
  NewClient,
  NewDailyCheckIn,
  NewLead,
  NewMeal,
  NewMeasurement,
  NewProgressLog,
  NewReviewItem,
  NewWorkoutTemplate,
  ProgressLog,
  RecentCheckIns,
  RegisterInput,
  ResetPasswordInput,
  ReviewItem,
  ReviewQueue,
  ThreadMessage,
  ThreadSummary,
  TodayTasks,
  WeeklySummaryResponse,
  WorkoutTemplate,
} from "./types";

export type ApiErrorKind = "endpoint_missing" | "network" | "http";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly kind: ApiErrorKind,
    public readonly status: number | null,
    public readonly endpoint: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

async function request<T>(method: Method, path: string, body?: unknown): Promise<T> {
  const endpoint = `${method} /api${path}`;
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(`Can't reach the server (${endpoint}).`, "network", null, endpoint);
  }

  const isJson = res.headers.get("content-type")?.includes("application/json") ?? false;
  const data: unknown = isJson ? await res.json().catch(() => null) : null;

  if (!res.ok) {
    // The server answers unknown /api routes with 404 {"error":"Not found"}; a 404 that is
    // not JSON (e.g. an HTML page) also means the route doesn't exist.
    const serverMessage =
      data && typeof data === "object" && "error" in data ? String((data as { error: unknown }).error) : null;
    if (res.status === 404 && (!isJson || serverMessage === "Not found")) {
      throw new ApiError(`Endpoint not available yet: ${endpoint}`, "endpoint_missing", 404, endpoint);
    }
    throw new ApiError(
      serverMessage ?? `Request failed: ${endpoint} (HTTP ${res.status})`,
      "http",
      res.status,
      endpoint,
    );
  }

  if (res.status === 204) return undefined as T;
  if (!isJson) {
    // A 200 HTML page here means the route isn't an API route yet.
    throw new ApiError(`Endpoint not available yet: ${endpoint}`, "endpoint_missing", res.status, endpoint);
  }
  return data as T;
}

const enc = encodeURIComponent;

// ----- Clients -----
export const listClients = () => request<Client[]>("GET", "/clients");
export const createClient = (input: NewClient) => request<Client>("POST", "/clients", input);
export const getClient = (clientId: string) => request<Client>("GET", `/clients/${enc(clientId)}`);
export const deleteClient = (clientId: string) => request<void>("DELETE", `/clients/${enc(clientId)}`);

// ----- Assignments (per client) -----
export const listAssignments = (clientId: string) =>
  request<Assignment[]>("GET", `/clients/${enc(clientId)}/assignments`);
export const createAssignment = (clientId: string, input: NewAssignment) =>
  request<Assignment>("POST", `/clients/${enc(clientId)}/assignments`, input);
export const updateAssignmentStatus = (clientId: string, assignmentId: string, status: AssignmentStatus) =>
  request<Assignment>("PATCH", `/clients/${enc(clientId)}/assignments/${enc(assignmentId)}`, { status });
export const deleteAssignment = (clientId: string, assignmentId: string) =>
  request<void>("DELETE", `/clients/${enc(clientId)}/assignments/${enc(assignmentId)}`);

// ----- AI chat (per client) -----
export const listChat = (clientId: string) => request<ChatMessage[]>("GET", `/clients/${enc(clientId)}/chat`);
/** A plan the AI suggests with its answer (not saved as an assignment). */
export type AiSuggestion = { type: AssignmentType; title: string; details: string; reasoning: string };
/** Sends the coach's question; returns the saved coach message, the AI reply and an optional suggestion. */
export const askAI = (clientId: string, question: string) =>
  request<{ question: ChatMessage; reply: ChatMessage; suggestion: AiSuggestion | null }>(
    "POST",
    `/clients/${enc(clientId)}/chat`,
    { question },
  );
/** Asks the AI for one complete plan of this type, SAVES it (source ai) and returns [the new assignment]. */
export const autoAssign = (clientId: string, input: AutoAssignInput) =>
  request<Assignment[]>("POST", `/clients/${enc(clientId)}/auto-assign`, input);

// ----- Progress (per client) -----
export const listProgress = (clientId: string) =>
  request<ProgressLog[]>("GET", `/clients/${enc(clientId)}/progress`);
export const addProgressLog = (clientId: string, input: NewProgressLog) =>
  request<ProgressLog>("POST", `/clients/${enc(clientId)}/progress`, input);
export const deleteProgressLog = (clientId: string, logId: string) =>
  request<void>("DELETE", `/clients/${enc(clientId)}/progress/${enc(logId)}`);

// ----- Daily check-ins (per client, Prompt 53) -----
/** That client's daily check-ins, newest first (default the last 14 days). */
export const listDailyCheckIns = (clientId: string, days = 14) =>
  request<DailyCheckIn[]>("GET", `/clients/${enc(clientId)}/checkins?days=${days}`);
/** Saves one day. Saving the same date again updates that day instead of adding a second row. */
export const saveDailyCheckIn = (clientId: string, input: NewDailyCheckIn) =>
  request<DailyCheckIn>("POST", `/clients/${enc(clientId)}/checkins`, input);

// ----- Habit tracker (per client, Prompt 54) -----
/** The this-week grid: the last 7 days ending `date` (the coach's local "YYYY-MM-DD"), active habits only. */
export const getHabitWeek = (clientId: string, date: string) =>
  request<HabitWeek>("GET", `/clients/${enc(clientId)}/habits?date=${enc(date)}`);
/** Adds a habit. 400 when the client already has 8 active ones. */
export const addHabit = (clientId: string, name: string) =>
  request<HabitRecord>("POST", `/clients/${enc(clientId)}/habits`, { name });
/** Renames and / or archives (`active: false`) a habit. Archiving keeps its history. */
export const updateHabit = (clientId: string, habitId: string, input: HabitUpdate) =>
  request<HabitRecord>("PATCH", `/clients/${enc(clientId)}/habits/${enc(habitId)}`, input);
/** Ticks one day of one habit done / not done. */
export const setHabitDone = (clientId: string, habitId: string, date: string, done: boolean) =>
  request<HabitTick>("PUT", `/clients/${enc(clientId)}/habits/${enc(habitId)}/logs/${enc(date)}`, { done });

// ----- Body measurements (per client, Prompt 56) -----
/** That client's measurements, newest first. */
export const listMeasurements = (clientId: string) =>
  request<Measurement[]>("GET", `/clients/${enc(clientId)}/measurements`);
/** Adds one set of measurements (only `date` is required). */
export const addMeasurement = (clientId: string, input: NewMeasurement) =>
  request<Measurement>("POST", `/clients/${enc(clientId)}/measurements`, input);
export const deleteMeasurement = (clientId: string, measurementId: string) =>
  request<void>("DELETE", `/clients/${enc(clientId)}/measurements/${enc(measurementId)}`);

// ----- Library: workout templates (per coach, Prompt 58) -----
/** The signed-in coach's templates, A-Z by name. */
export const listTemplates = () => request<WorkoutTemplate[]>("GET", "/templates");
export const createTemplate = (input: NewWorkoutTemplate) => request<WorkoutTemplate>("POST", "/templates", input);
/** Replaces name, focus, exercises and notes. */
export const updateTemplate = (templateId: string, input: NewWorkoutTemplate) =>
  request<WorkoutTemplate>("PUT", `/templates/${enc(templateId)}`, input);
export const deleteTemplate = (templateId: string) => request<void>("DELETE", `/templates/${enc(templateId)}`);

// ----- Library: meals (per coach, Prompt 60) -----
/** The signed-in coach's meals, A-Z by name. */
export const listMeals = () => request<Meal[]>("GET", "/meals");
export const createMeal = (input: NewMeal) => request<Meal>("POST", "/meals", input);
/** Replaces every field. */
export const updateMeal = (mealId: string, input: NewMeal) => request<Meal>("PUT", `/meals/${enc(mealId)}`, input);
export const deleteMeal = (mealId: string) => request<void>("DELETE", `/meals/${enc(mealId)}`);

// ----- Library: macro calculator (stateless, Prompt 61) -----
/** Starting-estimate calories and macros. Rejects with ApiError 400 for bad input or an age under 18. */
export const calculateMacros = (input: MacroInput) => request<MacroResult>("POST", "/macros", input);

// ----- Client access (Prompt 65): the coach invites; the CLIENT signs in on /client/login -----
export const getClientAccess = (clientId: string) => request<ClientAccess>("GET", `/clients/${enc(clientId)}/invite`);
export const inviteClient = (clientId: string, email: string) =>
  request<InviteResult>("POST", `/clients/${enc(clientId)}/invite`, { email });
/** Client-side auth: separate routes and a separate cookie from the coach's /auth. */
export const clientSetPassword = (token: string, password: string) =>
  request<void>("POST", "/client-auth/set-password", { token, password });
export const clientLogin = (email: string, password: string) =>
  request<ClientAccount>("POST", "/client-auth/login", { email, password });
export const clientLogout = () => request<void>("POST", "/client-auth/logout");
export const getClientAccount = () => request<ClientAccount>("GET", "/client-auth/me");

// ----- Client messages (Prompt 63) - NOT the AI Coach chat above -----
/** Newest page of 50 (or the page before `before`), oldest -> newest. Opening marks client messages read. */
export const getMessageThread = (clientId: string, before?: string) =>
  request<MessageThread>(
    "GET",
    `/clients/${enc(clientId)}/messages${before ? `?before=${encodeURIComponent(before)}` : ""}`,
  );
export const sendMessage = (clientId: string, body: string) =>
  request<ThreadMessage>("POST", `/clients/${enc(clientId)}/messages`, { body });
/** The conversation list: latest message and unread count per client. Never marks anything read. */
export const listThreads = () => request<{ threads: ThreadSummary[] }>("GET", "/messages/threads");
/** Own messages only, within 15 minutes of sending. */
export const deleteMessage = (clientId: string, messageId: string) =>
  request<void>("DELETE", `/clients/${enc(clientId)}/messages/${enc(messageId)}`);

// ----- Home tab -----
/** Today's Tasks for the signed-in coach; `date` is the coach's local "YYYY-MM-DD". */
export const getTodayTasks = (date: string) => request<TodayTasks>("GET", `/tasks/today?date=${enc(date)}`);
/** Latest check-ins (last 48 hours, newest first, max 8) across the signed-in coach's clients. */
export const getRecentCheckIns = () => request<RecentCheckIns>("GET", "/checkins/recent");
/** Clients that need attention (rules only, worst first); `date` is the coach's local "YYYY-MM-DD". */
export const getAtRiskClients = (date: string) => request<AtRiskClients>("GET", `/at-risk?date=${enc(date)}`);
/** This week's saved AI summary (`summary` is null when none has been generated yet). */
export const getWeeklySummary = (date: string) =>
  request<WeeklySummaryResponse>("GET", `/weekly-summary?date=${enc(date)}`);
/** Generates and saves this week's summary. Rejects with ApiError 409 unless `replace` is true. */
export const generateWeeklySummary = (date: string, replace = false) =>
  request<WeeklySummaryResponse>("POST", "/weekly-summary", { date, replace });
/** The review queue: `status` "pending" (default) or "decided" (history). */
export const getReviewQueue = (status: "pending" | "decided" = "pending") =>
  request<ReviewQueue>("GET", `/review-queue?status=${status}`);
/** Parks an AI suggestion for later instead of assigning it now. */
export const addReviewItem = (input: NewReviewItem) => request<ReviewItem>("POST", "/review-queue", input);
/** Approves one item: a suggestion becomes a real assignment; a check-in is just marked read. */
export const approveReviewItem = (itemId: string, date: string) =>
  request<{ item: ReviewItem; assignment: Assignment | null }>("POST", `/review-queue/${enc(itemId)}/approve`, { date });
/** Dismisses one item. It leaves the queue but stays in the client's history. */
export const dismissReviewItem = (itemId: string) =>
  request<{ item: ReviewItem; assignment: null }>("POST", `/review-queue/${enc(itemId)}/dismiss`);

// ----- Demo data -----
/** Creates demo clients with assignments and progress; returns the created clients. */
export const seedDemo = () => request<Client[]>("POST", "/seed/demo");
/** Adds the 10 six-month demo clients (26 weekly check-ins each), skipping names that already
 *  exist; returns the clients it created ([] when all 10 were already there). */
export const seedSixMonthDemo = () => request<Client[]>("POST", "/seed/six-month-demo");

// ----- Landing page -----
/** Saves a "Start free" sign-up. 409 "You are already on the list." for a known email. */
export const createLead = (input: NewLead) => request<Lead>("POST", "/leads", input);

// ----- Coach accounts (session cookie is set / cleared by the server) -----
export const register = (input: RegisterInput) => request<Coach>("POST", "/auth/register", input);
export const login = (input: LoginInput) => request<Coach>("POST", "/auth/login", input);
export const logout = () => request<void>("POST", "/auth/logout");
/** The signed-in coach; rejects with ApiError status 401 when signed out. */
export const getMe = () => request<Coach>("GET", "/auth/me");
/** Asks for a reset link. Always answers the same message, whether or not the email has an account. */
export const forgotPassword = (email: string) => request<{ message: string }>("POST", "/auth/forgot", { email });
/** Spends a reset link's token and sets a new password (204). Nobody is signed in by it. */
export const resetPassword = (input: ResetPasswordInput) => request<void>("POST", "/auth/reset", input);
/** Account page: change the display name (the email can't be changed). */
export const updateName = (name: string) => request<Coach>("PATCH", "/auth/me", { name });
/** Account page: needs the current password (204); other sessions are signed out, this one stays. */
export const changePassword = (input: ChangePasswordInput) => request<void>("POST", "/auth/change-password", input);

// ----- React Query keys -----
// Per-client data is always keyed by clientId so caches never mix clients.
export const queryKeys = {
  me: ["auth", "me"] as const,
  clients: ["clients"] as const,
  assignments: (clientId: string) => ["clients", clientId, "assignments"] as const,
  chat: (clientId: string) => ["clients", clientId, "chat"] as const,
  progress: (clientId: string) => ["clients", clientId, "progress"] as const,
  dailyCheckIns: (clientId: string) => ["clients", clientId, "checkins"] as const,
  messages: (clientId: string) => ["clients", clientId, "messages"] as const,
  threads: ["messages", "threads"] as const,
  clientAccess: (clientId: string) => ["clients", clientId, "access"] as const,
  clientAccount: ["client-account", "me"] as const,
  habits: (clientId: string) => ["clients", clientId, "habits"] as const,
  templates: ["templates"] as const,
  meals: ["meals"] as const,
  measurements: (clientId: string) => ["clients", clientId, "measurements"] as const,
  todayTasks: (date: string) => ["tasks", "today", date] as const,
  recentCheckIns: ["checkins", "recent"] as const,
  atRisk: (date: string) => ["at-risk", date] as const,
  weeklySummary: (date: string) => ["weekly-summary", date] as const,
  reviewQueue: (status: "pending" | "decided") => ["review-queue", status] as const,
};
