# Repsy Coach

Coach dashboard: pick a client, ask AI, auto assign plans with reasoning, or plan manually. Progress in charts.

## Run locally

Requires Node.js 20 or newer.

```bash
npm install
npm run dev
```

`npm install` (run once, from the repo root) installs the client and server packages.
`npm run dev` starts the server on http://localhost:3001 and the client on http://localhost:5173 — open the client URL.

Production: `npm run build` then `npm start` (serves the built client and the API from one server).

## Tests

`npm test` runs the server smoke tests (Vitest + Supertest): health check, database connected,
create client, list clients. They need `DATABASE_URL` (read from `.env` locally) and clean up
after themselves.

Run `npm run build` before `npm run test:e2e` (the browser tests run against the built app).
The browser tests **delete all clients** to set up each test, so point `DATABASE_URL` at a test
database (they refuse to run against a Render database).

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs on every push to `main`: install, build,
apply migrations to a throwaway Postgres 16, `npm test`, then the browser smoke tests against
the production server (`npm start`) and the mocked UI tests (`npm run test:ui`).

## Deploy on Render

Live: https://repsy-coach.onrender.com — 1 Web Service + 1 PostgreSQL, defined in `render.yaml`.
Render deploys `main` **only after CI passes** (`autoDeployTrigger: checksPass`), so a commit
with failing CI never goes live. On start, `npm start` applies database migrations
(`prisma migrate deploy`) and then starts the server. Secrets (`AI_API_KEY` etc.) are set in the
Render dashboard, never in code.

Health check: `GET /api/health` returns `{ "ok": true, "db": true }`, or `503 { "ok": false, "db": false }`
when the database doesn't answer.

### Steps (first deploy)

1. Render dashboard -> **New -> Blueprint** -> pick this GitHub repo. Render reads `render.yaml`
   and shows 1 Web Service (`repsy-coach`, Node, free plan) and 1 PostgreSQL (`repsy-db`, free).
2. Environment variables (set in the Render dashboard, never pasted into chat or code):
   - `DATABASE_URL` - filled in automatically from the linked `repsy-db` database. Don't type it.
   - `AI_API_KEY` - your AI provider key. Paste it in Render only.
   - `AI_BASE_URL` / `AI_MODEL` - your OpenAI-compatible provider's base URL and model name
     (for example `https://api.openai.com/v1` with a chat model).
   - `PORT` - set by Render; the server reads `process.env.PORT` (never hard-coded).
3. Apply the Blueprint. The build runs `npm ci --include=dev && npm run build`; the start command
   `npm start` runs `prisma migrate deploy`, then the server. Watch the deploy log until it says
   `Repsy Coach server listening`.
4. Check `https://repsy-coach.onrender.com/api/health` shows `{"ok":true,"db":true}`.

After that, every push to `main` redeploys automatically once CI passes (about 2 minutes after CI
finishes). The free plan sleeps when idle, so the first request after a while can take ~1 minute.

If the AI Coach only gives the "Here's what I can see for ..." answer, the AI call is failing
(usually `AI_API_KEY`, `AI_BASE_URL` or `AI_MODEL` missing or wrong in Render) - the app still
works, using the fallback answer.
