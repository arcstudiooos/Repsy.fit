# Repsy Coach — rules for every prompt

Coach dashboard: pick a client, ask AI, auto assign plans with reasoning, or plan manually.
Progress in charts. Built one feature at a time, across many separate prompts.

## The 6 rules

1. **Do ONLY what the current prompt asks.** No extra features, no refactoring unrelated code,
   no renaming things the user did not name.
2. **The stack is fixed.** Do not add other frameworks or services.
   - Frontend (`client/`): React + Vite + TypeScript, Tailwind CSS, Recharts (progress charts),
     React Query (loading / saving data)
   - Landing page only (`client/src/landing/`, from Prompt 37): three, @react-three/fiber,
     @react-three/drei and gsap. They load lazily on the landing page and must never be imported
     by `/app` code (`client/scripts/check-budget.mjs` fails the build if they are).
   - Routes: `/` = public landing page, `/app` (and `/app/...`) = the coach dashboard.
   - Backend (`server/`): Node.js + Express (TypeScript), REST API, zod for validation
   - Database: PostgreSQL on Render, Prisma (`server/prisma/`). Tables: clients, assignments,
     chat_messages, progress_logs, leads (landing page sign-ups, Prompt 41)
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

Design A1, approved by the user in Nov 2026 for the whole product (landing page and `/app`).
All load from Google Fonts in `client/index.html`; no npm packages.

- Big headings (`h1`, `h2`, `font-heading`): **Instrument Serif**, weight 400 only (never
  bold), sentence case, slight negative tracking. Also used for big stat numbers.
- Small headings (`h3`–`h6`): Geist, weight 600.
- Body (`font-body`, set on `body`): **Geist**.
- Numbers, sets / reps / rest, kickers (`font-mono`): **Geist Mono**.
- Landing only, injected by `client/src/main.tsx` on the landing route: Caveat for small
  decorative pen notes (`--font-hand`), and Barlow Condensed for the classic 3D hero at
  `/?hero=3d`.
- **Landing colours:** the tokens above, plus tints and mixes of them made with `rgba()` /
  `color-mix()` (graph-paper lines from `--border`, paper tones mixed from `--amber` and
  `#141414`). No new hex colours. Rules in `client/src/landing/DESIGN.md`.

### Cards and buttons

- Cards: white (`--surface`) with a 1px `var(--border)` border, radius **14px**, no heavy
  shadows. Use the `card` class (radius alone: `rounded-card`).
- Primary button: `btn-primary` (orange background, `#141414` bold text).

### Layout

- **No vertical / side menu.** Navigation is horizontal, Chrome-style tabs across the top.

## Data notes

- **Workout templates (Prompt 58).** `WorkoutTemplate` = `{ id, coachId, name, focus, exercises, notes,
  createdAt }`; `exercises` is JSON in the Manual Planner's shape, in order: `[{ name, sets (1-10 whole),
  reps (text, 1-30 chars: "AMRAP" works), rest (whole seconds, 6-3600) }]`, 1 to 50 of them. `name` 1-100
  characters, `focus` up to 100, `notes` up to 2000. **Coach-level:** a template belongs to one coach, has no
  client, and is never shared between coaches (no marketplace); deleting the coach deletes their templates.
  Deleting a template never touches assignments already made from it. The 7th tab, **Library**
  (`client/src/tabs/LibraryTab.tsx`, lazy chunk), has no client strip and works with zero clients. It reuses the
  Planner's exercise search and sets / reps / rest rows (`ExercisePicker` in `ManualAssignmentForm.tsx`).
  "Assign to client" picks any of the coach's clients and a date (default today), then opens the Manual Planner for
  that client with the New assignment form pre-filled (Workout, title = template name, its exercises, its notes as
  extra notes, reasoning `From template: <name>`); **nothing is saved until the coach taps "Assign plan"**, and every
  field stays editable. The pre-fill is used once: coming back to the Planner later starts empty.

- **Body measurements (Prompt 56).** `Measurement` = `{ id, coachId, clientId, date ("YYYY-MM-DD"),
  waistCm, chestCm, armCm, hipCm, bodyFatPercent, note, createdAt }`; everything except `date` is
  optional (`null` / `""`). Ranges: each tape value above 0 and at most 300 cm, `bodyFatPercent` above 0
  and at most 75 (so never 3 digits), `note` up to 500 characters. Several rows may share a date. **Weight
  is not stored here:** the chart's "Weight (kg)" choice is read from `ProgressLog.weightKg` and is only
  offered when the client has at least one logged weight. **These field names are the export shape:**
  Prompt 70's CSV export reuses them exactly, so do not rename them. Coach-side in v2, a section of the
  Check-ins tab (`client/src/components/Measurements.tsx`). No photos, BMI or health judgments.

- **Habit tracker (Prompt 54).** `Habit` = `{ id, coachId, clientId, name, active, createdAt }` and
  `HabitLog` = `{ id, habitId, date ("YYYY-MM-DD"), done }`, unique per `(habitId, date)`. A client
  has at most **8 active habits**. Archive sets `active: false`: the habit and its logs are **never
  deleted** (history). The streak rules live in ONE server function, `habitStreaks(doneDates, today)`
  in `server/src/habits.ts`: a missed day breaks the streak; today not yet logged does NOT (the current
  streak then counts back from yesterday); best = longest run ever. Coach-side in v2, shown as a
  section of the Check-ins tab. **Progress "Plan completion" changed:** it used to be Done assignments /
  all assignments; it is now the average of that % and this week's habit % (done ticks / (active
  habits x 7 days), `habitCompletion` in `client/src/lib/progressStats.ts`). With only one of the two
  it is that one; with neither it stays "-". If the habit load fails the card falls back to assignments
  alone. No reminders, notifications or points (streak leaderboard is Prompt 71).

- **Daily check-ins (Prompt 53).** `DailyCheckIn` = `{ id, coachId, clientId, date ("YYYY-MM-DD"),
  energy 1-5, mood 1-5, sleepHours 0-16 (Prompt 55), recoveryScore 1-5 (Prompt 55), waterLiters,
  steps, foodNote, createdAt, updatedAt }`, unique per `(clientId, date)`. Saving a date that
  already exists **updates that row** (200) instead of adding a second one, and any field left out
  of the body is cleared. Coach-side in v2. Two knock-on changes promised by earlier prompts:
  `GET /api/checkins/recent` (Home "New check-ins") now merges daily check-ins with progress logs
  in one list, each row carrying `kind: "daily" | "progress"` and sorted newest first; and the AI
  Coach context includes the client's latest 7 daily check-ins, so an answer can mention recent
  energy, mood, water, steps or a food note.

- **Review queue (Prompt 52).** `ReviewItem` = `{ id, coachId, clientId, kind ("suggestion" |
  "checkin"), status ("Pending" | "Approved" | "Dismissed"), title, summary, type, details,
  reasoning, sourceId, assignmentId, createdAt, decidedAt }`. **A separate table was chosen over a
  status on Assignment / ProgressLog** because a parked suggestion is not an assignment yet (it
  must not appear in the Manual Planner or in client counts) and a flagged check-in must stay
  exactly as logged. Producers: the AI Coach "Review later" button parks a suggestion, and every
  new progress log is flagged (`kind: "checkin"`; a queue failure never fails the save).
  Approve / Dismiss are the only ways an item leaves the queue - nothing is ever decided
  automatically, and **decided rows are never deleted**: they stay as the client's history and are
  listed by `?status=decided`. The Home tab badge is `pendingCount`, scoped to the signed-in coach.

- **AI weekly summary (Prompt 51).** `WeeklySummary` = `{ id, coachId, weekStart ("YYYY-MM-DD",
  the Monday, UTC), text, facts (Json), createdAt }`, unique per `(coachId, weekStart)`. The
  server counts the week's facts from its own records (`server/src/weeklySummary.ts`) and sends
  **only that facts object** to the existing AI setup - no client names, notes or chat. Every
  number in the summary must appear in the facts (`numbersAreGrounded`); if the AI fails, is not
  configured, or cites a number that is not in the facts, the plain fact list is saved instead
  (`source: "facts"`), never an error. The facts are saved with the text so any number can be
  checked later. Manual button only: nothing runs on a schedule, and replacing an existing
  summary needs `replace: true` (the UI confirms first).

- **Coach accounts (Prompt 43).** `Coach` = `{ id, name, email (unique, lower-case),
  passwordHash, createdAt }`. Passwords are hashed with bcrypt (`bcryptjs`, cost 12,
  `server/src/auth/password.ts`); a plain-text password is never stored, returned or logged,
  and `passwordHash` must never appear in any API response.
- Every Client, Assignment, ProgressLog and ChatMessage has `coachId`, a real foreign key to
  `Coach` (delete cascades). **`coachId` NULL means demo data not yet claimed by a coach.** The
  old `"default-coach"` placeholder string was turned into NULL by migration
  `20261111090000_add_coaches`; no fake coach row exists. Since Prompt 45 every data route needs a
  signed-in coach and filters by that coach's id, so NULL rows are invisible to the API until the first
  coach registers and claims them (the old `DEMO_COACH_ID` constant is gone).
- **One-time claim:** `claimDemoData(tx, coachId)` (`server/src/auth/claimDemoData.ts`) moves
  every NULL row to a coach, but only when that coach is the first and only coach. Registration
  (Prompt 44) calls it in the same transaction that creates the coach; later coaches start empty.
- `Lead` (landing sign-ups) is not coach data and has no `coachId`.
- Register / login input rules live in ONE zod file shared by server and client:
  `server/src/auth/schemas.ts` (re-exported by `client/src/authSchemas.ts`). Password: 10+
  characters, max 72 bytes (bcrypt limit); email trimmed and lower-cased; plain-words errors.

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
- **`coachId` is never sent by the client.** The server sets it from the session (the signed-in
  coach's id, Prompt 45).
- Fields omitted from create bodies get the database defaults (see Prisma schema).
- Any 2xx means success. A route that returns nothing replies **204 No Content**
  (`api.ts` returns `undefined` for 204).
- Response objects are the full records as defined in `types.ts` (`Client`, `Assignment`,
  `ChatMessage`, `ProgressLog`), including `id`, `coachId` (`string | null`; not in
  `ChatMessage` responses, though the column exists) and `createdAt`.

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
| `listDailyCheckIns(clientId, days)` | GET | `/api/clients/:clientId/checkins?days=14` | — | `DailyCheckIn[]`, newest first (`days` 1-90, default 14) |
| `saveDailyCheckIn(clientId, input)` | POST | `/api/clients/:clientId/checkins` | `NewDailyCheckIn` | `DailyCheckIn` — **201** for a new day, **200** when it updated that day (one row per client per day) |
| `getHabitWeek(clientId, date)` | GET | `/api/clients/:clientId/habits?date=YYYY-MM-DD` | — (`date` optional, default today UTC; the UI sends its local date) | `{ date, days: string[7] (oldest first, ending `date`), habits: Habit[] }`: ACTIVE habits oldest first, each `{ id, coachId, clientId, name, active, createdAt, week: boolean[7], currentStreak, bestStreak }`. 400 bad date; 404 `Client not found`. (Prompt 54) |
| `addHabit(clientId, name)` | POST | `/api/clients/:clientId/habits` | `{ name }` (1-60 chars, trimmed) | `HabitRecord` 201; 400 `{ "error": "A client can have up to 8 habits. Archive one to add another." }` at 8 active |
| `updateHabit(clientId, habitId, input)` | PATCH | `/api/clients/:clientId/habits/:habitId` | `{ name?, active? }` (at least one; `active: false` archives, `true` restores while under 8) | `HabitRecord`; 404 `{ "error": "Habit not found" }` |
| `setHabitDone(clientId, habitId, date, done)` | PUT | `/api/clients/:clientId/habits/:habitId/logs/:date` | `{ done: boolean }` | `{ habitId, date, done }` (one row per habit per day, upserted); 400 bad date; 404 `Habit not found` |
| `listMeasurements(clientId)` | GET | `/api/clients/:clientId/measurements` | — | `Measurement[]`, newest first (`date`, then `createdAt`, `id`); 404 `Client not found`. (Prompt 56) |
| `addMeasurement(clientId, input)` | POST | `/api/clients/:clientId/measurements` | `NewMeasurement`: `{ date, waistCm?, chestCm?, armCm?, hipCm?, bodyFatPercent?, note? }` | `Measurement` 201 `{ id, coachId, clientId, date, waistCm, chestCm, armCm, hipCm, bodyFatPercent, note, createdAt }`; 400 `{ error }` for a bad date, a value that is not above 0, a tape value over 300, `bodyFatPercent` over 75 or a note over 500 characters |
| `deleteMeasurement(clientId, measurementId)` | DELETE | `/api/clients/:clientId/measurements/:measurementId` | — | 204, no body; 404 `{ "error": "Measurement not found" }` (also for another client's / coach's row) |
| `listTemplates()` | GET | `/api/templates` | — | `WorkoutTemplate[]` of the signed-in coach, A-Z by name (`name`, `createdAt`, `id`). Needs `requireCoach`. (Prompt 58) |
| `createTemplate(input)` | POST | `/api/templates` | `NewWorkoutTemplate`: `{ name, exercises: { name, sets, reps, rest }[], focus?, notes? }` | `WorkoutTemplate` 201 `{ id, coachId, name, focus, exercises, notes, createdAt }`; 400 `{ error }` for a missing name, no exercises, sets outside 1-10, empty reps, rest outside 6-3600 s, or a too-long text |
| `updateTemplate(templateId, input)` | PUT | `/api/templates/:templateId` | `NewWorkoutTemplate` (replaces name, focus, exercises, notes) | `WorkoutTemplate`; 400 as above; 404 `{ "error": "Template not found" }` (also for another coach's row) |
| `deleteTemplate(templateId)` | DELETE | `/api/templates/:templateId` | — | 204, no body; 404 `{ "error": "Template not found" }` |
| `getTodayTasks(date)` | GET | `/api/tasks/today?date=YYYY-MM-DD` | — (`date` optional, default today UTC; the UI sends its local date) | `{ date, tasks: TodayTask[] }` (`TodayTask` in `types.ts`): per client of the signed-in coach, one `{ kind: "due", clientId, clientName, assignmentId, assignmentType, text }` for each **Active** assignment dated that day, and one `{ kind: "idle", clientId, clientName, daysSince (null = no assignment ever), text }` for a client whose latest assignment date is 7+ days before `date` (or who has none; a plan dated ahead counts as covered). Due rows first, then idle, clients oldest first. 400 bad date; 401 signed out. Needs `requireCoach`. Home tab only (Prompt 48). |
| `getRecentCheckIns()` | GET | `/api/checkins/recent` | — | `{ items: RecentCheckIn[] }` (`types.ts`): the signed-in coach's progress logs created in the last 48 hours across all clients, newest first (`createdAt`, then `id`), max 8. Each item `{ kind: "progress", id, clientId, clientName, createdAt, weightKg, adherence, workoutsDone, note }`. `[]` when none. 401 signed out. Needs `requireCoach`. Read-only; no read/unread state. Home tab only (Prompt 49). **Prompt 53 hook:** `kind` is the discriminator, so daily check-ins join the SAME list later as a new `kind` (merged by `createdAt`, still max 8) without a UI rewrite; until then the card reads progress logs only. |
| `getAtRiskClients(date)` | GET | `/api/at-risk?date=YYYY-MM-DD` | — (`date` optional, default today UTC; the UI sends its local date) | `{ date, clients: AtRiskClient[] }` (`types.ts`): the signed-in coach's clients that ANY rule picks, worst first (more rules firing, then bigger gaps, then name). Each `{ clientId, clientName, reasons: { rule: "adherence" \| "inactive" \| "weight", text }[] }`, `text` being the exact plain-words reason (e.g. "Adherence 45% over the last 2 weeks"). Rules live in ONE pure function, `findAtRiskClients` in `server/src/atRisk.ts`, with named constants `ADHERENCE_MIN_PERCENT` (60), `ADHERENCE_WINDOW_DAYS` (14), `INACTIVE_DAYS` (10), `WEIGHT_STREAK_LOGS` (3): (1) average adherence under 60% over the logs dated within 14 days up to the client's latest adherence log; (2) latest progress log 10+ days old (a client with no logs counts once created 10+ days ago); (3) weight moved the wrong way for the goal on 3 straight logs (3 moves, so 4 weights; logs without weight are skipped; goals with "fat loss" want down, "muscle gain" up, any other goal is not judged). Rules only, no AI. 400 bad date; 401 signed out. Needs `requireCoach`. Read-only; messages nobody, changes no plan. Home tab only (Prompt 50). |
| `getWeeklySummary(date)` | GET | `/api/weekly-summary?date=YYYY-MM-DD` | — | `{ weekStart, summary: WeeklySummary \| null }` (that week's saved summary) |
| `generateWeeklySummary(date, replace)` | POST | `/api/weekly-summary` | `{ date?, replace? }` | `{ weekStart, summary }` 201; 409 `{ "error": "This week's summary is already saved. Confirm to replace it." }` unless `replace` is true |
| `getReviewQueue(status)` | GET | `/api/review-queue?status=pending\|decided` | — | `{ pendingCount, items: ReviewItem[] }` (pending oldest first; decided newest first) |
| `addReviewItem(input)` | POST | `/api/review-queue` | `NewReviewItem` | `ReviewItem` 201; 404 `{ "error": "Client not found" }`; 400 when a suggestion has no `type` |
| `approveReviewItem(itemId, date)` | POST | `/api/review-queue/:itemId/approve` | `{ date? }` | `{ item, assignment }` — a suggestion becomes a real Assignment (`source: "ai"`, status Active); a check-in item is just marked read (`assignment: null`) |
| `dismissReviewItem(itemId)` | POST | `/api/review-queue/:itemId/dismiss` | — | `{ item, assignment: null }` — status Dismissed, row kept as history |
| `seedDemo()` | POST | `/api/seed/demo` | — *(no body)* | `Client[]` (the created demo clients) |
| `seedSixMonthDemo()` | POST | `/api/seed/six-month-demo` | — *(no body)* | `Client[]` (the six-month clients it created; `[]` when all 10 exist) |
| `createLead(input)` | POST | `/api/leads` | `{ name, email }` | `Lead` 201 `{ id, name, email, createdAt }`; 400 `{ error }` (missing name / bad email); 409 `{ "error": "You are already on the list." }` for a known email (case-insensitive, stored lower-case). Landing page only; no password or payment. |
| `register(input)` | POST | `/api/auth/register` | `{ name, email, password }` (rules in `server/src/auth/schemas.ts`) | `Coach` 201 `{ id, name, email, createdAt }` + session cookie; 400 `{ error }`; 409 `{ "error": "That email is already registered." }`; 429 too many attempts; 503 sign-in unavailable (no `SESSION_SECRET` in production). The first coach ever also claims the demo data. |
| `login(input)` | POST | `/api/auth/login` | `{ email, password }` | `Coach` 200 + session cookie; 401 `{ "error": "That email or password is not right." }` (same for unknown email, no cookie); 400; 429; 503 |
| `logout()` | POST | `/api/auth/logout` | — *(no body)* | 204, session cookie cleared (also when already signed out) |
| `getMe()` | GET | `/api/auth/me` | — | `Coach` 200; 401 `{ "error": "You are not signed in." }` when signed out / session invalid or expired / coach deleted |
| `forgotPassword(email)` | POST | `/api/auth/forgot` | `{ email }` | 200 `{ "message": "If that email exists, a reset link is on its way." }` — the SAME reply for a known and an unknown email (the email is sent after replying); 400 for a malformed email; 429. |
| `resetPassword(input)` | POST | `/api/auth/reset` | `{ token, password }` (password rules as register) | 204 (signs nobody in; the coach then logs in); 400 `{ "error": "This reset link is not valid any more. Please ask for a new one." }` for an expired, used or unknown token (one message for all three); 400 weak password; 429. |
| `updateName(name)` | PATCH | `/api/auth/me` | `{ name }` | `Coach` 200 (name only; email is read-only); 401; 400 |
| `changePassword(input)` | POST | `/api/auth/change-password` | `{ currentPassword, newPassword }` | 204 + fresh session cookie for this session; 400 `{ "error": "Your current password is not right." }`; 401; 429. |

**Password reset and account (Prompt 47):** `PasswordResetToken` rows (`password_reset_tokens`) hold only the
SHA-256 hash of a 256-bit token, `expiresAt` = 1 hour, `usedAt` set when spent (one atomic `updateMany` claims
it, so a token works once even under a race); a newer request deletes the coach's older unused tokens.
`Coach.sessionVersion` (int, default 0) is copied into the session token (`v`); `sessionMiddleware` checks it
against the database (`server/src/auth/sessionCheck.ts`), so a reset or password change (which add 1) ends every
older session at once, while change-password re-signs the current session. Tokens from before Prompt 47 count
as version 0. Email goes out only through the `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` / `SMTP_USER` /
`SMTP_PASS` / `SMTP_FROM` env vars (sent with `nodemailer` in `server/src/auth/mailer.ts`; STARTTLS required for remote servers); the link
uses `APP_URL` (else `RENDER_EXTERNAL_URL`). With no provider configured, development logs the link on the
server console and production logs that email is not set up — a link is never returned by the API or shown in
the UI. Client: `/forgot-password`, `/reset-password?token=…` (`src/auth/PasswordPages.tsx`) and `/app/account`
(`src/auth/AccountPage.tsx`, header "Account" link). `server/test/setup.ts` answers the session check "current"
for mocked tests; tests of the check call `vi.unmock("../src/auth/sessionCheck.js")`.

**Sessions (Prompt 44):** a signed stateless JWT (HS256, `node:crypto`, secret from env `SESSION_SECRET`)
in the `repsy_session` cookie: httpOnly, `Secure` in production, `SameSite=Lax`, 7-day expiry, path `/`.
`sessionMiddleware` (`server/src/auth/session.ts`) runs on every request and sets `req.coachId` when the
cookie is valid; it never blocks. **Protected routes (Prompt 45):** everything under `/api/clients` (clients,
assignments, auto-assign, chat, progress) and `/api/seed` passes through `requireCoach`
(`server/src/auth/requireCoach.ts`): signed out, invalid or expired session -> `401 { "error": "You are not
signed in." }` before any query. Their queries all filter by the signed-in coach's id, so another coach's
client / assignment / log id gives the normal `404 Client not found` (or `Assignment not found` /
`Progress log not found`), never the record. Demo seeds load into the signed-in coach's own account only
(quick seed: skipped when THAT coach already has any client). **Public routes:** `GET /api/health`,
`POST /api/leads`, `/api/auth/*` (`me` answers its own 401), and the landing page `/`; `/app` is the
coach dashboard (its login screen comes in a later prompt). Unknown `/api` routes stay `404 Not found`.
Register and login are
rate-limited to 10 attempts per 15 minutes per IP each (in memory, `server/src/auth/rateLimit.ts`; the 11th
gets `429 { "error": "Too many attempts. Please wait 15 minutes and try again." }` with `Retry-After`).
`passwordHash` is never in a response.

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
  `saveMessage(clientId, role, content, coachId)` (`server/src/routes/chat.ts`), which the ask endpoint
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
- Prompt 29 asked `POST /api/seed/demo` to return `{ created: 0 }` when skipped. Kept `Client[]`:
  201 with the 3 new clients, or 200 `[]` when ANY client already exists.
- Prompt 30 named `POST /api/seed/six-month`; built on the existing `/api/seed/six-month-demo`,
  returning the created clients (`Client[]`, 201) or 200 `[]`. It skips clients whose name
  already exists. Both seeds take one Postgres advisory lock, so two quick taps can't seed twice.
- Prompt 32 asked for the database to be named `repsy-coach-db`. `render.yaml` keeps `repsy-db`:
  renaming it would make Render create a new, empty database.
- `GET /api/health` returns `{ ok: true, db: true }`, or `503 { ok: false, db: false }` when the
  database doesn't answer within 3 s.
- Prompt 44 said `sameSite=ax` (typo): built as `SameSite=Lax`. Chose a stateless JWT over a server
  session table (no migration), and no new dependency (own HS256 + in-memory limiter on `node:crypto`).
- Prompt 45 said "auth middleware"; built as `requireCoach` on `/api/clients` and `/api/seed` (401 JSON
  `{ error }`). The `/app` UI has no login screen yet, so until the login prompt the dashboard shows
  API errors when signed out; browser tests register a throwaway coach in `e2e/global-setup.ts`.
- Prompt 46: `/login` and `/register` (client `src/auth/AuthPages.tsx`, own lazy chunk) and the `/app` guard
  (`App.tsx` calls `getMe()` first; 401 -> `/login`). Logout clears the whole React Query cache. No API change.
  The "Forgot password?" link was hidden until Prompt 47 (now shown). Mocked UI specs import `test` from `e2e-ui/fixtures.ts`,
  which answers `/api/auth/me`; `e2e-ui/auth.spec.ts` and `e2e/auth.spec.ts` cover the sign-in flow.
- Prompt 47: the prompt named `POST /api/auth/forgot` / `/reset` as written; the account section is a
  `/app/account` page (header "Account" link) built on `PATCH /api/auth/me` (name) and
  `POST /api/auth/change-password`, which the prompt left unnamed. `reset` replies 204 and signs nobody in.
  SMTP is a small built-in client (no `nodemailer`); env names `SMTP_*` and `APP_URL` (see `.env.example`).
- Prompt 48: Home is the FIRST tab but `/app` still opens on AI Coach (making Home the landing tab would change
  what many existing specs assume; say so if you want it). Today's Tasks is built on the new
  `GET /api/tasks/today`. The review-queue count line is omitted (no check-in review data exists until Prompt 52).
  Buttons: a due task opens Manual Planner, an idle client opens AI Coach, each with that client selected.
- Prompt 49: "New check-ins" card on Home, built on the new `GET /api/checkins/recent` (progress logs only until Prompt 53). The time shown is when the log was saved (`createdAt`), not its `date` field. Clicking a row selects that client and opens Progress.
- Prompt 50: "Needs attention" card on Home, built on the new `GET /api/at-risk` (rules in `server/src/atRisk.ts`). The prompt's "3 straight logs" is read as 3 consecutive wrong-way moves (4 weights); "last 2 logged weeks" as the 14 days up to the client's latest adherence log. Each row lists every rule that fired.
- Prompt 54: habits are built on `/api/clients/:clientId/habits` (the prompt named no routes). The prompt's
  "plan-completion stat" had no habit input, so it became the average of the assignment % and the habit % (see Data notes).
- Prompt 55: no new model or route. `sleepHours` is now 0-16 with at most one decimal (error text changed to
  "...from 0 to 16, with at most one decimal."); `recoveryScore` stays a whole number 1-5. The Check-ins tab got both
  form fields, a "Sleep & Recovery" card (Recharts composed chart, last 14 days: bars = sleep hours, line = recovery) with
  7-day averages and the rule line "Averaged under 6 hours this week", and both values in the day list. The rules live in
  `server/src/sleep.ts` (`SLEEP_LOW_HOURS` 6, 7-day window ending today, nights with no value ignored, one logged night is
  enough). `GET /api/at-risk` may now add ONE extra reason `{ rule: "sleep", text: "Sleep under 6h average this week" }`, but
  only to a client the 3 original rules already picked (low sleep alone never lists a client; scoring and order unchanged).
  The AI Coach context gained each check-in's recovery score and a "7-day sleep average" line. All values are typed in by
  hand: no wearable, no automatic tracking, no medical or sleep-diagnosis wording.
- Prompt 56: measurements are built on `/api/clients/:clientId/measurements` (the prompt named no routes). The prompt's
  "sensible ranges" became above 0 / at most 300 cm and body fat above 0 / at most 75 %. Delete uses the shared
  `ConfirmDialog` (the Progress check-in list itself deletes without asking).
- Prompt 58: the prompt named no routes; templates are coach-level, so they live at `/api/templates` (not under
  `/api/clients/:clientId`). "Assign to client" creates nothing itself: it opens the Manual Planner pre-filled and the
  assignment is saved by the existing `POST /api/clients/:clientId/assignments` when the coach taps "Assign plan".
  The Library tab is lazy-loaded to keep `/app` inside its size budget, so `client/scripts/check-budget.mjs` now also
  finds the App chunk by its name when Vite lists it as `_App-<hash>.js` (same checks, unchanged budgets).
- A later message proposed different shapes (`{ clients: [...] }` sorted A–Z, `{ id }` on
  create, `{ ok: true }` on delete). The user chose to keep this contract.
