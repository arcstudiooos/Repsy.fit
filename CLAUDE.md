# Repsy Coach — rules for every prompt

Coach dashboard: pick a client, ask AI, auto assign plans with reasoning, or plan manually.
Progress in charts. Built one feature at a time, across many separate prompts.

## The 6 rules

1. **Do ONLY what the current prompt asks.** No extra features, no refactoring unrelated code,
   no renaming things the user did not name.
2. **The stack is fixed.** Do not add other frameworks or services.
   - Frontend (`client/`): React + Vite + TypeScript, Tailwind CSS, Recharts (progress charts),
     React Query (loading / saving data)
   - Backend (`server/`): Node.js + Express (TypeScript), REST API, zod for validation
   - Database: PostgreSQL on Render, Prisma (`server/prisma/`). Tables: clients, assignments,
     chat_messages, progress_logs
   - AI: AI API via key, read from env vars `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL`
   - Hosting: GitHub + Render (1 Web Service serving frontend + backend, 1 PostgreSQL).
     Render env vars: `DATABASE_URL`, `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL`, `PORT`
3. **After each prompt:** run the build, run any tests, and end the reply with
   (a) files created or changed, (b) what was tested and the result, (c) anything that could
   NOT be done.
4. **Never put API keys or secrets in code.** Read them from environment variables. Never
   commit `.env`.
5. **Never delete a working feature to make a new one fit.** If a prompt conflicts with
   existing code, stop and tell the user instead of guessing.
6. **Keep the design rules below.** No new colours. No side / vertical menu — navigation is
   horizontal, Chrome-style tabs at the top only.

Commits: one commit per prompt, message as given in the prompt (e.g. "Prompt N: …").

## Design system

Source of truth: `client/src/theme.css` (CSS variables) mapped to Tailwind in
`client/src/index.css`. Tailwind's default colour palette is disabled — only the colours
below exist. Use the values exactly; do not invent colours.

### Colours

| Token | Light | Dark (prefers-color-scheme) | Use | Tailwind |
| --- | --- | --- | --- | --- |
| `--bg` | `#FAF7F2` | `#141414` | page (warm cream) | `bg-bg` |
| `--surface` | `#FFFFFF` | `#1E1E1E` | cards | `bg-surface` |
| `--surface2` | `#F1EDE6` | `#262626` | inputs, soft areas | `bg-surface2` |
| `--text` | `#1A1A1A` | `#F5F1EB` | main text | `text-text` |
| `--dim` | `#6B6560` | `#A8A29E` | secondary text | `text-dim` |
| `--border` | `#E6E0D6` | `#333333` | borders | `border-border` |
| `--accent` | `#FF4A1F` | same | brand orange-red | `bg-accent` / `text-accent` |
| `--accent2` | `#0E7C6B` | same | teal | `bg-accent2` / `text-accent2` |
| `--amber` | `#D97706` | same | icons and large labels only | `text-amber` |
| `--tab-inactive` | `#E9E3D8` | `#262626` | inactive tabs | `bg-tab-inactive` |
| `--header` | `#141414` | `#1E1E1E` | header strip background | `bg-header` |
| `--header-border` | none | `#333333` | header strip 1px bottom border (dark mode only) | `.header-strip` |
| `--white` | `#FFFFFF` | same | white | `bg-white` / `text-white` |
| `--on-accent` | `#141414` | same | text on orange buttons | `text-on-accent` |
| `--amber-text` | `#92400E` | `#D97706` | small amber text | `text-amber-text` |

### Contrast rules

- **Orange buttons:** text is `#141414`, bold — never white on orange. Use the `btn-primary`
  class.
- **Amber:** small amber text uses `#92400E` (`text-amber-text`). `#D97706` is only for icons
  and large labels. (In dark mode `text-amber-text` is `#D97706`, because `#92400E` is
  unreadable on dark backgrounds.)

### Assignment type colours (everywhere in the app)

| Type | Colour | Tailwind |
| --- | --- | --- |
| Workout | `#FF4A1F` | `bg-type-workout` / `text-type-workout` |
| Nutrition | `#0E7C6B` | `bg-type-nutrition` / `text-type-nutrition` |
| Habit | `#D97706` | `bg-type-habit` / `text-type-habit` |
| Recovery | `#7C5CFC` | `bg-type-recovery` / `text-type-recovery` |

### Fonts

- Headings: **"Barlow Condensed"**, weight 600/700, UPPERCASE (`font-heading`; `h1`–`h6` get it
  by default).
- Body: Inter, falling back to system-ui (`font-body`; set on `body`).

### Cards and buttons

- Cards: white (`--surface`) with a 1px `var(--border)` border, radius **14px**, no heavy
  shadows. Use the `card` class (radius alone: `rounded-card`).
- Primary button: `btn-primary` (orange background, `#141414` bold text).

### Layout

- **No vertical / side menu.** Navigation is horizontal, Chrome-style tabs across the top.

## Data notes

- Every Client, Assignment and ProgressLog has `coachId`. Until login exists, all records use
  the placeholder coach `"default-coach"` (the column default).

## API contract

**Source of truth: `client/src/api.ts`** (types in `client/src/types.ts`). Server endpoints
must match this contract exactly — same methods, paths, bodies and return shapes. Do not add,
rename or reshape routes without updating `api.ts` in the same prompt.

### Conventions

- Base path `/api`. Request and response bodies are JSON (`Content-Type: application/json`).
- Ids are strings (cuid). Dates: `createdAt` is an ISO timestamp string; `date` is `"YYYY-MM-DD"`.
- **Every per-client route is scoped to one client.** The server must check that the
  assignment / progress log in the path belongs to `:clientId` and never return or change
  another client's data.
- **`coachId` is never sent by the client.** The server sets it (currently `"default-coach"`).
- Fields omitted from create bodies get the database defaults (see Prisma schema).
- Any 2xx means success. A route that returns nothing replies **204 No Content**
  (`api.ts` returns `undefined` for 204).
- Response objects are the full records as defined in `types.ts` (`Client`, `Assignment`,
  `ChatMessage`, `ProgressLog`), including `id`, `coachId` (except `ChatMessage`) and
  `createdAt`.

### Error shape

Every error response is JSON:

```json
{ "error": "Plain-words message" }
```

with a matching HTTP status (400 invalid input, 404 not found, 500 server error, …).

- **Reserved message:** `404 {"error":"Not found"}` means *the route does not exist* — the
  server's catch-all for unknown `/api` routes sends exactly this, and `api.ts` turns it into
  "Endpoint not available yet: METHOD /api/…". **A route that exists but cannot find a record
  must use a different message**, e.g. `404 {"error":"Client not found"}`, otherwise the UI
  will wrongly report the endpoint as missing.
- In the client, every failure becomes an `ApiError` with `kind`:
  `"endpoint_missing"` (404 `"Not found"`, or a non-JSON reply), `"network"` (server
  unreachable) or `"http"` (any other error — `message` is the server's `error` text).

### Endpoints

| `api.ts` function | Method | Path | Accepts (JSON body) | Returns |
| --- | --- | --- | --- | --- |
| *(health)* | GET | `/api/health` | — | `{ "ok": true }` *(exists)* |
| `listClients()` | GET | `/api/clients` | — | `Client[]` (oldest first) |
| `createClient(input)` | POST | `/api/clients` | `NewClient` | `Client` (201) |
| `getClient(clientId)` | GET | `/api/clients/:clientId` | — | `Client` |
| `deleteClient(clientId)` | DELETE | `/api/clients/:clientId` | — | 204, no body (also deletes the client's assignments, chat messages and progress logs) |
| `listAssignments(clientId)` | GET | `/api/clients/:clientId/assignments` | — | `Assignment[]` |
| `createAssignment(clientId, input)` | POST | `/api/clients/:clientId/assignments` | `NewAssignment` | `Assignment` |
| `updateAssignmentStatus(clientId, assignmentId, status)` | PATCH | `/api/clients/:clientId/assignments/:assignmentId` | `{ "status": AssignmentStatus }` | `Assignment` |
| `deleteAssignment(clientId, assignmentId)` | DELETE | `/api/clients/:clientId/assignments/:assignmentId` | — | 204, no body |
| `listChat(clientId)` | GET | `/api/clients/:clientId/chat` | — | `ChatMessage[]` |
| `askAI(clientId, question)` | POST | `/api/clients/:clientId/chat` | `{ "question": string }` | `{ "question": ChatMessage, "reply": ChatMessage, "suggestion": AiSuggestion \| null }` (201) |
| `autoAssign(clientId, input)` | POST | `/api/clients/:clientId/auto-assign` | `AutoAssignInput` (`{ "type": AssignmentType, "date"?: "YYYY-MM-DD" }`) | `Assignment[]` (201; the ONE new saved assignment) |
| `listProgress(clientId)` | GET | `/api/clients/:clientId/progress` | — | `ProgressLog[]` |
| `addProgressLog(clientId, input)` | POST | `/api/clients/:clientId/progress` | `NewProgressLog` | `ProgressLog` |
| `deleteProgressLog(clientId, logId)` | DELETE | `/api/clients/:clientId/progress/:logId` | — | 204, no body |
| `seedDemo()` | POST | `/api/seed/demo` | — *(no body)* | `Client[]` (the created demo clients) |
| `seedSixMonthDemo()` | POST | `/api/seed/six-month-demo` | — *(no body)* | `Client` (the client with six months of history) |

`askAI`: `question` is the saved coach message (`role: "coach"`), `reply` is the saved AI
message (`role: "ai"`). Both are stored in `chat_messages` for that client. `suggestion` is
`null` or `{ type, title, details, reasoning }` (`AiSuggestion` in `api.ts`; `type` ∈ Workout /
Nutrition / Habit / Recovery) - it is not saved.
If the AI provider call or its JSON fails, the server logs a safe reason and saves a
client-specific fallback reply with `suggestion: null` (still 201).

### Body types (from `types.ts`)

| Type | Required | Optional |
| --- | --- | --- |
| `NewClient` | `name` | `goal`, `age`, `weightKg`, `heightCm`, `level`, `focus`, `notes` |
| `NewAssignment` | `type`, `title`, `details` | `reasoning` (default ""), `source` (default manual), `status` (default Active), `date` (default today, UTC) |
| `NewProgressLog` | `date` | `weightKg`, `adherence`, `workoutsDone`, `note` |

Allowed values: `goal` is free text, 1–100 characters (default General fitness); the form
suggests Fat loss / Fat loss + strength / Muscle gain / Marathon prep + conditioning /
Athletic performance / General fitness / Rehab & mobility (`GOALS` in `types.ts`).
`level` ∈ Beginner / Intermediate / Advanced; `type` ∈ Workout / Nutrition /
Habit / Recovery; `source` ∈ ai / manual; `status` ∈ Active / Done / Paused; chat `role` ∈
coach / ai; `adherence` 0–100. The server validates these with zod and replies
`400 {"error": "..."}` on bad input.

Client limits (server): `name` 1–100 characters (trimmed); `age` whole number 1–120;
`weightKg` above 0, up to 500; `heightCm` above 0, up to 300; `focus` up to 500 characters;
`notes` (notes for AI) up to 2000 characters. Unknown body fields are ignored.

### Decided when built

- `GET /api/clients` lists **oldest first** (`createdAt`, then `id`), so the first client
  added is the default selected client. Other list endpoints: decide when built.
- `GET /api/clients/:clientId/chat` lists messages **oldest first** (`createdAt`, then `id`);
  unknown client -> `404 {"error":"Client not found"}`.
- `GET /api/clients/:clientId/assignments` lists **newest first** (`createdAt`, then `id`);
  unknown client -> `404 {"error":"Client not found"}`. `title` and `details` at least 1
  character (trimmed); `date` must be a real `YYYY-MM-DD` date. PATCH changes `status` only;
  an assignment that is not this client's (or does not exist) -> `404 {"error":"Assignment not found"}`.
- **Nothing from the AI is auto-saved.** A suggestion becomes an assignment only when the coach
  taps "Assign to client" (`source: "ai"`, today's local date); "Dismiss" saves nothing.
  The one exception is auto-assign below, which the coach requests explicitly per type.
- `POST /api/clients/:clientId/auto-assign` (body `{ type, date? }`, `date` default today UTC; the UI
  sends today's local date): asks the AI for ONE complete plan of that type with the same client
  context as chat, SAVES it (`source: "ai"`, status Active) and replies 201 `[assignment]`. If the
  AI is not configured or its call / JSON fails it saves nothing and replies
  `502 {"error":"The AI couldn't create a plan right now. Nothing was saved - please try again."}`.
  No chat messages are written.
- **Chat messages have no public write route.** They are saved only server-side with
  `saveMessage(clientId, role, content)` (`server/src/routes/chat.ts`), which the ask endpoint
  (`askAI`, `POST /api/clients/:clientId/chat`) uses - so fake chat history can't be created.
- Creates reply **201 Created** with the full record.
- A client that does not exist, or belongs to another coach, returns
  `404 {"error":"Client not found"}`.
- Malformed JSON bodies return `400 {"error":"Request body is not valid JSON."}`; unexpected
  server errors return `500 {"error":"Something went wrong on the server."}` (never a stack trace).

### Not fixed by `api.ts` (decide when the endpoint is built)

- Sort order of the other list endpoints.

### Differences from the prototype

The approved prototype and the 36-prompt document were not available when this contract
was written, so they have not been compared. If a difference is found later, follow `api.ts`
and record it here.

- Prompt 11 asked for "get one client", which was not in the original contract:
  `getClient()` / `GET /api/clients/:clientId` was added to `api.ts` and here.
- Prompt 13: the prototype's goal list allows free text too, so the server accepts any goal
  text (Prompt 11 had limited it to the 7 goals). Decided by the user.
- Chat storage prompt proposed `GET /api/chat?clientId=ID` returning `{ messages: [...] }`. The
  user chose to keep this contract (`GET /api/clients/:clientId/chat` -> `ChatMessage[]`).
- Prompt 17 asked for `POST /api/assignments` (body `clientId`, returns `{ id }`) and
  `GET /api/assignments?clientId=`. Built on the existing `/api/clients/:clientId/assignments`
  routes instead (201 full `Assignment`; list newest first). `date` became optional (default today).
- Prompt 18 asked for `POST /api/ai/auto-assign` (body `{ clientId, type }`, returns the saved plan).
  Built on the existing `POST /api/clients/:clientId/auto-assign` with body `{ type, date? }`,
  returning `Assignment[]` holding the one saved assignment.
- Prompt 24 asked for `PATCH /api/assignments/:id/status` and `DELETE /api/assignments/:id`
  returning `{ ok: true }`. Built on the existing `PATCH|DELETE /api/clients/:clientId/assignments/:assignmentId`
  (PATCH returns the full `Assignment`; DELETE 204). Unknown id -> `404 {"error":"Assignment not found"}`.
- Prompt 23's example lines arrived as plain "-" and "x"; built with the em dash, multiplication
  sign and middle dot it names: `1. Back Squat — 4 sets × 6 reps · Rest 120s`.
- Prompt 25 asked for `GET /api/progress?clientId=` (returns `{ logs: [...] }`), `POST /api/progress`
  (body `clientId`, returns `{ id }`) and `DELETE /api/progress/:id` (returns `{ ok: true }`). Built
  on the existing `/api/clients/:clientId/progress` routes: list oldest first (`date`, then
  `createdAt`, `id`), create 201 full `ProgressLog`, DELETE 204. Limits: `adherence` whole number
  0–100, `workoutsDone` whole number 0–14, `weightKg` above 0 up to 500, `date` a real
  `YYYY-MM-DD` date, `note` default "". Unknown log -> `404 {"error":"Progress log not found"}`.
- A later message proposed different shapes (`{ clients: [...] }` sorted A–Z, `{ id }` on
  create, `{ ok: true }` on delete). The user chose to keep this contract.
