# Repsy Coach — rules for every prompt

Coach dashboard: pick a client, ask AI, auto assign plans with reasoning, or plan manually.
Progress in charts. Built one feature at a time, across many separate prompts.

## The 6 rules

1. **Do ONLY what the current prompt asks.** No extra features, no refactoring unrelated code,
   no renaming things the user did not name.
2. **The stack is fixed.** Do not add other frameworks or services.
   - Frontend (`client/`): React + Vite + TypeScript, Tailwind CSS, Recharts (progress charts),
     React Query (loading / saving data)
   - Landing page only (`client/src/landing/` and `client/src/landing-new/`, from Prompt 37): three, @react-three/fiber,
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

### Continue with Google (coach sign-in)

- `GET /api/auth/providers` -> `{ google }`; `GET /api/auth/google/start` -> 302 to Google with a
  random `state` in an httpOnly cookie; `GET /api/auth/callback/google` -> 302 to `/app` signed in,
  or to `/login?google=cancelled|expired|unverified|failed|off`. Code: `server/src/auth/google.ts`,
  `server/src/routes/googleAuth.ts`, button in `client/src/auth/AuthPages.tsx`.
- Built on fetch + node:crypto, no OAuth library. The ID token comes straight from Google's token
  endpoint over TLS, so its signature is not re-checked (OIDC Core 3.1.3.7); iss, aud, exp and
  `email_verified` are.
- Matching (security-reviewed: register never proves email ownership): `Coach.googleSub` first;
  else the same email ONLY when Google is authoritative for it (Gmail, or Workspace `hd` = domain)
  and that coach has no other Google link - linking replaces the password and bumps
  `sessionVersion`, so someone who pre-registered the address loses it; else an existing email ->
  `?google=link` (log in with the password); else a new coach with an unguessable password ("Forgot
  password" sets one) who claims the demo data like register. PKCE (S256) + state in a `__Host-`
  cookie; the flow always runs on the `APP_URL` origin (`/start` hops there first); `APP_URL` is
  required, no onrender.com fallback.
- Env (dashboard only): `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`; redirect URI =
  `APP_URL` + `/api/auth/callback/google` and must match Google Cloud exactly. The Google "G" mark's
  four colours are Google's brand (their branding rules), the one allowed exception to "no new colours".

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
- **Studio landing** (`client/src/landing-new/`, Nov 2026, preview at `/?design=studio`): the
  owner asked for a page with the scroll scenes and motion of a reference site (bharpai.app),
  then for it to be restyled in Repsy's own theme. It copies the reference's layout and motion
  only, never its words, logo, story or art; every claim is a shipped Repsy feature. Theme: the
  A1 rules above (cream paper, ink, one orange accent, teal for ticks and data, Instrument
  Serif headlines with one *italic orange* key word, Geist body, Geist Mono numbers, orange
  pill buttons with the hard ink shadow). Colours are ONLY `theme.css` tokens plus
  `color-mix()` tints (a UI test enforces this). No paper, cards or bills (owner's rule): the
  hero is an SVG barbell whose four plates are the four plan types in their type colours, one
  per client, loading and bending on scroll; the "old way" is a tangle of five generic app tiles
  that gets pulled into one place; plus a Workout / Nutrition plan toggle on a phone and a
  check-in chart. GSAP is a lazy `motion-*` chunk that loads only on wide screens without reduced
  motion; without it the page is a complete still page. A "Pause motion" button stops the
  marquee and badge. Tests: `e2e-ui/studio-landing.spec.ts`.

### Cards and buttons

- Cards: white (`--surface`) with a 1px `var(--border)` border, radius **14px**, no heavy
  shadows. Use the `card` class (radius alone: `rounded-card`).
- Primary button: `btn-primary` (orange background, `#141414` bold text).

### Layout

- **No vertical / side menu.** Navigation is horizontal, Chrome-style tabs across the top.

## Data notes
- **Security and privacy (Prompt 73).** There is **no CORS middleware**: the built client is served by
  the same Express app from the same origin and calls the API with relative paths, and the Vite dev
  server proxies `/api`, so nothing legitimate is cross-origin. Do NOT re-add `cors()` - a wildcard
  `Access-Control-Allow-Origin` on a cookie-authenticated app is what Prompt 73 removed.
  `server/src/security.ts` sets the response headers by hand (no `helmet`: new dependencies are
  forbidden): `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, a global
  `Referrer-Policy: strict-origin-when-cross-origin` (the invite/reset pages still override it with
  `no-referrer`), `Cross-Origin-Opener-Policy: same-origin`, HSTS **only over HTTPS**, and a CSP whose
  `script-src` is `'self'` with NO `'unsafe-inline'`. **Because of that CSP, `client/index.html` must
  never use an inline event handler** (the old `onload="this.rel='stylesheet'"` font trick was
  replaced with a plain stylesheet link); `style-src` does allow `'unsafe-inline'`, because inline
  `style` attributes are used throughout and a nonce cannot cover a style attribute. `x-powered-by`
  is disabled. Session cookies are `httpOnly`, `sameSite=lax`, `path=/`, 7 days, and `secure`
  whenever `NODE_ENV=production` **or** `RENDER` is set, because Render does not set `NODE_ENV`.
  `POST /api/leads` is rate limited (20/15 min) as the only public write. `client/scripts/check-budget.mjs`
  fails the build if `VITE_`, `AI_API_KEY`, `SESSION_SECRET`, `DATABASE_URL` or `SMTP_*` appears in a
  built asset: the client has no `import.meta.env` at all, and must keep it that way.
- **Deletion (Prompt 73).** Every foreign key to `Coach` and `Client` is `onDelete: Cascade` in the
  schema AND `ON DELETE CASCADE` in the applied migrations, so both deletes are one atomic statement:
  `DELETE /api/clients/:clientId` removes the client and all 13 child tables, and
  `DELETE /api/auth/account` removes the coach, their clients and every child row (plus templates,
  meals, weekly summaries and reset tokens). Landing-page `Lead` rows are NOT coach-owned and are
  deliberately left alone. If you ever write the deletes by hand instead, note that `Client.coachId`,
  `Assignment.coachId`, `ChatMessage.coachId` and `ProgressLog.coachId` are NULLABLE (null = unclaimed
  demo data), so a `deleteMany({ where: { coachId } })` would miss rows - match on the client ids too.
- **Privacy Policy and Terms of Service** live at `/privacy` and `/terms`. The text is in
  `client/src/legal/content.json` (the one source). `LegalPages.tsx` renders it in the app, and
  `client/scripts/prerender-legal.mjs` (run by `npm run build`) renders the same JSON to static
  `dist/legal/privacy.html` / `terms.html`, which the server sends for those paths, so crawlers
  (Google's OAuth branding review) see the full text without JavaScript. Published Nov 2026, with
  a "Google user data" section (scopes, use, no selling/ads/AI training, the Limited Use statement)
  that Google requires for "Continue with Google". Contact: `hello@repsy.fit`. Every claim must match
  the app: if a feature or a provider changes, change content.json and the "Last updated" date.


- **Business: plans and payments (Prompt 68) are RECORD-KEEPING ONLY.** No payment gateway,
  payment links, automatic charging, reminders or invoices (invoices/export are Prompt 70).
  `ClientPlan` (one per client, `client_plans`): `planName, priceAmount, anchorDay, billingCycle (Monthly |
  Quarterly | Yearly | One-time), startDate, nextDueDate, status (Active | Paused | Ended)`.
  `Payment` (`payments`): `clientPlanId, clientId, coachId, amount, paidOn, method (Cash | UPI | Card
  | Bank | Other), note`. Amounts are plain numbers (2 decimals at most) in `Coach.currency`
  (`"INR"` default or `"USD"`, set on the Account page); data never stores a symbol and the UI
  formats with `Intl.NumberFormat`. Recording a payment on an **Active** plan moves `nextDueDate` on
  by one cycle from the current due date (`server/src/billing.ts` `advanceDueDate`), in calendar
  months on the plan's stored due day `ClientPlan.anchorDay` (set from the first due date and
  whenever the coach sets a due date): start Nov 1, first due Nov 15 -> Dec 15; a short month clamps
  to its last day and the next month returns to the due day (due 30th: Jan 30 -> Feb 28 -> Mar 30;
  due 31st: Jan 31 -> Feb 28 -> Mar 31; Feb 29 yearly -> Feb 28 -> ... -> Feb 29). One-time plans never move; a
  Paused plan records the payment without moving; an Ended plan refuses payments (400). The advance
  runs in a transaction with a row lock, so two payments saved at once advance twice. The plan edit
  form sends `nextDueDate` only when the coach changed it, so it cannot undo a payment recorded
  meanwhile. Overdue / due-soon only apply to Active plans; the list shows overdue, due soon, later,
  then Paused / Ended. Amounts must be 0.01 or more with at most 2 decimals, and the next due date
  can't be before the start date (also checked when only the start date is edited). Errors are shown
  as written (no field-name prefix); a blank amount box says "Please enter the amount." **Deviations:** (1) the spec's "overdue in red text" is the orange pill with dark text
  (`bg-accent text-on-accent`) - the palette has no red, and small orange text fails contrast; due
  within 7 days is `text-amber-text`. (2) The client "My plan" section was to be left empty by
  Prompt 66, which was dropped, so it lives on the signed-in client's `/client` page.

- **Scheduling (Prompt 69).** `Appointment` (`appointments`) = `{ id, coachId, clientId, title (1-100), type ("Session" | "Call" |
  "Check-in review" | "Other"), startsAt, endsAt, location (text, up to 300, may be a link), status ("Booked" | "Done" | "Cancelled" |
  "No-show"), note (up to 1000, coach-only), createdAt }`; deleting the coach or the client deletes their appointments. **Timezone
  handling: `startsAt` / `endsAt` are UTC instants** (Prisma `DateTime`, sent as ISO strings; the server also accepts an offset such as
  `+05:30` and converts to UTC). Everything is converted to the viewer's **local** timezone in the browser only (`client/src/lib/schedule.ts`):
  the Schedule view's day columns, the `datetime-local` form inputs, the times on Home and on `/client`. The week request is the local
  week (Monday 00:00 to next Monday 00:00 local) turned into UTC instants. The Schedule view says "Times are shown in your timezone (X) and
  stored in UTC." An appointment lasts more than 0 and at most 24 hours. **Schedule is a view inside the Business tab** (switch
  Payments / Schedule; Reports comes later) - still 9 tabs, no 10th. It is a 7-column week (Mon-Sun, stacked on phones), blocks have a
  left border in the assignment type colours (Session = workout, Call = nutrition, Check-in review = recovery, Other = habit), today's
  column is highlighted, status is changed from the block, delete asks first. Overlapping blocks are listed one under the other (no
  side-by-side layout). **Read-only for clients:** `/client` "My sessions" shows only their own upcoming Booked sessions (not ended yet,
  max 50) with title, type, time and location - never the note, status or coach id. **No** booking links, client self-booking, reminders,
  video-call integration or calendar sync (Google Calendar sync stays a v3 idea).
- **Reports and export (Prompt 70).** Nothing is stored: no model, no migration. The Business tab's switch is now Payments /
  Schedule / **Reports** (still 9 tabs; the Reports chunk is lazy because it holds Recharts). **Progress report:** pick a client and an
  optional From / To (inclusive `YYYY-MM-DD`), "Generate progress report" shows a clean page - client details (goal, level, age, starting
  weight, height), measurements summary (first / latest / change per tape value and body fat), the existing `ProgressCharts` (weight +
  adherence + assignments by type), assignments marked Done of the total, daily check-in averages (energy, mood, sleep, recovery, water,
  steps; blank values ignored). **The PDF method in v2 is the browser's print dialog ("Print or save as PDF" -> choose "Save as PDF"); no
  PDF library or server-side PDF.** `@media print` in `index.css` hides the header, tabs, footer and `.no-print` controls and always prints on
  the light palette. The report data comes from `GET /api/reports/clients/:clientId/progress-report` and **never includes** the client's
  `notes` / `focus`, progress-log or measurement notes, assignment details / reasoning, or AI chat; no reports are emailed or scheduled.
  **CSV exports** are generated on the server (`server/src/csv.ts`, `server/src/routes/reports.ts`) from the same coach-scoped queries
  (`clientId` AND `coachId`), one file per type, UTF-8 **with a BOM**, CRLF line ends, header row always present (even with no rows), dates as
  `YYYY-MM-DD`, empty cell for no value, text cells starting with `=` `+` `-` `@` get a leading `'` (spreadsheet formula safety). **Photos
  are never exported (Prompt 57).** The optional range filters `date` (`paidOn` for payments). Columns (these are the export shape, do not rename):
  - `progress`: `date, weightKg, adherence, workoutsDone, note`
  - `measurements`: `date, waistCm, chestCm, armCm, hipCm, bodyFatPercent, note`
  - `payments`: `paidOn, amount, method, note` (amount is a plain number in the coach's currency)
  - `assignments`: `date, type, title, details, reasoning, source, status`
  - `roster` (all of the coach's clients, A-Z): `name, goal, level, planName, planStatus, billingCycle, priceAmount, nextDueDate` - a client
    with no plan has `planStatus` "No plan" and the other plan columns empty. The button "Download roster CSV" is on the Business Payments view.
- **Streaks and leaderboard (Prompt 71).** Nothing is stored: no model, no migration. **Place: the Business tab's "Engagement" view**
  (switch Payments / Schedule / Engagement / Reports; still 9 tabs; no Home card). Rules live in `server/src/engagement.ts`, per client:
  **check-in streak** = consecutive days with a `DailyCheckIn` up to today (today not yet logged does not break it, counting back from
  yesterday) computed by the existing `habitStreaks` (Prompt 54, reused, not copied); **habit %** = done ticks in the last 7 days /
  (active habits x 7), rounded, `null` with no active habits - the denominator is always the full 7 days, so a habit added today starts low and climbs; **workouts this week** = Workout assignments with status Done dated Monday-Sunday
  of the week containing the viewer's date. **The coach's ranking is those numbers in that order, nothing else:** check-in streak (high first),
  then habit % (high first, none last), then name; clients with equal numbers share a rank; workouts are shown but never change the order. Each row shows
  the three numbers beside its rank. A client with no check-in ever and no habit tick in the last 7 days has `enoughData: false`, rank `null`
  and reads "Not enough data yet" (never rank 0); they are listed after the ranked clients. **Coach-only ranking:** a client sees only
  their OWN three numbers in a "My streaks" line on `/client` (`GET /api/client-auth/my-streaks`), never a rank, the roster or another client.
  No points currency, prizes, sharing, notifications or ranking inside the client app. **Demo data counts exactly like real entries** (same
  records, same rules): seeded clients with a long run of check-ins or ticked habits will rank high, and the six-month demo's old dates only
  matter if they reach today or yesterday.
- **Client sign-in (Prompt 65) is a separate auth system from the coach's.** `Client` gained
  `loginEmail` (unique when set), `passwordHash` (NULL until the client sets a password) and
  `clientSessionVersion`; invites live in `client_invites` (`ClientInvite`: the invited `email`, SHA-256 `tokenHash`
  only, 48-hour `expiresAt`, single-use `usedAt`; a new invite removes the client's older unused
  ones). Separation is enforced three ways in `server/src/auth/clientSession.ts`: its own cookie
  (`repsy_client_session`, never `repsy_session`), its own signing key (HMAC of SESSION_SECRET
  with a fixed label, so a client token never verifies as a coach token or the reverse), and an
  `aud: "client"` claim that the coach verifier refuses. The client middleware only ever sets
  `req.clientAccountId`; `requireCoach` reads only `req.coachId`, so a client session gets 401 on
  every coach route (and `/app` sends them to the coach login), and `requireClient` gives coaches
  401 on `/api/client-auth/me`. A signed-in client can read exactly one record: their own
  (`{ id, name, loginEmail }`). There is no client registration route and the login page
  (`/client/login`, labelled "Client sign-in - Repsy Coach") has no sign-up link.
  **`passwordHash` is omitted from every Prisma query globally** (`src/db.ts`), so no coach route
  can return it, including `include: { client: true }`; only the client login opts back in per
  query. Invites are emailed with the Prompt 47 SMTP setup; without SMTP (or if sending fails) the
  coach gets the link to copy plus "Email is not configured - share this link with your client."
  Setting a password from an invite raises `clientSessionVersion`, ending older client sessions;
  re-inviting an active client is how a client resets a forgotten password in v2. **An invite never
  changes how a client signs in until it is used**: the invited address becomes `loginEmail` only in
  `set-password`, so a mistyped or expired re-invite cannot lock an active client out, and an email
  is only ever claimed by someone holding a link sent to it. Issuing an invite locks the client row
  (`SELECT ... FOR UPDATE`), so two invites at once leave one live link. Invites are limited per coach
  (30 per 15 minutes); the invite email has a fixed subject. Pages with a token in the URL
  (`/client/set-password`, `/reset-password`) are served with `Referrer-Policy: no-referrer`. Same password
  rules and the same 10-per-15-minutes rate limit as coaches.

- **Client messages (Prompt 63) are NOT the AI Coach chat.** `ThreadMessage` (table
  `thread_messages`) = `{ id, coachId, clientId, sender ("coach" | "client"), body, createdAt,
  readAt }`. The AI Coach keeps `ChatMessage` / `chat_messages` and `/api/clients/:clientId/chat`;
  the two share no table, route or component. Messages are plain text and rendered as text, never
  HTML. A coach may delete only their own message, and only within 15 minutes. Opening a thread
  (the newest page) marks the client's messages read; an older page marks nothing. **No
  real-time in v2**: no WebSockets or push - the Messages tab (8th tab, after Library, lazy-loaded)
  fetches on open and polls every 20 seconds while the browser tab is visible.
- **Messages UI (Prompt 64).** The Messages tab has its own client column (search by name, last
  message preview, unread dot), so the top client strip is hidden on that tab; picking a
  conversation still sets the app-wide selected client. `GET /api/messages/threads` was added
  for that column (the prompt listed UI files only): without it the list would have to open every
  thread, which marks it read. Coach bubbles sit right in teal (`bg-accent2`, white text), client
  bubbles left in `bg-surface2`. Enter sends, Shift+Enter adds a line. A send gets a temporary id
  on the device; on success the bubble becomes the saved message and stays until a thread
  fetched from the server contains that id (it is never appended to the cache by hand), so a
  refresh that read the database before the INSERT cannot make it vanish and it is never shown
  twice. On failure it stays with Retry / Discard; Retry works only on a failed bubble, so a
  double-click sends once. Unsent bubbles and drafts are kept per client above the conversation
  pane, so switching client mid-send loses nothing: a later failure waits in that conversation and
  the list shows "Not sent - open to retry". `/api/messages/threads` picks one row per client with
  `DISTINCT ON` and returns at most 200 characters of the body (it runs on every poll). Duplicates are
  prevented in the UI only: if the server saved a message but the response was lost, Retry can
  save it a second time (no idempotency key in v2). Chat never touches the Home review-queue
  count.

- **Lazy tabs and the bundle guard.** `/app` loads Home, AI Coach, Clients and Manual Planner
  eagerly; **Progress, Check-ins and Library load on first open**, each wrapped in `<Suspense>`.
  That keeps Recharts out of the dashboard's first download (`/app` ~99 KB gz, budget 130 KB in
  `client/scripts/check-budget.mjs`; first load 90 KB). A new chart-heavy tab should be lazy too.

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

- **Meal library (Prompt 60).** `Meal` = `{ id, coachId, name, mealType ("Breakfast" | "Lunch" | "Dinner" | "Snack"),
  calories, proteinG, carbsG, fatG, ingredients, steps, createdAt }`. `name` 1-100 characters, `calories` whole number 0-10000,
  each macro 0-1000 (decimals allowed), `ingredients` up to 2000, `steps` up to 4000. **Every value is coach-entered** and the UI
  labels them "Coach-entered values": nothing is fetched from a food database / barcode / API, nothing is calculated from the
  ingredients, and there are no diet or health claims. The Library tab's empty state says so. **Coach-level** like templates: one
  coach, no client, never shared; deleting the coach deletes their meals, deleting a meal never touches assignments made from it.
  A "Meal library" section under the workout templates (`client/src/components/MealLibrary.tsx`) has search by name, a meal-type
  filter, card list with macros, add / edit / delete (confirm). "Assign to client" (client + date, default today) **saves right away**
  a `Nutrition` assignment (`source: "manual"`) through the existing assignments route: title = meal name, details = name, then
  `450 kcal · Protein 30g · Carbs 45.5g · Fat 15g`, then the steps; reasoning `From meal library: <name>`.

- **Macro calculator (Prompt 61).** Nothing is stored: no model, no migration. One pure function,
  `calculateMacros` in `server/src/macros.ts` (unit-tested with 3 hand-checked people in `server/test/macros.test.ts`):
  Mifflin-St Jeor BMR (`10*kg + 6.25*cm - 5*age + 5` male / `- 161` female), TDEE = BMR x activity (Sedentary 1.2, Light 1.375,
  Moderate 1.55, Active 1.725, Athlete 1.9), goal adjustment (goal text containing "fat loss" -20%, containing "muscle gain" +10%,
  any other goal 0%; named constants at the top of the function), calories rounded to whole kcal, protein 2 g/kg, fat 25% of
  calories (9 kcal/g), carbs = the remainder (4 kcal/g); grams are rounded first, carbs take what is left of the rounded calories.
  **Under 18 is refused** (`400 "Macros are only calculated for adults aged 18 or older."`, also stopped in the form before any
  request). Sex (Female / Male) is required by the formula. The result card always shows the exact line `Starting estimate for
  coaching only - not medical advice. Adjust from the client's real progress.`, and "Save as Nutrition assignment" saves a
  `Nutrition` assignment (`source: "manual"`, title `Macro targets: N kcal`) with that line in the reasoning. No diagnosis or
  prescription wording. UI: a "Macro calculator" section at the bottom of the Library tab
  (`client/src/components/MacroCalculator.tsx`); the Check-ins and Progress tabs have a "Macro calculator for <name>" link that
  opens it pre-filled (weight, height, age, goal) from that client; the pre-fill is used once.

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

### Join codes (Prompt 76)
- Each coach has ONE join code: `Coach.joinCode` (unique, stored upper-case, made on first `GET /api/join-code`),
  `joinCodeActive`, `approveNewClients`. Format: 4 letters from the coach's name (A-Z, padded with `X`) + `-` + 6
  random characters from `23456789ABCDEFGHJKMNPQRSTUVWXYZ` (no 0/O/1/I/L), unbiased (rejection sampling). Code
  in `server/src/auth/joinCode.ts`; routes in `server/src/routes/joinCode.ts`.
- "Make a new code" replaces the code; the old one stops working at once. Turning the code off makes the public
  lookup answer exactly like an unknown code. Clients who already joined are never affected by either.
- The Clients tab shows the **Invite clients** panel (`components/JoinCodePanel.tsx`, its own lazy chunk): code,
  link, Copy code / Copy link, Share (only where `navigator.share` exists), a QR code, and the two switches.
- QR codes come from `client/src/lib/qr.ts`, a small hand-written encoder (byte mode, level M, versions 1-6; no
  dependency), drawn by `components/QrCode.tsx` as dark ink on `--white` in both themes, since phone cameras
  need dark-on-light. `e2e-ui/qr-encoder.spec.ts` checks it bit for bit against reference matrices.

### Joining with a code (Prompt 77)
- `/join/:code` (public): "Join <coach>'s coaching", name + email + password (coach sign-up rules). `POST
  /api/client-auth/join` creates a Client under the code's coach (`joinedVia "code"`) and signs in with the CLIENT
  cookie only. `joinStatus` is `"pending"` when the coach has "Approve new clients" on; pending / declined
  clients can sign in and read `/me` but every client-data route uses `requireActiveClient` (403). Any new
  client-data route MUST use `requireActiveClient`, not `requireClient`.
- **Taking over an existing record needs proof of the inbox.** An address that already signs in -> 409 (generic).
  An address the coach already invited (exactly one of that coach's clients, no sign-in yet) does NOT attach on
  the spot: a fresh invite is emailed (202 "check your email") and using it attaches the record via the Prompt 65
  set-password flow. Otherwise a new client is created. Never attach across coaches.
- Welcome questions once (`/client/welcome`, skippable) for code-joined clients (`needsWelcome` on `/me`): goal,
  age, height cm, weight (kg or lb; stored in kg), level, injuries. Injuries go into `Client.notes` as ONE line
  starting `From client: `, which replaces the client's previous line and never touches the coach's notes; the
  client only ever reads back that line. `Client.units` keeps kg / lb.
- Client forgot / reset password (`/client/forgot-password`, `/client/reset-password`): own table
  `ClientPasswordResetToken` (hash only, 1 hour, single use), same generic reply as the coach's, bumps
  `clientSessionVersion`. Welcome email after joining (fixed subject; never blocks the join).
- Decided in review (Prompt 77): any invite of that coach to that email counts (even expired); a live invite
  younger than 15 minutes is not replaced (no re-send spam, the coach's link keeps working); `/join` is limited
  per IP AND per email. The welcome email subject stays fixed ("Welcome to Repsy Coach") - a coach-chosen name
  never goes in a subject line. Self-entered ranges are stricter than the coach form (age 13+, weight 20+ kg).
  Pending clients may answer the welcome questions (helps the coach decide); declined clients get 403.
  Records attached through an invite keep `joinedVia "coach"`. `/client/reset-password` sends no Referer.
- Known limit: join does not verify the email first. Someone could sign up with another person's address under
  any coach; the owner can still take that account over with "Forgot password", and delete it (Prompt 83).

### Continue with Google for clients (Prompt 78)
- `GET /api/client-auth/google/start` (sign in) and `?code=<JOINCODE>` (join). Google allows only the ONE
  registered redirect URI, so clients share `/api/auth/callback/google` with coaches: the state cookie carries
  the kind (`coach` | `client` | `join:<CODE>`; a cookie without one is a coach attempt) and the callback hands
  client kinds to `finishClientGoogle` (`routes/clientGoogle.ts`). Client failures go back to `/client/login`
  or `/join/<CODE>` with `?google=<reason>` (`noaccount`, `link`, `badcode`, plus the coach reasons).
- Rules: `Client.googleSub` first; else, only when Google owns the address (Gmail / Workspace hd), link the
  client with that login email (new unguessable password, `clientSessionVersion` + 1) or, when joining,
  attach the ONE client this coach invited at that address with no sign-in yet; else an address that already
  signs in -> `link`; else join creates a client (pending if the coach approves); else `noaccount`.
- Coach and client Google accounts never cross: separate columns (`Coach.googleSub` / `Client.googleSub`) and
  separate cookies. `Client.lastGoogleAuthAt` is set on every client Google sign-in (Prompt 83 uses it).
- Decided in review (Prompt 78): only a MISSING cookie kind means coach; an unknown or malformed kind is an
  expired attempt. Client states start with `k~`, so a client whose cookie is gone still lands on the client
  pages. The join code is re-validated (and encoded) before it goes into any redirect. On a join link, an
  existing client account of ANOTHER coach is not signed in silently (`?google=othercoach`). A client password
  reset or a used invite sets `googleSub = null` (inbox proof beats a Google link for an address Google does
  not own). The attach-by-invite path runs in one transaction.

### The client app (Prompt 79)
- `/client` (Today), `/client/week`, `/client/plan/:id`, `/client/me` - all render `clientApp/ClientApp.tsx`
  (its own lazy chunk) inside the `client-home` route. Phone: a bottom tab bar; wider: the same tabs in the
  header (the no-side-menu rule holds). My plan / My sessions / My streaks moved to the Me tab
  (`clientApp/sections.tsx`).
- Plans come only from the client's own routes (`/api/client-auth/my-assignments...`, `requireActiveClient`):
  Active and Done only (never Paused), at most 62 days per request, no `coachId` / `source` in the reply.
- A client can only mark a plan done / not done, with an optional effort (1-10) and note (<= 500). The body
  is strict: any other field is a 400. `Assignment.completedAt / completedBy ("coach" | "client") /
  clientEffort / clientNote`. The coach's status PATCH sets `completedBy "coach"` when it moves a plan INTO
  Done, keeps an existing completion when re-marking Done, and clears who / when when leaving Done. The
  Manual Planner card shows "Done by client" with the effort and note.
- Plan detail reads the Manual Planner lines (`1. Name — 4 sets × 6 reps · Rest 120s`, `clientApp/planLines.ts`)
  into a checklist (kept in localStorage only) and a rest timer (wall-clock based, "Rest over" via aria-live).
  Other text (AI plans) shows as written. `TYPE_CHIP` now lives in `lib/typeChip.ts`.
- Decided in review (Prompt 79): marking done only completes a still-Active plan (an already-Done plan keeps
  who finished it); leaving Done (coach or client) clears the effort and note too; Undo asks first when an
  effort or note would be lost. Progress / Messages tabs arrive with Prompts 81 / 82 (no empty placeholders).
  Desktop tabs sit in the header, not a left rail, because of the no-side-menu rule. Effort uses native radios.

### Client tracking (Prompt 80)
- Routes in `server/src/routes/clientTracking.ts` (`requireActiveClient`, own records only): habits (tick),
  daily check-in, weekly check-in (a ProgressLog under the client's coach that goes to the coach's review
  queue, title "Check-in <date> (from client)"), targets. Validation reuses the coach's `CheckInSchema` and
  `NewProgressLogSchema` (exported), made strict.
- "Today or yesterday" is the client's own calendar: every API request sends `X-Client-Date` (the browser's
  local day); the server trusts it only within UTC today +-1 (`clientToday`), then allows exactly that day and
  the day before (`isRecentDay`). Nothing older, ever.
- Decided in review (Prompt 80): `enteredBy` ("coach" | "client") on `DailyCheckIn`, `HabitLog` and
  `ProgressLog`. A client gets 409 "Your coach already logged this day..." instead of overwriting a
  coach-entered day or tick (coach saves always set "coach"). One client weekly check-in per date (409).
  Client weights are stored in kg to 2 decimals and shown back in their unit. Targets accept 300-15000 kcal /
  0-1000 g so every macro-calculator result saves. The weekly note is capped at 500 for clients only.
- Coach: `PATCH /api/clients/:clientId/targets` (`Client.calorieTarget`, `proteinTargetG`; "Save as <client>'s
  daily targets" on the macro result) and `mealIds` on a NEW Nutrition plan (the coach's own meals only, max 10;
  "Add meals from library" in the Manual Planner). The client's plan view shows the targets and the meals'
  macros; `GET /my-assignments/:id` adds `meals` (from the plan's own coach's library, in the coach's order).
- `Client.weeklyCheckInDay` (0 = Sunday, default) - set by the client on the Me tab (profile PATCH); Today
  highlights the weekly check-in on that day. Weekly weight is entered in the client's unit, stored in kg.
- Pages: `/client/checkin`, `/client/weekly` (`clientApp/Tracking.tsx`). Habit ticks use local state set in the
  click handler so the box changes at once (an async optimistic update lost races under load).

### Client progress (Prompt 81)
- `/client/progress` (a 4th tab): the coach's `ProgressCharts` (weight + adherence; `assignments` omitted hides the
  by-type chart; `units` shows lb) from the client's own logs, lazy-loaded in `clientApp/ProgressView.tsx` so
  recharts stays out of the client app chunk; body measurements; the streak summary. No at-risk flags, rank or
  coach notes.
- `Measurement.createdBy` ("coach" | "client"). The client adds with the coach route's `NewMeasurementSchema`
  made strict, plus client-route-only checks: no date after the client's today and at least one value and deletes only `createdBy: "client"` rows (404 otherwise).
  The coach's measurement table marks client-added rows "Added by client."

### Client messages (Prompt 82)
- `server/src/routes/clientMessages.ts`: the client's side of `thread_messages` (same table as the coach's
  Messages tab). Sender is always "client", set server-side, into the client's own thread with their own
  coach (strict body: `{ body }` only, 1-2000 chars, 60 per 15 min per client). Opening the thread marks only
  the COACH's shown unread messages read; `GET /my-messages/unread` is read-only (the tab badge).
- Client app: `/client/messages` (5th tab, `clientApp/MessagesView.tsx`), newest 100, polled every 20 s while
  open (no websockets/push); the badge polls every 20 s on other tabs. Failed sends stay with Retry/Discard.
  The client sees "Seen" on their messages the coach has opened.
- Decided in review (Prompt 82): opening the thread marks every coach message up to the newest shown as
  read (older ones too); a client with no coach gets `{ messages: [], hasCoach: false }` / `{ count: 0 }` and
  409 on POST (composer hidden); 429 says "You're sending messages too fast..." (`rateLimit` takes a
  `message`). The box scrolls itself (never the page) and only when the reader is at the bottom. Like the
  coach side, a send that times out after saving can be sent twice by Retry (no idempotency key in v2).

### Client account (Prompt 83)
- `server/src/routes/clientAccount.ts`: `/me/account` (GET name, loginEmail, googleConnected, timezone; PATCH
  name / timezone only - never email or coach), `/change-password` (bumps `clientSessionVersion`, re-issues this
  session's cookie), `/my-payments` (own, read-only, dates / plan / method - NO amounts, same rule as
  `/my-plan`), `DELETE /me` (deletes the Client row; every child table cascades).
- Clients have Google OR a password, never both (linking Google sets an unguessable password; invite / reset
  removes the Google link), so `googleSub !== null` means "Google-only": change password says "Use Forgot
  password to set one", and deleting needs a Google sign-in within 5 minutes (`lastGoogleAuthAt`) plus DELETE.
- `Client.timezone` (IANA, validated with Intl; null = the device's). `/my-sessions` returns it and the app
  formats session times in it. Me tab sections live in `clientApp/MeSettings.tsx`.
- Decided in review (Prompt 83): the Google 5-minute check also needs THIS session to come from that sign-in
  (cookie `iat` >= `lastGoogleAuthAt`, `req.clientSessionIssuedAt`); timezones are stored in Intl's canonical
  form; client names allow 100 chars (same as the coach form); pending / declined clients can delete from the
  waiting screen (`PendingDelete`, lazy); deleting a client also deletes the coach's plan / payment rows for
  them (said in the privacy policy).

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
| `deleteClient(clientId)` | DELETE | `/api/clients/:clientId` | — | 204, no body (also deletes the client's assignments, AI chat messages, client messages (`thread_messages`) and progress logs) |
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
| `getMessageThread(clientId, before?)` | GET | `/api/clients/:clientId/messages?before=<ISO>` | — | `{ messages: ThreadMessage[], hasMore }` — newest page of 50, oldest → newest; opening the newest page marks the client's messages read (`readAt`) |
| `sendMessage(clientId, body)` | POST | `/api/clients/:clientId/messages` | `{ body }` (1-2000 chars, plain text) | `ThreadMessage` 201 (`sender: "coach"`); 400 `{ "error": "Write a message first." }` |
| `deleteMessage(clientId, messageId)` | DELETE | `/api/clients/:clientId/messages/:messageId` | — | 204; 403 `{ "error": "Messages can only be deleted within 15 minutes of sending." }` or `"You can only delete messages you sent."`; 404 `"Message not found"` |
| `listThreads()` | GET | `/api/messages/threads` | — | `{ threads: [{ clientId, lastMessage: { sender, body, createdAt } \| null, unreadCount }] }` — one row per client of this coach; read-only, never marks anything read (Prompt 64) |
| `getClientAccess(clientId)` | GET | `/api/clients/:clientId/invite` | — | `{ loginEmail, pendingEmail, status: "none" \| "invited" \| "active", inviteExpiresAt, emailConfigured }` (coach) |
| `inviteClient(clientId, email)` | POST | `/api/clients/:clientId/invite` | `{ email }` | 201 `{ sent: true, loginEmail, inviteExpiresAt }` when emailed (link never returned), or `{ sent: false, loginEmail, inviteExpiresAt, inviteLink, note }` when email is not configured / failed; 409 `"That email can't be used for a client sign-in. Please use a different one."` (generic on purpose); 503 when APP_URL is unknown (coach) |
| `clientSetPassword(token, password)` | POST | `/api/client-auth/set-password` | `{ token, password }` | 204; 400 `"This invite link is not valid any more. Please ask your coach for a new one."`; 409 if the invited email became another client's login meanwhile (client, no session needed) |
| `clientLogin(email, password)` | POST | `/api/client-auth/login` | `{ email, password }` | 200 `ClientAccount` + **client** cookie; 401 `"That email or password is not right."` |
| `clientLogout()` | POST | `/api/client-auth/logout` | — | 204, clears the client cookie only |
| `getClientAccount()` | GET | `/api/client-auth/me` | — | 200 `{ id, name, loginEmail }` (their own client only); 401 without a **client** session |
| `getBusinessPlans()` | GET | `/api/business/plans` | — | `{ currency, plans: [{ client: { id, name }, plan: ClientPlan, lastPayment: { amount, paidOn, method } \| null }] }` (coach, Prompt 68) |
| `saveClientPlan(clientId, input)` | PUT | `/api/clients/:clientId/plan` | `NewClientPlan` | `ClientPlan` — 201 new / 200 updated (one plan per client) |
| — | GET | `/api/clients/:clientId/plan` | — | `ClientPlan \| null` |
| `recordPayment(clientId, input)` | POST | `/api/clients/:clientId/plan/payments` | `{ amount, paidOn, method, note? }` | 201 `{ payment, plan }` — `plan.nextDueDate` moved on one cycle (not for One-time); 400 `"This client has no plan yet. Add a plan first."` |
| `listPayments(clientId)` | GET | `/api/clients/:clientId/plan/payments` | — | `Payment[]`, newest first |
| `updateCurrency(currency)` | PATCH | `/api/auth/currency` | `{ currency: "INR" \| "USD" }` | `Coach` (now includes `currency`) |
| `listAppointments(from, to)` | GET | `/api/appointments?from=<ISO>&to=<ISO>` | — | `Appointment[]` of the signed-in coach starting in `[from, to)`, oldest first; each `{ id, coachId, clientId, clientName, title, type, startsAt, endsAt, location, status, note, createdAt }` (times are UTC ISO). 400 `{ error }` for a missing / bad range. Needs `requireCoach`. (Prompt 69) |
| `createAppointment(input)` | POST | `/api/appointments` | `{ clientId, title, type, startsAt, endsAt, location?, status? (default Booked), note? }` | `Appointment` 201; 404 `{ "error": "Client not found" }` (also another coach's client); 400 `{ error }` for no title, a type / status outside the lists, a bad time, an end not after the start, longer than 24 hours, or a too-long text |
| `updateAppointment(id, input)` | PATCH | `/api/appointments/:appointmentId` | any of the create fields (at least one) | `Appointment`; the new end is checked against the stored start; 404 `{ "error": "Appointment not found" }` (also another coach's row) or `"Client not found"` |
| `deleteAppointment(id)` | DELETE | `/api/appointments/:appointmentId` | — | 204; 404 `{ "error": "Appointment not found" }` |
| `getMySessions()` | GET | `/api/client-auth/my-sessions` | — | `{ sessions: [{ id, title, type, startsAt, endsAt, location }] }` — the signed-in CLIENT's own upcoming Booked sessions (not yet ended), soonest first, max 50; no note, no status; 401 without a **client** session (Prompt 69) |
| `getProgressReport(clientId, range)` | GET | `/api/reports/clients/:clientId/progress-report?from=YYYY-MM-DD&to=YYYY-MM-DD` | — (`from` / `to` optional, inclusive) | `ProgressReport` `{ client: { name, goal, age, weightKg, heightCm, level }, range: { from, to }, logs: { date, weightKg, adherence, workoutsDone }[] (oldest first), measurements: { date, waistCm, chestCm, armCm, hipCm, bodyFatPercent }[], assignments: { total, done, byType: { type, count }[] }, checkIns: { count, energy, mood, sleepHours, recoveryScore, waterLiters, steps (averages or null) } }`. No notes, focus, reasoning or chat. 400 `{ error }` for a bad date or `from` after `to`; 404 `Client not found` (also another coach's client). Needs `requireCoach`. (Prompt 70) |
| `downloadClientCsv(clientId, type, range)` | GET | `/api/reports/clients/:clientId/export/:type?from&to` | — (`type` = `progress` \| `measurements` \| `payments` \| `assignments`) | `text/csv; charset=utf-8` attachment, columns in "Reports and export" above; 400 for another type or a bad range; 404 `Client not found`. Needs `requireCoach`. (Prompt 70) |
| `downloadRosterCsv()` | GET | `/api/reports/roster` | — | `text/csv` attachment of all the signed-in coach's clients with plan status and next due date. Needs `requireCoach`. (Prompt 70) |
| `clientJoin(input)` | POST | `/api/client-auth/join` | `{ code, name, email, password }` | 201 `{ id, name, loginEmail, joinStatus }` + CLIENT cookie; 202 `{ status: "check-email", message }` when the coach already invited that email (a fresh invite is emailed; nobody is signed in); 404 bad / off code; 409 `That email already has a client account. Please sign in.`; 400 validation. Rate limited. (Prompt 77) |
| `getClientAccount()` | GET | `/api/client-auth/me` | — | `{ id, name, loginEmail, joinStatus, coachName, needsWelcome }` (own coach's name only). `requireClient`. (Prompt 65, extended in 77) |
| `getMyProfile()` / `saveMyProfile(input)` | GET / PATCH | `/api/client-auth/me/profile` | PATCH `{ goal?, age? (13-120), heightCm? (50-300), weightKg? (20-500), level?, units? ("kg"\|"lb"), injuries? (<=1000), skip? }`, nothing else (400 `Only the welcome questions can be changed here.`) | GET `{ goal, age, heightCm, weightKg, level, units, injuries }` (injuries = the client's own "From client:" line only); PATCH 204, sets `onboardedAt`. `requireClient` (pending clients may answer). (Prompt 77) |
| `clientForgotPassword(email)` / `clientResetPassword(token, password)` | POST | `/api/client-auth/forgot`, `/api/client-auth/reset` | `{ email }` / `{ token, password }` | forgot: always 200 `{ message }`; reset: 204, 400 `This reset link is not valid any more...`. Rate limited. (Prompt 77) |
| `getMyAssignments(from, to)` | GET | `/api/client-auth/my-assignments?from&to` | — | `ClientAssignment[]` `{ id, type, title, details, reasoning, status ("Active"\|"Done"), date, completedAt, completedBy, clientEffort, clientNote }`, oldest first; 400 bad dates / `from` after `to` / over 62 days. `requireActiveClient`. (Prompt 79) |
| `getMyAssignment(id)` | GET | `/api/client-auth/my-assignments/:id` | — | `ClientAssignment`; 404 `Plan not found` (also Paused or another client's). `requireActiveClient`. (Prompt 79) |
| `markMyAssignment(id, body)` | POST | `/api/client-auth/my-assignments/:id/done` | `{ done: boolean, effort?: 1-10 \| null, note?: string <= 500 }` (strict) | the updated `ClientAssignment`; 404 as above; 400 validation. Rate limited per client. `requireActiveClient`. (Prompt 79) |
| `getMyHabits(date)` / `tickMyHabit(id, date, done)` | GET / PUT | `/api/client-auth/my-habits?date`, `/api/client-auth/my-habits/:habitId/:date` | PUT `{ done }` (strict) | GET `{ date, days, habits: [{ id, name, week, currentStreak, bestStreak }] }` (own active habits); PUT `{ habitId, date, done }`; 400 `You can only log today or yesterday.`; 404 `Habit not found`. `requireActiveClient`. (Prompt 80) |
| `getMyCheckIn(date)` / `saveMyCheckIn(date, body)` | GET / PUT | `/api/client-auth/my-checkins/:date` | the coach's check-in fields minus `date` (strict) | GET `{ checkIn \| null }`; PUT 201 new / 200 updated; today / yesterday only. (Prompt 80) |
| `getMyProgress()` / `addMyProgress(body)` | GET / POST | `/api/client-auth/my-progress` | `{ date, weightKg?, adherence?, workoutsDone?, note? (<= 500) }` (strict) | GET own logs oldest first; POST 201, queued for the coach's review; today / yesterday only. (Prompt 80) |
| `getMyMeasurements()` / `addMyMeasurement(body)` / `deleteMyMeasurement(id)` | GET / POST / DELETE | `/api/client-auth/my-measurements[/:id]` | POST: the coach route's fields (strict) | GET own, newest first, with `createdBy`; POST 201 (`createdBy: "client"`); DELETE 204, 404 for a coach-added / unknown row. `requireActiveClient`. (Prompt 81) |
| `getMyMessages()` / `getMyUnreadCount()` / `sendMyMessage(body)` | GET / GET / POST | `/api/client-auth/my-messages`, `/my-messages/unread` | POST `{ body }` (strict, 1-2000) | GET `{ messages }` newest 100 oldest first (marks the coach's shown messages read); `{ count }`; POST 201 sender "client"; 429 over 60 / 15 min. `requireActiveClient`. (Prompt 82) |
| `getMyAccount()` / `saveMyAccount(body)` | GET / PATCH | `/api/client-auth/me/account` | PATCH `{ name?, timezone?: IANA \| null }` (strict) | GET `{ name, loginEmail, googleConnected, timezone }`; PATCH 204. (Prompt 83) |
| `changeMyPassword(current, next)` | POST | `/api/client-auth/change-password` | `{ currentPassword, newPassword }` | 204 + fresh cookie, other sessions end; 400 wrong current / Google-only. (Prompt 83) |
| `getMyPayments()` | GET | `/api/client-auth/my-payments` | — | `[{ id, paidOn, method, planName }]` own, newest first, no amounts. `requireActiveClient`. (Prompt 83) |
| `deleteMyAccount(body)` | DELETE | `/api/client-auth/me` | `{ password?, confirm: "DELETE" }` (strict) | 204 + cookie cleared; 400 wrong word / password; 403 Google sign-in older than 5 min. (Prompt 83) |
| `getMyTargets()` | GET | `/api/client-auth/my-targets` | — | `{ calorieTarget, proteinTargetG, weeklyCheckInDay }`. (Prompt 80) |
| `saveClientTargets(clientId, body)` | PATCH | `/api/clients/:clientId/targets` | `{ calorieTarget?: 300-15000 \| null, proteinTargetG?: 0-1000 \| null }` (strict) | the client; 404 another coach's client. `requireCoach`. (Prompt 80) |
| `getJoinCode()` | GET | `/api/join-code` | — | `JoinCode` `{ code, active, approveNewClients, link }`. The code (e.g. `ANNA-7K2Q8M`) is made on first use; `link` = `APP_URL` (else the Render URL, else the request origin) + `/join/<code>`. Needs `requireCoach`. (Prompt 76) |
| `regenerateJoinCode()` | POST | `/api/join-code/regenerate` | — | `JoinCode` with a NEW code; the old code stops working at once. Rate limited per coach (20 / 15 min). Needs `requireCoach`. (Prompt 76) |
| `updateJoinCode(patch)` | PATCH | `/api/join-code` | `{ active?: boolean, approveNewClients?: boolean }` (at least one; nothing else) | `JoinCode`. 400 `Nothing to change.` / `active must be true or false.` / `Only active and approveNewClients can be changed.` Needs `requireCoach`. (Prompt 76) |
| — (Prompt 77 join page) | GET | `/api/join/:code` | — | Public. `{ coachName }` for an active code (any letter case). 404 `This join code is not valid. Please ask your coach for a new one.` for an unknown, malformed OR turned-off code (one message, so codes cannot be probed). Rate limited (60 / 15 min per IP). (Prompt 76) |
| `getEngagement(date)` | GET | `/api/business/engagement?date=YYYY-MM-DD` | — (`date` optional, default today UTC; the UI sends its local date) | `{ date, clients: { clientId, clientName, rank (1-based, ties share; null = not enough data), checkInStreak, habitPercent (null = no active habits), workoutsThisWeek, enoughData }[] }` — ranked clients first, then unranked A-Z. 400 bad date; 401 signed out. Needs `requireCoach`. Business > Engagement only. (Prompt 71) |
| `getMyStreaks(date)` | GET | `/api/client-auth/my-streaks?date=YYYY-MM-DD` | — | `{ date, checkInStreak, habitPercent, workoutsThisWeek, enoughData }` — the signed-in CLIENT's own numbers only, no rank; 400 bad date; 401 without a **client** session (Prompt 71); 404 if the coach deleted the client record (Prompt 71) |
| `deleteAccount(password)` | DELETE | `/api/auth/account` | `{ password, confirm: "DELETE" }` | 204, session cookie cleared. Deletes the coach and EVERYTHING they own in one statement (Postgres cascades every child row); 400 wrong password or wrong confirm word; 401 signed out. Needs `requireCoach`, rate limited 5/15 min (Prompt 73) |
| `getMyPlan()` | GET | `/api/client-auth/my-plan` | — | `{ plan: { planName, status, nextDueDate } \| null, lastPaymentDate }` — the signed-in CLIENT's own plan only; no amounts |
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
| `listMeals()` | GET | `/api/meals` | — | `Meal[]` of the signed-in coach, A-Z by name (`name`, `createdAt`, `id`). Needs `requireCoach`. (Prompt 60) |
| `createMeal(input)` | POST | `/api/meals` | `NewMeal`: `{ name, mealType, calories, proteinG, carbsG, fatG, ingredients?, steps? }` | `Meal` 201 `{ id, coachId, name, mealType, calories, proteinG, carbsG, fatG, ingredients, steps, createdAt }`; 400 `{ error }` for a missing name, a mealType outside the four, a missing / negative / too-big number, calories not whole, or a too-long text |
| `updateMeal(mealId, input)` | PUT | `/api/meals/:mealId` | `NewMeal` (replaces every field) | `Meal`; 400 as above; 404 `{ "error": "Meal not found" }` (also for another coach's row) |
| `deleteMeal(mealId)` | DELETE | `/api/meals/:mealId` | — | 204, no body; 404 `{ "error": "Meal not found" }` |
| `calculateMacros(input)` | POST | `/api/macros` | `MacroInput`: `{ weightKg (>0, max 500), heightCm (>0, max 300), age (whole 1-120), sex ("Female" \| "Male"), activity ("Sedentary" \| "Light" \| "Moderate" \| "Active" \| "Athlete"), goal (1-100 chars) }` | `MacroResult` 200 `{ bmr, tdee, calories, proteinG, carbsG, fatG }` (whole numbers). Stateless, nothing saved. 400 `{ error }` for bad input and, with `"Macros are only calculated for adults aged 18 or older."`, for an age under 18. Needs `requireCoach`. (Prompt 61) |
| `getTodayTasks(date)` | GET | `/api/tasks/today?date=YYYY-MM-DD&tz=<minutes>` | — (`date` optional, default today UTC; the UI sends its local date. **Prompt 69:** `tz` optional whole number of minutes, default 0 = UTC, the browser's `Date.getTimezoneOffset()` (India -330), so "today's appointments" means the coach's local day; 400 when not a number or beyond +-14 h) | `{ date, tasks: TodayTask[] }` (`TodayTask` in `types.ts`). **Prompt 69: the FIRST rows are today's Booked appointments** - one `{ kind: "appointment", clientId, clientName, appointmentId, appointmentType, startsAt, endsAt, text }` each (`startsAt` / `endsAt` UTC ISO, soonest first; `text` is `Type: Title`; Done / Cancelled / No-show are not listed), then the rows below. Per client of the signed-in coach, one `{ kind: "due", clientId, clientName, assignmentId, assignmentType, text }` for each **Active** assignment dated that day, and one `{ kind: "idle", clientId, clientName, daysSince (null = no assignment ever), text }` for a client whose latest assignment date is 7+ days before `date` (or who has none; a plan dated ahead counts as covered). Due rows first, then idle, clients oldest first. 400 bad date; 401 signed out. Needs `requireCoach`. Home tab only (Prompt 48). |
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
- Prompt 60: the prompt named no routes; meals are coach-level, so they live at `/api/meals`. Unlike templates, "Assign to client"
  saves the Nutrition assignment straight away (the prompt says "creates"), with the success line shown in the panel. Calories,
  protein, carbs and fat are all required (the prompt did not say); ingredients and steps are optional.
- Prompt 61: the prompt named no route; the calculation is `POST /api/macros` (coach-level, stateless). "Goal from the existing goal
  list" is a text box with the list as suggestions (goal is free text everywhere else); "Fat loss + strength" counts as fat loss, like
  the at-risk rule. Saving reuses the existing `POST /api/clients/:clientId/assignments`.
- Prompt 69: the prompt named no routes; appointments are coach-level, so they live at `/api/appointments` (a coach's whole calendar,
  not under one client), and the client's list is `GET /api/client-auth/my-sessions` next to `my-plan`. `/api/tasks/today` gained an optional
  `tz` parameter and a new `kind: "appointment"` row (an existing route extended, as the prompt asked). The Business switch has
  Payments / Schedule only: "Reports" does not exist yet. A today's-appointment row on Home has no button (there is no tab to open for it).
  Appointment ids and the UTC range come from the browser; the server never guesses a coach's timezone.
- Prompt 70: the prompt named no routes; reports are coach-level, so they live at `/api/reports` (`roster`, and per client `export/:type` and
  `progress-report`). The report is a JSON endpoint plus a React page printed by the browser (no PDF library). "Check-in averages" use the daily
  check-ins; the CSV files add a UTF-8 BOM and a formula guard (the prompt did not say). Invoices stay out (the Business note still says so).
- Prompt 71: the prompt named no routes; the leaderboard is `GET /api/business/engagement` (coach) and the client's line is `GET /api/client-auth/my-streaks`.
  Chosen place: Business > Engagement (the Business switch got a 4th button, so it now wraps on phones). "Habit completion %" uses the Prompt 54 definition
  (a rolling last 7 days), "this week" for workouts is Monday-Sunday, and "not enough data" means no check-in ever and no habit tick in the last 7 days.
  Check-in, habit-log and assignment dates are all `YYYY-MM-DD` day strings, so the viewer's local
  date in `?date=` is the whole timezone story here: do NOT add the `tz`/`tzEnd` offsets appointments need.
- A later message proposed different shapes (`{ clients: [...] }` sorted A–Z, `{ id }` on
  create, `{ ok: true }` on delete). The user chose to keep this contract.
