# Repsy Coach

Repsy Coach is a web app for a fitness coach. Pick a client, ask an AI assistant about them, turn
its suggestions into plans (or plan by hand), track their progress, habits and check-ins, message
them, schedule sessions and record what they pay - and invite them to see their own plan.

Live: https://repsy-coach.onrender.com (public landing page) - the dashboard is at
https://repsy-coach.onrender.com/app, sign in at `/login`, and invited clients use `/client`.

**v2 is live.** A live smoke test on 2026-11-12 passed every step: the landing page, the lead form,
register, log in, create a client, the invite link, the client sign-in and plan page, a chat round
trip, recording a payment, a CSV export, log out, and signed-out `/app` going to the login page.
Read the database note under *Known limits* before adding real clients.

## The 9 tabs

Sign in at `/login` (or create an account at `/register`). Each coach sees only their own clients.

| Tab | What it does |
|---|---|
| **Home** | Today's Tasks (today's appointments first, then plans due today), new check-ins, **Needs attention** (the smart alerts, each with its reason: low adherence, no recent check-in, weight moving against the goal, or poor sleep), the AI weekly summary, and the review queue of parked AI suggestions and new check-ins. |
| **AI Coach** | Chat with the AI about the selected client, with their profile, recent plans and check-ins as context. A suggestion card you can assign in one tap, or park in the review queue, and one-tap auto-assign for a Workout, Nutrition, Habit or Recovery plan. |
| **Clients** | All clients as cards: add, open in the AI Coach, delete (everything that belongs to them goes too), and invite a client to sign in. Demo data buttons. |
| **Manual Planner** | The client's plans, newest first, filterable by type. Build a plan by hand or from a Library template; for a Workout, search the exercise library and set sets, reps and rest. Mark plans Active, Done or Paused. |
| **Progress** | Stat cards, weight and adherence charts, assignments by type, a weekly check-in form and the history. |
| **Check-ins** | Daily check-ins (energy, mood, sleep hours, recovery) with a sleep and recovery card, the habit tracker with streaks, and body measurements. |
| **Library** | Workout templates and the meal library, plus the macro calculator. Coach-level, shared across your clients. |
| **Messages** | A message thread with each client. |
| **Business** | Four views: **Payments** (client plans and payments you record by hand - no charging, no payment links), **Schedule** (a week of appointments, stored in UTC and shown in your timezone), **Engagement** (a leaderboard ranked by check-in streak, then habit %, with all three numbers shown) and **Reports** (a printable progress report and CSV exports). |

A client selector strip above most tabs chooses whose data you see.

## The client app

Clients get their own phone-first app at `/client` (cream / orange, bottom tabs on phones, header tabs on
wider screens). How they get in:

- **Join code** - each coach has a code, link and QR code (Clients tab -> Invite clients). A client opens
  `/join/<code>` and signs up with email or **Continue with Google**, answers a few welcome questions (goal,
  age, height, weight, experience, injuries, kg / lb) and lands in the app. With "Approve new clients" on,
  they wait until the coach approves them (Clients tab -> Waiting for approval).
- **Personal invite** - the coach can still invite one client by email; the client sets a password at
  `/client/set-password`. Forgot / reset password works for clients too.

What a client can do (only ever with their OWN data):

| Tab | What it does |
|---|---|
| **Today** | Today's plans by type with Mark done, habits to tick, "How was today?" daily check-in, weekly check-in (on their chosen day), next session, streaks |
| **Week** | Monday-Sunday with every plan and its done / pending state |
| **Plan view** | Numbered exercises with sets, reps and rest, a rest timer, the coach's "why"; **Finish workout** with an effort rating (1-10) and a note. Nutrition plans show their calorie / protein targets and the meals the coach picked |
| **Progress** | Weight and adherence charts (in kg or lb), body measurements (add; delete their own), streaks |
| **Messages** | Their thread with the coach: Enter to send, refreshed every 20 seconds, unread badge, "Seen" |
| **Me** | Membership and payment history (dates only, never amounts), sessions in their timezone, profile, kg / lb, change password (or "connected with Google"), weekly check-in day, sign out, **delete my account** |

The coach sees it all straight away: "Done by client" with effort and note on the plan, client check-ins in
the review queue, client messages in Messages, and a **Client activity** card on Home (waiting for approval,
new messages, plans finished in the last 24 hours, who joined this week).

A client session is separate from a coach session: it gets `401` on every coach route; a coach session gets
`401` on every client route; a client waiting for approval gets `403` on every data route. A client never
sees another client, the coach's notes, the AI Coach chat, at-risk flags or amounts, and can't edit plans.
`server/test/security.test.ts` lists every `/api/client-auth` route and fails if a new one isn't covered.

## Landing page

`/` is the public landing page and `/app` is the dashboard. The landing page has:

- an animated "live sheet" hero built in React and CSS (design A1, see `DESIGN.md`), with a
  Pause button; the interactive 3D hero (Three.js, built from code) is kept at `/?hero=3d`
- scroll animations (GSAP)
- a front-end-only demo, which makes no API calls
- pricing, an FAQ, and a "Start free" form that posts to `POST /api/leads`

The landing code lives in `client/src/landing/`, and its design rules are in
`client/src/landing/DESIGN.md`.

**Speed:**

- Three.js, GSAP and the demo each load in their own lazy chunk.
- The 3D scene only starts after the page has loaded and the browser is idle.
- Fonts don't block the first paint.
- `client/scripts/check-budget.mjs` fails the build if the first load goes over 90 KB gz, if
  `/app` goes over 130 KB gz, or if any 3D or animation code gets into either one.
  The chart tabs (Progress, Check-ins) and the Library tab load on first open, so Recharts is not
  part of the dashboard's first download.

**Fallbacks:** phones under 768px, reduced motion, missing WebGL, software-only WebGL and
WebGL errors all get a static poster instead of the 3D scene. Rendering also pauses when the
hero is scrolled off-screen.

**Lighthouse** (Lighthouse 12, landing page `/`, run on 2026-11-10):

| Run | Performance | Accessibility | Best practices | SEO |
|---|---|---|---|---|
| Desktop, 3D on, live site | 95 | 100 | 100 | 100 |
| Mobile, poster mode, live site | 86 | 100 | 100 | 100 |
| Desktop, 3D on, local build without compression | 97 | 100 | 100 | 100 |
| Mobile, poster mode, local build without compression | 86 | 100 | 100 | 100 |

Phones always get the poster, by design, so there is no separate mobile score with 3D on.
The mobile run is the same fallback mode that reduced-motion and no-WebGL visitors get. It
scores 86, below the 90 target. First paint waits for the JavaScript bundle, because the
landing page is rendered by React.

## Stack

- **Client:** React + TypeScript (Vite), Tailwind CSS, TanStack React Query, Recharts
- **Server:** Node.js + Express + TypeScript, Zod validation
- **Database:** PostgreSQL via Prisma (migrations in `server/prisma/migrations`)
- **AI:** any OpenAI-compatible chat API, called from the server only
- **Tests:** Vitest + Supertest (server), Playwright (browser)
- **Hosting:** Render (1 Web Service + 1 PostgreSQL); CI on GitHub Actions

## Run locally

Requires Node.js 22 (what Render and CI use) and a PostgreSQL database.

```bash
cp .env.example .env               # fill in DATABASE_URL (and the AI_* values if you have them)
npm install
npx -w server prisma migrate deploy
npm run dev
```

`npm run dev` starts the API on http://localhost:3001 and the client on http://localhost:5173 —
open the client URL. Production mode: `npm run build`, then `npm start` (one server serves the
built client and the API, and applies migrations on start).

## Environment variables

| Name | Needed | Where the value comes from |
|---|---|---|
| `DATABASE_URL` | Yes | Your Postgres connection string. On Render it is filled in automatically from the linked database. |
| `AI_API_KEY` | For real AI answers | Your AI provider's secret key. Put it in `.env` locally or in the Render dashboard — never in code or chat. |
| `AI_BASE_URL` | For real AI answers | Your provider's OpenAI-compatible base URL, e.g. `https://api.openai.com/v1`. |
| `AI_MODEL` | For real AI answers | The chat model name to use. |
| `SESSION_SECRET` | In production | A long random string (16+ characters) that signs login cookies. `render.yaml` makes Render generate one. Without it in production, register and login answer "Sign-in is not available right now" (logged). Locally a temporary secret is used. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | For password-reset emails | Your email provider's SMTP settings (port 587 with STARTTLS by default; `SMTP_SECURE=true` for port 465). `SMTP_HOST` and `SMTP_FROM` are the minimum. Without them, no reset email is sent: development prints the reset link in the server console only, production logs that email is not set up. Set them in `.env` locally or the Render dashboard. |
| `APP_URL` | For password-reset emails | The public address of the app (e.g. `https://repsy-coach.onrender.com`), used to build the link in the email. On Render it falls back to `RENDER_EXTERNAL_URL`; locally to `http://localhost:5173`. |
| `PORT` | No | Port to listen on. Render sets it; the local default is 3001. |
| `NODE_ENV` | Recommended in production | Set it to `production` in the Render dashboard. Session cookies are marked `Secure` when `NODE_ENV=production` **or** Render's own `RENDER` variable is set, so they are secure on Render either way. |

Without the AI values the app still works: the AI Coach gives a fallback answer built from the
client's data, and auto-assign says "Nothing was saved".

## Tests

| Command | What it runs |
|---|---|
| `npm test` | Server tests (Vitest + Supertest). Database tests run when `DATABASE_URL` is set and skip otherwise. |
| `npm run test:ui` | Browser tests with a faked API — no database or AI key needed. Run `npm run build` first. |
| `npm run test:e2e` | 30 browser checks against the production server and a real database: the v1 coach journey (`e2e/journey.spec.ts`), the **full v2 journey** (`e2e/v2-journey.spec.ts`: landing and lead form -> register -> client -> template -> plan -> payment -> invite -> the client signs in -> mark done, check-in, message -> Home, weekly summary, CSV -> delete the account), sign-in isolation and a production smoke set. Run `npm run build` first. They **delete all clients**, so use a test database; they refuse to run against a Render database. |

CI (`.github/workflows/ci.yml`) runs on every push to `main`: install, build, migrate a fresh
Postgres 16, then all three test suites. A full run takes about 8 minutes (npm and Playwright browser caches
apply); the two v1 AI-assign checks skip in CI because it has no AI key, by design.

## Deploy on Render

Live: https://repsy-coach.onrender.com — 1 Web Service + 1 PostgreSQL, defined in `render.yaml`.
Render deploys `main` **only after CI passes** (`autoDeployTrigger: checksPass`), so a commit with
failing CI never goes live.

1. Render dashboard → **New → Blueprint** → pick this GitHub repo. Render reads `render.yaml` and
   shows 1 Web Service (`repsy-coach`, Node, free plan) and 1 PostgreSQL (`repsy-db`, free).
2. Set the environment variables in the Render dashboard (table above). `DATABASE_URL` comes from
   the linked database — don't type it. Paste `AI_API_KEY` into Render only.
3. Apply the Blueprint. The build runs `npm ci --include=dev && npm run build`; `npm start` runs
   `prisma migrate deploy` and then the server. Wait for `Repsy Coach server listening` in the log.
4. Check https://repsy-coach.onrender.com/api/health shows `{"ok":true,"db":true}`.
   `503 {"ok":false,"db":false}` means the database isn't answering.

Each push to `main` then redeploys about 2 minutes after CI finishes. The free plan sleeps when
idle, so the first request after a while can take about a minute.

If the AI Coach only gives the "Here's what I can see for ..." answer, the AI call is failing —
usually `AI_API_KEY`, `AI_BASE_URL` or `AI_MODEL` is missing or wrong in Render.

## Demo data

On the Clients tab:

- **Load demo clients** (on the empty screen) or **Load demo**: 3 sample clients (Maya Patel,
  Arjun Mehta, Casey Jordan), each with 3 weekly check-ins and a starter plan. It only loads into
  an empty client list; otherwise it says "Demo already loaded".
- **Load 6-month demo (10 clients)**: 10 more clients, each with 26 weekly check-ins
  (2026-05-11 to 2026-11-02) and 5 plans. Clients whose name already exists are skipped, so it
  never duplicates anything.

Load the quick demo first, then the 6-month demo, to get all 13 clients.

## Known limits

- **Hosting is on paid plans** (Nov 2026): web service `starter`, database `basic-256mb` (no expiry,
  with backups). Keep `render.yaml` in step with the dashboard, or a Blueprint sync can change the plan.
- **No payment gateway.** Payments are records only: nothing charges a card, sends a payment link
  or reminder, or makes an invoice.
- **No push or email alerts.** Alerts (Client activity, Needs attention, new check-ins, the review
  queue) show only when the coach opens Home, and a client sees new messages when they open the app;
  nothing is pushed or emailed.
- **Chat by polling.** The Messages tab checks for new messages every 20 seconds while it is open;
  there is no live socket.
- **Sleep is entered by hand** in daily check-ins; nothing syncs from a watch or phone.
- **AI is general-wellness only and can be wrong.** It doesn't diagnose; the coach reviews every
  plan before it reaches a client. Without a working AI key you get the fallback answer.
- **Client app limits (v3).** Clients tick exercises and finish workouts but don't log the actual weights
  lifted. Daily and weekly check-ins can be entered for today or yesterday only. Clients can't change their
  coach or sign-in email themselves. One coach per client account. Payment history shows dates, never
  amounts. Deleting a client account also deletes the coach's plan and payment records for that client.
- **No progress photos.** The app does not store photos.
- **Password-reset and invite emails need SMTP.** Until the `SMTP_*` variables are set, reset
  emails are not sent and invite links are shown to the coach to pass on by hand.
- **Rate limits are per server process.** They reset when the server restarts, which is fine for
  one Render instance but would need a shared store to scale out.
- **Privacy Policy and Terms** at `/privacy` and `/terms` are published (Nov 2026) but have not been reviewed by a lawyer.
- **CI takes about 8 minutes**, above the 5-minute target.
- **Demo data is sample data.** Names and numbers are made up; delete any client at any time. It
  counts exactly like real entries, so a seeded client can top the Engagement leaderboard.

Project rules for contributors and AI coding agents are in `CLAUDE.md`; the change history is in
`CHANGELOG.md`.
