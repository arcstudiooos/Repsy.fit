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
