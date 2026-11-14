# Inspo Features — what Spur.fit does, and what Repsy should take from it

**Source:** 31 screenshots of **Spur.fit** (`trainer.spur.fit`), captured Nov 2026, analysed screen by screen.
**Purpose:** a build reference. Every row below says what the feature is, what it does for a coach,
where it lives in their UI, what Repsy has today, and the gap.
**Rule:** inspiration, not imitation. Repsy's constraints (see §6) still win over anything here.

---

## 1. The one thing that matters most

Read this before the feature list, because it explains most of the distance between the two products.

**In Repsy, a workout is a block of text.** The `Assignment` model is:

```
type ("Workout" | "Nutrition" | "Habit" | "Recovery")
title    String
details  String      <- the entire workout lives in here, as prose
date     String       (YYYY-MM-DD, one day)
status   String
```

**In Spur.fit, a workout is structured data**, nested five levels deep:

```
Program -> Phase -> Week -> Day -> Workout -> Section -> Exercise -> Set
```

Almost every impressive thing in these 31 screenshots is a *downstream consequence* of that one
modelling decision, not a separately-built feature:

| What looks impressive | Why they can do it |
|---|---|
| "12, 12, 10 Reps" per-set progression | sets are rows, not prose |
| Live "Estimated Time: 00:00:00" | durations are numbers it can sum |
| Auto-matched exercise video thumbnails | exercises are FK rows into a library |
| Strength reports, PRs, volume trends | logged sets are comparable over time |
| Drag-and-drop reorder | items have an order column |
| AI output rendered as a real workout | the AI fills a schema, it doesn't write prose |
| Week x Day grid with "21 total workouts" | days are rows it can count |

Repsy's `WorkoutTemplate.exercises` is `Json` — a half-step: structured enough to store, too untyped
to query, and not linked to any exercise catalogue (Repsy has **no `Exercise` model at all**).

**Conclusion:** do not build the fancy screens first. Build the data model, and the fancy screens
become cheap. Build the screens first and you will rewrite them. See §5 for the order.

---

## 2. Feature inventory

Legend for **Repsy today**: ✅ have it · 🟡 partial/shallow · ❌ none.

### 2.1 Workouts and programs

| # | Feature | What it does for the coach | Where in Spur.fit | Repsy today | Gap |
|---|---|---|---|---|---|
| W1 | **Exercise library** | Browsable catalogue of movements; card grid with a **video thumbnail** per exercise, name, and an **equipment tag** pill (Bodyweight, Ab Wheel, Plates, Pull Up Bar, Agility Ladder). Search + filter. | `Fitness > Exercises`, 3-up card grid | ❌ no Exercise model | **Biggest gap.** No catalogue, no demo media. |
| W2 | **Stock vs. own library** | Tabs **"Spur.fit Library" / "My Library"** — big seeded catalogue the coach extends with their own. | Exercises page tabs | ❌ | New coaches start empty in Repsy; they start loaded in Spur.fit. |
| W3 | **Structured workout** | Workout = ordered **Sections**, each with a `3x Sets` badge; each exercise row shows **per-set reps as a list — "12, 12, 10 Reps"** — expressing drop-sets/progression in one line. | Workout detail modal | ❌ prose blob | Unlocks reports, AI quality, client logging. |
| W4 | **Three-pane workout builder** | Library (left) → section canvas (centre) → **properties inspector** (right). Drag exercises in, set reps, save. | Workout editor | 🟡 `PlanEditor` is a form | Pro-tool feel; the inspector is where per-exercise detail lives without cluttering the list. |
| W5 | **Section protocols** | Dropdown: **Warm Up, Regular, Superset, AMRAP, EMOM, TABATA, Mixed Sets, Cool-Down**. | Builder section header | ❌ | Cheap credibility with serious coaches — it's an enum. |
| W6 | **Rep modes** | Per-exercise radio: **Range / Fixed / Per Set**, plus `+ Add set`. | Inspector | ❌ | |
| W7 | **Advanced per-exercise metrics** | Checkboxes: **Specify Weight, RPE, Height, Distance, Calorie, duration** — hidden behind "Advanced Options". | Inspector | ❌ | Progressive disclosure keeps the simple case simple. |
| W8 | **"Record from user"** | Separate chip row choosing which metrics the **client must log back**: Reps, Duration, Weight, Height, Distance, Calorie. | Inspector | 🟡 fixed tracking fields | **Clean idea:** separates *what the coach prescribes* from *what the client reports*. |
| W9 | **Live estimated time** | Header shows `Estimated Time: 00:00:00`, recalculating as the workout fills. | Builder header | ❌ | Instant feedback; trivial once sets are numeric. |
| W10 | **Programs → Phases** | A Program contains **Phases** ("Phase 1 · 2 weeks"), reorderable by drag, with **Import Phase / Add Phase**. | `Fitness > Programs`, master-detail | ❌ no multi-week container | Repsy can only assign per-date. No reusable 8-week plan. |
| W11 | **Week × Day grid planner** | The hero screen. Weeks are **swim-lanes**, days are **columns**, each day holds colour-coded chips (workout / habit / check-in) with type icons. Per-day **duplicate / delete / add**, per-week duplicate/delete, `+ Add Week`. Stat cards: **Total Weeks 3**, **Total Workouts 21**. | Program editor | ❌ | Best visualisation of a multi-week plan in the whole set. |
| W12 | **Inline validation** | Each incomplete exercise shows red *"Select at least one property (reps / weight / height / duration)"* — can't save a broken workout. | Builder canvas | 🟡 | |
| W13 | **Unsaved-changes banner** | Non-blocking bar: *"Unsaved changes in HIIT Intermediate workout"* with **Continue / Discard** — keeps navigating, never loses work. | Global, under header | ❌ | Low effort, high trust. |
| W14 | **Interval/endurance segments** | Segment cards with **1x Repeat** badge, distance (100 m / 1000 Yds), pace or **00:00:10 Time**, and an `Instructions:` line. Mixed units. | Workout detail | ❌ | *Probably skip* — see §7. |

### 2.2 Nutrition

| # | Feature | What it does | Where | Repsy today | Gap |
|---|---|---|---|---|---|
| N1 | **Global food database** | Searchable food catalogue, scope dropdown **"Global ▾"**. Every row: monogram, name, **serving weight + calories** ("1% Fat Milk · 244.0 g · 102 Cals"). Detail pane shows macro **rings with grams AND % of calories**. | `Nutrition > Food Items` | ❌ | `Meal` exists, but there's no per-food atom to build meals from. |
| N2 | **Custom food + auto-calc** | "Add Food Item" modal: name, photo, `Macros & Calories for` + unit, Protein/Fat/Carbs/**Fibre**/Calories, and a checkbox **"Automatically Calculate Calories from Protein, Fat & Carbs"** → saves to **My Library**. | Modal | 🟡 `Meal` has C/P/F | Missing: fibre, photo, per-serving basis, auto-kcal. |
| N3 | **Three authoring modes** | Before building, pick **Food Based / Macros Based / Text Based** + **Diet Type: Veg / Non-Veg / Vegan**. | "Add Meal Plan" modal | ❌ | Framing device — flexibility without forcing structure. Veg/Non-Veg matters for the Indian market. |
| N4 | **Granular meal categories** | 16 presets: *On Waking Up, Early Morning, Breakfast, After Breakfast, Mid-morning, Morning Snack, Lunch, Evening Snack, Dinner, After Dinner, Bed Time, Before Workout, During Workout, Between Workouts, After Workout, Non-Training Day* + "New Category". | Category picker | 🟡 only Breakfast/Lunch/Dinner/Snack | Workout-relative slots are what serious nutrition coaching needs. |
| N5 | **Running macro card** | Right rail **always** shows NUTRITION FACTS totalling live as you build — 4 rings (Carbs/Protein/Fat/**Fibre**), each with grams + % of calories. Zeroed "0 Cals / N/A" in the empty state so you see it fill. | Meal plan editor | 🟡 `MacroCalculator` | Make the total impossible to lose sight of. |
| N6 | **Per-meal subtotals** | Each meal card header right-aligns `C 32.0 • P 33.0 • F 18.0 • FB 0.0   405.0 cals`. | Meal plan detail | ❌ | |
| N7 | **Inline quantity recalc** | Edit portion in-row (`21 ounce`, `1 serving`) and macros recompute instantly; red ⊖ removes. | Day builder | ❌ | |
| N8 | **"OR" alternative meals** | **"Add Optional"** spawns an `OR` block — a swappable alternative for that meal slot, with **its own macro ring card** for side-by-side comparison. | Day builder | ❌ | Genuinely differentiated adherence feature. Clients quit plans they can't eat. |
| N9 | **Meal schedules (week grid)** | 12-week **Weeks × Days** grid; every day card shows plan name + **1356 CALS · P: 81 C: 159 F: 45**, pastel-coded per plan type so rotation and **gaps** are obvious. Day/week add-delete-duplicate, `+ Add Week`. | `Nutrition > Meal Schedules` | ❌ | Nutrition twin of W11 — same component. |
| N10 | **Per-meal instructions** | `+ Add Instructions` on each meal card; dual add paths **"Add Custom"** vs **"Food/Recipe"**. | Day builder | ❌ | |

### 2.3 Client management, forms, habits, reports

| # | Feature | What it does | Where | Repsy today | Gap |
|---|---|---|---|---|---|
| C1 | **Form builder** | Drag-and-drop question editor. Types: **Single Select, Multi Select, single-line text, multi-line text, Date**, each with its own icon; `This question is required`; add/remove/duplicate answer options; rich-text toolbar; **Save / Preview / Add Question** in a sticky rail; **Submissions** tab with a count. Collapsed cards show a meta line `type · Required · Click to edit`. | `Forms` | ❌ | **Repsy has no forms at all.** Intake is the first thing a coach does with a client. |
| C2 | **Seeded sample forms** | Ships with *Client Intake Form, Progress Tracking Form, Nutrition Assessment Form, Fitness Assessment Form*. Real questions (age brackets, goals, activity level, injuries, dietary preference, "When do you want to get started?"). | Forms list | ❌ | Kills the empty state on day one. |
| C3 | **Habit library + recurrence** | Categories (**DailyTarget, Mindfulness, Sleep**) → checkbox habit lists ("Digital detox before bed") → **+ Add Custom**. Assign with a **Recurrence** dropdown + start date. | "Add Habit" modal | 🟡 `Habit` = a name | Repsy habits are free-text and non-recurring. No catalogue, no schedule. |
| C4 | **Reports hub** | KPI header cards — **Latest Weight 195 lbs · Adherence 0% · Last workout assigned 14th Nov '26** — above three self-describing category cards: **Strength** ("Monitor weightlifting progress, personal records..."), **Meal**, **Habits**, each with a tinted icon chip and one-line description. | `Reports` tab | 🟡 `Reports.tsx` | Navigation that explains itself; snapshot before drill-down. |
| C5 | **Client summary dashboard** | **Exercise Compliance** by week (This Week 0%, 1 Week ago 78%), **Statistics** (Total Workouts, **Current Streak**, Total Meals Completed, Today's/Yesterday's Steps, Sleep), **Events** (dated races/goals), Body Weight + Steps charts, **Physique Pictures** (progress photos), Measurements chart. | `Summary` tab | 🟡 Home/Progress | Missing: streak, progress photos, events/goal dates, compliance-by-week. |
| C6 | **Client pipeline tabs** | **Active 1 · Pending 0 · Archive 0 · Leads 0** with live counts, export, and **inline "Add" links** under Program / Meal Plan columns to assign without leaving the list. | Home client table | 🟡 `Lead` = landing email only | A lightweight CRM funnel baked into the list. |
| C7 | **Unified "Add to day"** | One modal from any calendar day offering four cards — **Workout, Meal, Habits, Cardio** — each with **+ Create** *and* **↓ Import** (author new vs. reuse library). | Schedule day click | 🟡 | One consistent entry point; the Create/Import split is the smart bit. |
| C8 | **Onboarding automation settings** | Settings modal with left rail: **Personal Info, Intro Card, Welcome Message, Intake Form, Configure Email Invite, Configure Notifications** — "select which forms should be used as initial intake forms for new clients". | Settings | 🟡 Account page | Everything a new client first sees is configurable in one place. |
| C9 | **Account menu** | **Subscription, Refer & Earn, View Profile, Settings, Change Password, Logout** (red). | Avatar dropdown | ✅ mostly | *Refer & Earn* is a growth loop worth noting. |

### 2.4 AI

| # | Feature | What it does | Where | Repsy today | Gap |
|---|---|---|---|---|---|
| A1 | **Split-screen AI builder** | **"AI Workout Builder — Enter the text of a single workout to instantly convert it into a workout."** Paste free text left → structured workout right. Hint **"(Use # to insert exercises)"**, **"Try an example"**, **"Learn how to write a workout prompt"**. CTAs disabled until valid input. Empty right panel is a dashed dropzone: *"Ready to create?"* | AI builder | 🟡 AI generates plans | Repsy has AI; **the presentation is the gap.** |
| A2 | **Visible parsing** | The sell is watching prose become data: `"3 min"` → chip **`03:00 sec`**; `"4 x 8"` → **`8 | 8 | 8 | 8 reps`**; each exercise gets an **auto-matched video thumbnail**. | Result panel | ❌ (text out) | Same AI call, far more convincing output. |
| A3 | **AI as a toggle, not a silo** | **"Build using AI"** sits inside the manual editor, and **"Build manually"** inside the AI builder. Generate-then-refine. | Both editors | 🟡 separate tab | |
| A4 | **"Ask Copilot"** | Persistent gradient AI button top-right across Nutrition/Workout pages. | Global | 🟡 AI Coach tab | Ambient, not a destination. |

---

## 3. UI patterns worth adopting

Not features — the craft that makes it read as expensive.

1. **Master–detail everywhere.** Searchable tree/list left, full detail right (Programs, Workouts, Meal Plans, Food Items, Settings). Selected row in solid accent. One layout learned once, reused six times.
2. **Consistent badge language across contexts.** `3x Sets` for strength and `1x Repeat` for intervals are the same component. Build a vocabulary, reuse it.
3. **Colour-coded, icon-tagged chips** for block types (workout / habit / check-in / cardio). This is what makes a dense 12-week grid scannable. *(Repsy must do this with `color-mix` tints of existing theme tokens — see §6.)*
4. **Numbers with context.** Macro rings show **grams AND % of calories**. Food rows show **weight AND calories**. Day cards show **cals AND P/C/F**. Never make the coach drill down for the obvious follow-up number.
5. **Stat cards above the fold.** `Total Weeks 3` / `Total Workouts 21` / `Latest Weight` / `Adherence` — large bold numeral, muted label, faint icon. Cheap to build, instantly "dashboard".
6. **Honest empty states.** `0 Cals / N/A` rings visible from the start; *"No data uploaded yet!"*; dashed *"Ready to create?"* dropzone; illustration + helpful copy in the inspector. Never a blank panel.
7. **Disabled primary CTAs until valid.** Create / Add / Add Workout / Generate are all greyed until the form is usable. Then they turn solid accent — the colour change *is* the feedback.
8. **Create vs. Import, side by side.** Solid pill for authoring, outlined ghost for reusing a template. Consistent weight hierarchy: solid = primary, outlined = secondary, red text = destructive.
9. **Self-describing navigation.** Report cards carry a one-line description of what's inside. The nav teaches the product.
10. **Non-blocking recovery.** Unsaved-changes banner with Continue/Discard instead of a trapping modal.
11. **Progressive disclosure.** "Advanced Options" hides RPE/distance/calories so the common case stays a two-field form.
12. **Graceful media fallback.** Monogram tiles ("B", "SJ") and neutral "…" thumbnails where a video is missing — the grid never looks broken.
13. **Live totals as you build.** Estimated Time, macro rings, per-meal subtotals. The document computes itself while you type.

---

## 4. Where Repsy already matches or wins

Worth saying, so the gap list doesn't read as despair:

- **Messaging and check-ins** — Repsy's threads, daily check-ins, engagement/at-risk detection and weekly AI summaries are a real system; Spur.fit shows a basic chat list.
- **Client app** — Repsy ships a dedicated client experience (tracking, rest timer, progress, messages). Not visible in these screenshots at all.
- **Billing** — Repsy's roster-size pricing, trial/grace states and read-only-when-lapsed are more considered than a "Subscription" link.
- **Review queue / AI suggestions a coach approves** — a genuinely different AI posture from "generate and hope".
- **Simplicity.** Spur.fit is dense. Several screens carry endurance metrics (CTL/ATL/TSB/TSS) most strength coaches will never use. Repsy's restraint is a feature — don't spend it carelessly.

---

## 5. Suggested build order

Ordered by *unlock value*, not by how good the screenshot looks.

### Tier 0 — the foundation (do this first or redo everything later)
- **`Exercise` model + exercise library** (name, equipment tag, optional media URL, coach-owned vs. seeded) — W1, W2.
- **Structured workout**: `Workout → Section → ExerciseRow → Set`, replacing the `details` blob (migrate old assignments as a single "Notes" section so nothing is lost) — W3.
- Seed a starter exercise catalogue so a new coach is never empty — W2.

### Tier 1 — cheap wins that make it feel like a different product
- Per-set rep display `12, 12, 10` + `3x Sets` section badge — W3
- Live **Estimated Time** — W9
- **KPI stat cards** on the client view (Latest Weight / Adherence / Last workout / **Streak**) — C4, C5
- **Report category cards** with descriptions — C4
- **Unsaved-changes banner** — W13
- **Meal category taxonomy** (16 presets + custom) and **Fibre** as a 4th macro — N4, N2
- **Per-meal macro subtotals** + always-visible running total — N5, N6
- Section protocol enum (Warm Up / Regular / Superset / AMRAP / EMOM / TABATA / Cool-Down) — W5

### Tier 2 — the differentiators
- **Week × Day grid planner** (one component, used for both workouts and meals) — W11, N9
- **Program → Phase** container with assignable multi-week plans — W10
- **Forms builder + submissions + seeded sample forms** — C1, C2
- **AI result rendered as structured data** with thumbnails (same AI call, new renderer) — A1, A2
- **Habit library with categories + recurrence** — C3

### Tier 3 — depth, once coaches are using it
- Food database + custom foods with auto-calc kcal — N1, N2
- **"OR" alternative meals** — N8
- Three authoring modes + diet type (Veg/Non-Veg/Vegan — relevant for India) — N3
- "Record from user" metric selection — W8
- Progress photos, events/goal dates — C5
- Client pipeline tabs with inline assign — C6
- Onboarding automation settings (intro card, welcome message, intake form) — C8

---

## 6. Repsy constraints that shape all of this

Anything built from this doc still obeys `CLAUDE.md`:

- **No new colours.** Colour-coded chips must come from existing `theme.css` tokens + `color-mix()` tints. No pastel palette imported wholesale.
- **No new npm dependencies.** Drag-and-drop must use native HTML5 DnD or pointer events — not `dnd-kit`/`react-beautiful-dnd`. Budget the effort accordingly, and provide **up/down chevrons as well as dragging** (Spur.fit does this too, and it's the accessible path).
- **CSP is on.** No runnable inline scripts. Video thumbnails mean self-hosted or an allowlisted origin — decide before building W1.
- **A11y:** labels, 40px+ tap targets, roles, keyboard reachable. Drag-only reordering fails this.
- **Bundle budgets:** first load 90 KB gz, `/app` 130 KB gz. A grid planner and a builder are the kind of thing that blows this — lazy-load them.
- **No side menu.** Spur.fit's left icon rail + fly-outs is their IA, not ours. Take the *information architecture* (Programs → Workouts → Exercises) without the chrome.
- **Mixed line endings** per file; never run Prettier across whole files.

---

## 7. What not to copy

- **CTL / ATL / TSB / TSS** endurance load metrics — wrong audience for Repsy's strength/physique coaches, and they make the UI look intimidating.
- **Multi-sport interval segments** (Swim/Bike/Run with yards-vs-metres) — large surface, narrow payoff.
- **Density.** Several Spur.fit screens carry three panels plus a modal plus a banner. Repsy's calm is a differentiator with solo coaches; add features without adopting the clutter.
- **"Refer & Earn"** — a growth loop worth remembering, but not before there are coaches to refer anyone.
- The fly-out nav pattern (conflicts with Repsy's no-side-menu rule).

---

## Appendix — screenshot index

| Area | Files |
|---|---|
| Fitness / programs | `1 Fitness option screen`, `2 Fitness programs screen`, `3 Fitness program multiple screen`, `4 Fitness program editor screen`, `4 Workout inside screen`, `5 Workout library`, `5program - workout screen`, `6 exercise library` |
| Workout builder | `6.png`, `7.png` |
| AI | `8 AI workout builder`, `9 Ai workout planner complete` |
| Nutrition | `1 Meal planner`, `2 meal planner screen`, `2 Meal planner nutrition screen macros`, `3 meal planner options`, `3 Meal Plans -`, `4 Meal planner drag and drop meal of the day`, `4 Meal planner weekwise`, `5 meal Planner - Dish macros screen`, `6 Meal planner day meals macro screen`, `1 Nutrition options` |
| Schedule | `2 Schedule screen`, `3 Inside Scedule screen menu` |
| Forms | `1 Forms screen`, `2 Forms screen questions answers` |
| Habits / reports | `1 habit screen`, `1 reports screen` |
| Summary / settings | `1 Summary`, `1 profile top right menu`, `Settings options` |

Originals: `C:\Users\ranes\Desktop\Repsy inspo`

---

## Build log

| Feature | Shipped | Notes |
|---|---|---|
| W1 Exercise library | 15 Nov 2026 | 65 seeded stock movements + the coach's own. Stock is read-only; "copy to my library" to edit. Verified live (15/15). |
| W3 Structured workouts (data) | 15 Nov 2026 | `Section -> Exercise`, per-set reps as arrays. `details` is now a derived rendering, so old readers keep working; legacy plans are parsed on demand rather than migrated. |

**Incident, 15 Nov 2026.** The structured-workout release was green everywhere and still 500'd in
production: two phantom columns reached the Prisma schema that no migration created. Unit tests mock
Prisma, so only a live check found it. Added `schema-migration-parity.test.ts`. Full write-up in
CLAUDE.md, "Never let the schema and the migrations disagree".
