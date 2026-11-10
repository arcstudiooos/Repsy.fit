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
| `--header` | `#141414` | same | header strip background | `bg-header` |
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
