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
