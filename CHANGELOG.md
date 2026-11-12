# Changelog

One line per build prompt, with its commit. Prompts 1 and 6–10 are matched by content, because
those commit messages don't name the prompt number.

| Prompt | Commit | Message |
|---|---|---|
| 1 | `8df0bfe` | Initial commit |
| 2 | `d778164` | Prompt 2: README, Node .gitignore, empty .env.example |
| 3 | `c415d4d` | Prompt 3: scaffold client (React/Vite/TS/Tailwind) and server (Express/TS), health check |
| 4 | `29936ac` | Prompt 4: database layer (Prisma models, init migration, DB connect on startup) |
| 5 | `f8a74cd` | Prompt 5: Repsy design system (theme.css variables + Tailwind tokens) |
| 6 | `b8a1670` | Phase 2: app shell - header strip and horizontal Chrome-style tabs |
| 7 | `67dbb82` | Phase 2: frontend data layer - typed API wrapper, shared types, selected client |
| 8 | `23efa7a` | Phase 2: client selector strip (TEMP sample clients) |
| 9 | `971c28b` | Phase 2: shared empty / loading / error states |
| 10 | `971adbb` | Phase 2: chat storage (read-only endpoint) and AI Coach chat view |
| 11 | `65c4776` | Phase 2 Prompt 11: Clients API and remove TEMP data |
| 12 | `7f9e5d8` | Phase 2 Prompt 12: Clients tab with client cards |
| 13 | `23c2e98` | Phase 2 Prompt 13: add-client form on the Clients tab |
| 14 | `0dec840` | Phase 2 Prompt 14: safe client delete |
| 15 | `012607b` | feat(ai): ask endpoint with client context and fallback |
| 16 | `62a11ef` | feat(ai): coach chat ui with quick prompts and suggestions |
| 17 | `01805b2` | feat(ai): assign from ai suggestion with reasoning |
| 18 | `8007f13` | feat(ai): auto-assign workout nutrition habit recovery |
| 19 | `f73cfba` | feat(planner): assignments list with type filters |
| 20 | `69ae7ad` | feat(planner): manual assignment form |
| 21 | `336c323` | feat(planner): exercise library with live search |
| 22 | `41bed44` | feat(planner): sets reps and rest per exercise |
| 23 | `8676b77` | feat(planner): save exercise rows as numbered workout plan |
| 24 | `12eacc9` | feat(planner): assignment status control and delete |
| 25 | `7f1fcd3` | feat(api): progress logs endpoints with validation |
| 26 | `89ad003` | feat(progress): stat cards from real progress data |
| 27 | `ea2c9bb` | feat(progress): weight adherence and by-type charts |
| 28 | `87aaf55` | feat(progress): weekly check-in form |
| 29 | `59a6016` | feat(demo): 3-client quick demo seed |
| 30 | `26a39d7` | feat(demo): 10 clients with 26 weeks of generated history |
| 31 | `42f5a31` | feat(demo): demo assignments and idempotent demo controls |
| 32 | `337b0da` | chore(deploy): render blueprint and production server setup |
| 33 | `c7e4a0b` | docs: document render deployment and live url |
| 34 | `edfcca1` | chore: add v1 footer (redeploy check) |
| 35 | `f7a8cba` | style: mobile accessibility and error polish |
| 36 | `(this commit)` | docs: final v1 check, readme and changelog |

## v2

v2 turns the single-coach prototype into a multi-coach product with a public site and a client area.

- **Public landing page** at `/` (Prompts 37-42): the animated live-sheet hero (the 3D hero stays at
  `/?hero=3d`), scroll animations, an in-page demo, pricing, FAQ and a lead form. Privacy and Terms
  drafts at `/privacy` and `/terms` (Prompt 73).
- **Login** (Prompts 43-47): coach accounts, register / log in / log out, every route scoped to the
  signed-in coach, password reset and account settings. The first coach to register claims the
  unclaimed demo data.
- **5 new tabs, 9 in total** - Home, AI Coach, Clients, Manual Planner, Progress, **Check-ins**,
  **Library**, **Messages**, **Business** - plus Home rebuilt as the coach's daily view:
  - **Home** (48-52): today's tasks, new check-ins, needs-attention alerts, AI weekly summary,
    review queue.
  - **Check-ins** (53-56): daily check-ins, habit tracker, sleep and recovery, body measurements.
  - **Library** (58-61): workout templates, meal library, macro calculator.
  - **Messages** (63-64): a thread with each client.
  - **Business** (68-71): plans and recorded payments, the schedule, the engagement leaderboard and
    reports with CSV export.
- **Client app** (Prompts 65, 68, 69, 71): invited clients sign in at `/client` and see their own
  plan, sessions and streaks (read-only).
- **Security and privacy pass** (73), the **full v2 end-to-end journey** in CI (74), and the
  **live deploy and smoke test** (75).

Prompts 57, 59, 62, 66, 67 and 72 were dropped by the owner and have no commit.

| Prompt | Commit | Message |
|---|---|---|
| 37 | `2da8d3e` | Prompt 37: Landing route, shell and 3D foundation |
| 38 | `8f26c3f` | Prompt 38: Interactive 3D hero |
| 39 | `eaa767f` | Prompt 39: Scroll animations and feature story |
| 40 | `380cada` | Prompt 40: Interactive landing page demo |
| 41 | `af230e9` | Prompt 41: Pricing, FAQ and lead capture |
| 42 | `cce392e` | Prompt 42: Landing speed, SEO and accessibility |
| 43 | `dc314ad` | Prompt 43: Coach model and coachId migration |
| 44 | `be82fe8` | Prompt 44: Register, login and session API |
| 45 | `6b4006c` | Prompt 45: Protect all routes by coach |
| 46 | `b8f51c9` | Prompt 46: Login screens and app guard |
| 47 | `00a9a9c` | Prompt 47: Password reset and account settings |
| 48 | `c6fa5c6` | Prompt 48: Home tab and today's tasks |
| 49 | `501d983` | Prompt 49: Home new check-ins card |
| 50 | `438e21d` | Prompt 50: At-risk clients card |
| 51 | `5cb3fbe` | Prompt 51: AI weekly summary |
| 52 | `6599fb8` | Prompt 52: Review queue |
| 53 | `909cae5` | Prompt 53: Check-ins tab and daily check-ins |
| 54 | `8cb2180` | Prompt 54: Habit tracker |
| 55 | `cdc2180` | Prompt 55: Sleep and recovery |
| 56 | `c375333` | Prompt 56: Body measurements |
| 58 | `9d8dd13` | Prompt 58: Library tab and workout templates |
| 60 | `06a0354` | Prompt 60: Meal library |
| 61 | `e1d691f` | Prompt 61: Macro calculator |
| 63 | `f6ec998` | Prompt 63: Messages tab and chat data |
| 64 | `d1da50b` | Prompt 64: Coach chat UI |
| 65 | `b7e9c10` | Prompt 65: Client invite and client sign-in |
| 68 | `4770c2e` | Prompt 68: Business tab - client plans and recorded payments (record-keeping only), due-date advance on a stored due day, currency setting, client My plan |
| 69 | `392629c` | Prompt 69: Scheduling - appointments (UTC stored, local shown), Business Schedule week view, client My sessions, today's appointments first on Home |
| 70 | `ec69f98` | Prompt 70: Reports - printable client progress report (browser print to PDF), coach-scoped CSV exports and roster CSV |
| 71 | `c9e4d34` | Prompt 71: Engagement - check-in streaks, habit % and weekly workouts, coach-only leaderboard in Business, client My streaks |
| 73 | `0cf365e` | Prompt 73: security and privacy pass - drop wildcard CORS, hand-written security headers + CSP, rate-limit leads, delete-account with type-to-confirm, Privacy/Terms drafts, bundle secret guard |
| 74 | `f439038` | Prompt 74: full v2 end-to-end journey (13 named checks), trim duplicated v1 smoke checks, keep the real-server suite at 30 |
| 75 | `7979c69` | Prompt 75: deploy v2 and live smoke test, CHANGELOG and README for v2 |

### v3: the client app (Nov 2026)

| Prompt | Commit | Message |
|---|---|---|
| 76 | `d6602db` | Prompt 76: coach join code + Invite clients panel (code, link, copy, share, QR, on/off, approval switch) |
| 77 | `61f6161` | Prompt 77: join by code - client sign-up with email, welcome questions, approval waiting screen, client forgot/reset password |
| 78 | `41caf04` | Prompt 78: Continue with Google for clients (sign in + join with code) via the shared callback |
| 79 | `b2d7d0e` | Prompt 79: client app - Today, This week, plan view with checklist + rest timer + Finish workout, Me; coach sees Done by client |
| 80 | `86fb34d` | Prompt 80: client habits, daily + weekly check-ins, nutrition targets and meals; coach meal picker and save-as-targets |
| 81 | `3e5eca6` | Prompt 81: client Progress tab - charts in the client's unit (lazy), body measurements (add, delete own), streaks |
| 82 | `2dad8a5` | Prompt 82: client messages - own thread with their coach, Enter to send, 20 s polling, unread badge |
| 83 | `9a6f822` | Prompt 83: client Me tab - profile, change password, Google status, timezone, payment history (no amounts), delete my account |
| 84 | `9c8b03d` | Prompt 84: coach side - waiting-for-approval list with approve/decline, Joined with code badge, Home client activity alerts |
| 85 | `(this commit)` | Prompt 85: client app end-to-end journey (real server), exhaustive client-route security pass, live smoke, README / CHANGELOG v3 |

Other commits (not one prompt each):

| Commit | Message |
|---|---|
| `3af2300` | Phase 1.5a: CLAUDE.md, coachId placeholder, colour contrast fix |
| `c6eb6f4` | Phase 1.5b: render.yaml and first Render deploy |
| `d9b790d` | Phase 1.5c: minimal tests and CI |
| `50dc6f6` | Merge phase-1.5a: CLAUDE.md, coachId placeholder, colour contrast fix |
| `267582c` | Phase 2.5a: Render deploys after CI, API contract, dark header fix |
| `5900965` | Phase 2.5b: Playwright smoke tests for shell, strip and states |
| `e3a182a` | Phase 2.5c: Cache Playwright in CI |
| `04ea904` | ci: run mocked UI tests |
| `fae554f` | docs: record contract notes for prompts 29-32 |
| `5770460` | fix: review follow-ups for progress, seeds, check-in form and focus |
| `458044a` | Prompt 77 fix: client-auth DB test expects the new /me and login shape |
| `71c896d` | Prompt 79 fix: v2 journey step 8 - the client app opens on Today |
| `e0e7bba` | Prompt 80 fix: one query for a plan + its meal ids; DB test checks the review item directly |
| `c73c35b` | Prompt 84 fix: DB test checks data access via my-targets |
| `20a91b0` | Publish the Privacy Policy and Terms for Google OAuth branding (prerendered /privacy and /terms) |
| `ea6e8ca` | render.yaml: paid plans to match the dashboard |
