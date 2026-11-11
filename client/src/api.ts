// Small typed fetch wrapper for the Repsy API.
// Everything except the client list itself is scoped to ONE client (clientId is
// required), so a view can never load mixed data from two clients.
// Server endpoints arrive in later prompts; until then calls fail with a clear
// ApiError ("Endpoint not available yet: ...").

import type {
  Assignment,
  AssignmentStatus,
  AssignmentType,
  AutoAssignInput,
  ChatMessage,
  ChangePasswordInput,
  Client,
  Coach,
  Lead,
  LoginInput,
  NewAssignment,
  NewClient,
  NewLead,
  NewProgressLog,
  ProgressLog,
  RegisterInput,
  ResetPasswordInput,
  TodayTasks,
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

type Method = "GET" | "POST" | "PATCH" | "DELETE";

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

// ----- Home tab -----
/** Today's Tasks for the signed-in coach; `date` is the coach's local "YYYY-MM-DD". */
export const getTodayTasks = (date: string) => request<TodayTasks>("GET", `/tasks/today?date=${enc(date)}`);

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
  todayTasks: (date: string) => ["tasks", "today", date] as const,
};
