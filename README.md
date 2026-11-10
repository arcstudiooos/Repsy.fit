# Repsy Coach

Repsy Coach is a web dashboard for a fitness coach. Pick a client, ask an AI assistant about
them, turn its suggestions into plans (or plan by hand), and track the client's weekly progress
in cards and charts.

Live: https://repsy-coach.onrender.com (public landing page) - the dashboard is at
https://repsy-coach.onrender.com/app

## The 4 tabs

| Tab | What it does |
|---|---|
| **AI Coach** | Chat with the AI about the selected client. Their profile (goal, level, weight, focus, notes) plus recent plans and check-ins are sent as context. Quick prompts ("Summarise this client", "Make a workout plan", ...), a suggestion card you can assign in one tap, and one-tap auto-assign for a Workout, Nutrition, Habit or Recovery plan. |
| **Clients** | All clients as cards: add a client, open one in the AI Coach, delete one (with a confirmation; their plans, check-ins and chat are deleted too). Also the demo data buttons. |
| **Manual Planner** | The client's plans, newest first, filterable by type. Create a plan by hand; for a Workout, search the exercise library and set sets, reps and rest per exercise (saved as `1. Back Squat — 4 sets × 6 reps · Rest 120s`). Mark plans Active, Done or Paused, or delete them. |
| **Progress** | Stat cards (current weight and change, average adherence, total workouts, plan completion), weight and adherence line charts, an assignments-by-type bar chart, a weekly check-in form and the check-in history. |

A client selector strip above every tab except Clients chooses whose data you see.

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
  `/app` goes over 220 KB gz, or if any 3D or animation code gets into either one.

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
| `PORT` | No | Port to listen on. Render sets it; the local default is 3001. |

Without the AI values the app still works: the AI Coach gives a fallback answer built from the
client's data, and auto-assign says "Nothing was saved".

## Tests

| Command | What it runs |
|---|---|
| `npm test` | Server tests (Vitest + Supertest). Database tests run when `DATABASE_URL` is set and skip otherwise. |
| `npm run test:ui` | Browser tests with a faked API — no database or AI key needed. Run `npm run build` first. |
| `npm run test:e2e` | Browser tests against the production server and a real database, including the full coach journey (`e2e/journey.spec.ts`). Run `npm run build` first. They **delete all clients**, so use a test database; they refuse to run against a Render database. |

CI (`.github/workflows/ci.yml`) runs on every push to `main`: install, build, migrate a fresh
Postgres 16, then all three test suites.

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

## Known limits of v1

- **No login yet.** Anyone with the URL can use the app, including the demo buttons.
- **Single coach.** Every record belongs to one placeholder coach (`default-coach`).
- **AI is general-wellness only and can be wrong.** It doesn't diagnose; the coach reviews every
  plan before using it. Without a working AI key you get the fallback answer.
- **Demo data is sample data.** Names and numbers are made up; delete any client at any time.

Project rules for contributors and AI coding agents are in `CLAUDE.md`; the change history is in
`CHANGELOG.md`.
