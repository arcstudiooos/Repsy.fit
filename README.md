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

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs on every push to `main`: install, build,
apply migrations to a throwaway Postgres 16, then `npm test`.

## Deploy (Render)

Live: https://repsy-coach.onrender.com — 1 Web Service + 1 PostgreSQL, defined in `render.yaml`.
Render deploys `main` **only after CI passes** (`autoDeployTrigger: checksPass`), so a commit
with failing CI never goes live. On start, `npm start` applies database migrations
(`prisma migrate deploy`) and then starts the server. Secrets (`AI_API_KEY` etc.) are set in the
Render dashboard, never in code.

## TEMP: `?tempState`

Until the real clients API exists, the app uses sample clients and lets you preview each
screen state by adding `?tempState=` to the URL:

| URL | Shows |
| --- | --- |
| `/` | the 3 sample clients (default) |
| `/?tempState=empty` | the empty state (no clients) |
| `/?tempState=loading` | the loading state |
| `/?tempState=error` | the error state with Retry |

This is TEMP code (`client/src/tempSampleClients.ts`) and will be removed in Prompt 11.
