// Small typed fetch wrapper for the Repsy API.
// Everything except the client list itself is scoped to ONE client (clientId is
// required), so a view can never load mixed data from two clients.
// Server endpoints arrive in later prompts; until then calls fail with a clear
// ApiError ("Endpoint not available yet: ...").

import type {
  Assignment,
  AssignmentStatus,
  ChatMessage,
  Client,
  NewAssignment,
  NewClient,
  NewProgressLog,
  ProgressLog,
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
/** Sends the coach's question; returns the saved coach message and the AI reply. */
export const askAI = (clientId: string, question: string) =>
  request<{ question: ChatMessage; reply: ChatMessage }>("POST", `/clients/${enc(clientId)}/chat`, { question });
/** Asks the AI to create plans with reasoning; returns the new assignments. */
export const autoAssign = (clientId: string) =>
  request<Assignment[]>("POST", `/clients/${enc(clientId)}/auto-assign`);

// ----- Progress (per client) -----
export const listProgress = (clientId: string) =>
  request<ProgressLog[]>("GET", `/clients/${enc(clientId)}/progress`);
export const addProgressLog = (clientId: string, input: NewProgressLog) =>
  request<ProgressLog>("POST", `/clients/${enc(clientId)}/progress`, input);
export const deleteProgressLog = (clientId: string, logId: string) =>
  request<void>("DELETE", `/clients/${enc(clientId)}/progress/${enc(logId)}`);

// ----- Demo data -----
/** Creates demo clients with assignments and progress; returns the created clients. */
export const seedDemo = () => request<Client[]>("POST", "/seed/demo");
/** Creates a demo client with six months of progress history; returns that client. */
export const seedSixMonthDemo = () => request<Client>("POST", "/seed/six-month-demo");

// ----- React Query keys -----
// Per-client data is always keyed by clientId so caches never mix clients.
export const queryKeys = {
  clients: ["clients"] as const,
  assignments: (clientId: string) => ["clients", clientId, "assignments"] as const,
  chat: (clientId: string) => ["clients", clientId, "chat"] as const,
  progress: (clientId: string) => ["clients", clientId, "progress"] as const,
};
