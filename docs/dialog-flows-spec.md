# Repsy — Complete-in-place dialog flows (prioritised spec)

Grounded in `client/src` as of this review. One modal exists today: `components/ConfirmDialog.tsx`
(native `<dialog>`, `showModal()`, Escape cancels, focus starts on Cancel). Everything else that
"opens" is either an inline panel that pushes the list down (`MealLibrary.AssignPanel`,
`LibraryTab.AssignPanel`, `AddClientForm`, `HabitTracker` add row, `Measurements` form) or a
cross-tab jump that destroys the coach's place (`LibraryTab.onAssign` → `App.openWorkspace(clientId,
"plans")` with `plannerPrefill`; `HomeTab` task buttons → Plans / AI Coach; `openMacroCalculator`
→ Business → Library → Macro calculator).

The jump is the real defect. An inline panel at least leaves you where you were; a tab switch
changes the top tab, the sub-view and the selected client in one click, with no way back.

---

## 0. Foundation — `components/Modal.tsx` (build first, ships with flow 1)

Not optional: every flow below depends on it, and eight hand-rolled `<dialog>`s will drift.

Props: `title`, `description?`, `size: "sm" | "md" | "lg"`, `onClose`, `footer`, `children`,
`busy?`, `dirty?`.

Must do:
- Native `<dialog>` + `showModal()`; `onCancel` preventDefault → `onClose` (so Escape routes through
  our dirty check, same as ConfirmDialog does today).
- `aria-labelledby` on the heading, `aria-describedby` on the description line.
- Focus moves to the first interactive control (or the heading, `tabIndex={-1}`, for read-mostly
  dialogs); focus returns to the invoking button on close — store `document.activeElement` on mount.
- Backdrop click closes only when `dirty !== true`; when dirty, Escape/backdrop raises the existing
  `ConfirmDialog` ("Discard changes?"). Never silently drop typed work.
- `body { overflow: hidden }` while open (native `<dialog>` does not scroll-lock).
- Mobile: `max-h-[92dvh]`, `w-full`, bottom-anchored sheet under `sm:`; sticky footer so the primary
  button is never scrolled off. Desktop: centred, `w-[min(size,calc(100vw-2rem))]`.
- Every control ≥40px tall (`btn` classes already satisfy this; raw `select`/`input` in the library
  panels currently do not — `px-3 py-2` is ~38px. Bump the shared `inputClass` to `min-h-10`).
- Errors render inside the dialog with `role="alert"`, above the footer. The dialog never closes on
  a failed mutation.
- `data-testid` on the dialog root per flow, so Playwright can scope selectors instead of matching
  duplicated text on the page behind.

Test impact: none by itself. Adding a dialog around existing markup *does* change ancestry — any
existing test using `page.getByRole("group", { name: /Assign/ })` or relying on the panel being a
sibling of the card will need rescoping. Keep button text and `aria-label`s byte-identical through
the conversion and that is the only class of breakage.

---

## 1. Assign from the library — one `AssignDialog` for templates, meals and programs
**Rank 1. Risk: MED. This is the complaint, verbatim.**

**Today**
- Meal: Business → Library → Meals → search → *Assign to client* → inline panel expands below the
  card → pick client (select), pick date → Assign. Stays on page, but the panel is a different shape
  per object and the list reflows.
- Template: Business → Library → Templates → *Assign to client* → inline panel → `onAssign` fires →
  **App switches to Clients, opens the client workspace, opens Plans, pre-fills the new-assignment
  form** → coach still has to finish the form there → to assign a second template they must walk
  Business → Library → Templates again. Six screens, place lost.
- Program: Business → Programs → select → Preview → Assign (preview is a separate full view).

**Proposed dialog** — invoked from the *Assign to client* button on any library card; title
`Assign "<name>"`.
1. **Client** — searchable combobox (not a bare `<select>`: coaches have 40+ clients), multi-select
   chips so one meal can go to five clients at once. Default: currently selected client if any.
2. **Date** — date input + `Today` / `Tomorrow` / `Next Monday` quick chips.
3. **Repeat** (templates/meals only) — `Once` | `Every <weekday chips> for <n> weeks`. Removes the
   single biggest reason coaches repeat this flow.
4. **What they'll see** — read-only preview of the generated assignment: title, type chip, and the
   `details` string that `mealDetails()` / `workoutDetails()` already build. Editable title + notes
   textarea, prefilled, so the coach can tweak without opening Plans.
5. **Program variant only**: replaces 2–4 with start date + the existing `previewProgram()` result
   rendered as a scrollable week-by-week list inside the dialog body. Preview is not a separate
   screen; it is the dialog body.
6. Footer: `Cancel` · `Assign` (+ `Assign and open plan` secondary for the rare case they do want
   to go to Plans). Success: dialog stays open for ~1s showing "Assigned to Garima · 12 Mar", then
   closes back to the library with an inline confirmation on the card. The coach never leaves
   Library unless they ask to.

**Why** Kills the longest journey in the app and the one the user named. Converts a 6-screen
template assignment into 2 clicks, and makes multi-client assignment possible at all (today it is
N full round-trips).

**Risk MED** — needs a new combobox (hand-built, no deps: input + `role="listbox"` + arrow keys),
and the multi-client/repeat options fan out to N `createAssignment()` calls; needs partial-failure
handling ("Assigned to 4 of 5. Ravi failed — retry?"). `plannerPrefill` / `onAssign` plumbing in
`App.tsx` and `LibraryTab` props can be deleted once templates assign in place — do that in the same
PR or the two paths rot apart.

**Acceptance**
- From Business → Library → Templates, clicking *Assign to client* opens a modal; the page behind is
  inert (tab key never reaches it; `document.activeElement` stays inside).
- Selecting a client + a date + Assign creates the assignment and the top tab is still **Business**,
  the view still **Library → Templates**, scroll position unchanged.
- Escape with an edited notes field raises "Discard changes?"; Escape with an untouched dialog closes
  immediately.
- Selecting 3 clients and assigning creates 3 assignments visible in each client's Plans.
- `Repeat: Mon/Wed/Fri for 2 weeks` creates 6 assignments on the correct dates.
- A server error keeps the dialog open and shows the message in `role="alert"`.
- Keyboard-only: open → tab through client, date, repeat, notes, Assign → done, no mouse.
- Screen reader announces the dialog title on open.

---

## 2. "New assignment" dialog, callable from anywhere
**Rank 2. Risk: MED.**

**Today** Writing a one-off plan requires: Clients → find client → open workspace → Plans →
*New assignment* → form inline in the Plans page. From Home's *Today's Tasks*, the `Open in Plans` /
`Plan with AI Coach` buttons throw the coach into another tab entirely (see the Home screenshot: two
tasks, two buttons, two one-way trips).

**Proposed dialog** The existing `ManualAssignmentForm` body, lifted into a `md` modal: client
(prefilled, editable), type chips (Workout / Nutrition / Habit / Recovery), title, date, details,
`Start from a template…` picker that loads templates *inside the dialog* (reverse of flow 1),
`Save` / `Save and add another`. Triggered from: Plans *New assignment*, client card overflow menu,
Home task rows, and a global `+` in the header.

**Why** Removes the "select a client first" tax. The Home tab becomes actionable instead of a list
of links to elsewhere — a coach can clear Today's Tasks without ever leaving Home.

**Risk MED** — `ManualAssignmentForm` is 513 lines and contains `ExercisePicker`; it must keep
working embedded in Plans *and* in a dialog. Extract the body as a child component with a layout
prop rather than forking. Workout rows can make the dialog tall → the structured builder stays in
Plans (see "Do not convert").

**Acceptance**
- `Open in Plans` on a Home task opens the dialog with that client and date prefilled; top tab stays
  **Home**; saving updates the task row in place.
- The same component in Plans still passes the existing Plans assignment tests unchanged.
- `Save and add another` clears the title/details but keeps client, type and date.
- Dialog is scrollable at 360×640 with the footer pinned and visible.

---

## 3. Add client → invite, in one dialog
**Rank 3. Risk: LOW.**

**Today** Clients → *Add client* → `AddClientForm` renders inline above the roster, pushing it down
→ save → `onClientCreated` selects them → the coach now hunts for *Invite* / join code
(`ClientInvitePanel`, `JoinCodePanel`, both lazy) as a separate panel.

**Proposed dialog** Two steps in one modal, no navigation: **(1) Details** — name, goal (+ Other),
level, age, weight, height, with the existing validation; **(2) Invite** — shown after save, inside
the same dialog: join code + QR, copy-link button, "Email invite" field, and `Assign a plan now`
which hands straight to the flow 2 dialog. Footer: `Done`.

**Why** Adding a client and getting them into the app is one intention; today it is three panels in
two places. Also stops the roster jumping under the coach's cursor.

**Risk LOW** — the form is self-contained and already has `focusSignal`, `onCancel`, `onCreated`.
Keep the zero-clients case rendering the form inline (a modal you cannot dismiss on an empty
dashboard is hostile) — that is the one branch to preserve.

**Acceptance**
- *Add client* opens a modal; the roster behind does not reflow.
- Validation errors appear inside the dialog and block close-on-save.
- After save, step 2 shows a working join code/QR; `Done` closes and the new client is selected and
  visible in the roster.
- With zero clients, the add form still renders inline, not as a modal.

---

## 4. Quick-log dialogs: measurement, habit, check-in note
**Rank 4. Risk: LOW.**

**Today** Clients → client → Check-ins → scroll to the `Measurements` form (inline, 6 fields,
competing with the table and a 220px Recharts chart) or the `HabitTracker` add row (name + preset
picker + weekday recurrence, which expands and shoves the 7-day grid down).

**Proposed dialogs** Three small `sm` modals, each triggered by a button that already exists:
- **Add measurement** — date, waist/chest/arm/hip/body-fat, note. Unchanged fields, just lifted out.
- **Add habit** — name, preset chips (`HABIT_PRESETS`), category, weekday recurrence chips
  (`EVERY_DAY` default). Enforces the `MAX_HABITS = 8` cap with a disabled trigger + reason.
- **Log check-in** — the `CheckInForm` fields.

**Why** These are the highest-frequency short tasks in the product and every one of them currently
reflows a data-dense screen while you type. Cheap, visible, low-risk — good second PR to prove the
Modal primitive.

**Risk LOW** — pure lift-and-shift of existing forms and mutations.

**Acceptance**
- Adding a measurement leaves the table scroll position and the selected chart metric untouched;
  the new row appears without a full-page reflow.
- Adding a habit with Mon/Wed/Fri selected shows the habit with those days in the week grid.
- With 8 habits, the *Add habit* trigger is disabled and announces why.
- Each dialog opens with focus on its first field.

---

## 5. Record payment / edit client plan
**Rank 5. Risk: LOW.**

**Today** Business → Payments → find the row → the record-payment form lives inline in
`BusinessTab`, mixed with the plan table and the Overdue/Due-this-week filters; editing the plan
(cycle, amount, status, next due) is another inline form.

**Proposed dialog** Row-level *Record payment* opens a modal: amount (prefilled from the plan),
method (`PAYMENT_METHODS`), date, note, and a read-only "Next due becomes 12 Apr" line so the
consequence is visible before saving. Separate *Edit plan* modal: amount, cycle, status, next due.

**Why** Money entry wants certainty and a clear commit point. Inline forms inside a filtered table
invite editing the wrong row.

**Risk LOW** — contained in one file, existing mutations (`recordPayment`, `saveClientPlan`).

**Acceptance**
- The dialog title names the client ("Record payment · Garima Sharma") so the wrong-row error is
  impossible.
- Saving updates the row and the Overdue/Due-this-week counts without changing the active filter.
- Cancel leaves no mutation fired.

---

## 6. Meal create/edit (with the food picker inside it)
**Rank 6. Risk: MED.**

**Today** Library → Meals → *New meal* / *Edit* replaces the list with a form; `FoodPicker` then
expands *inside* that form to fill macros. Two levels of inline expansion, and leaving the form
loses the list filters (search, type, diet).

**Proposed dialog** `lg` modal: name, meal type, diet type, macro fields (calories/protein/carbs/
fat/fibre), steps textarea, plus a `Add from food catalogue` section that renders `FoodPicker`
in-place in the dialog body (not a nested modal — nested dialogs are a trap on mobile). Footer:
`Cancel` · `Save meal` · `Save and assign…` (hands to flow 1's dialog).

**Why** Preserves the library's search/filter state and chains creation → assignment, which is the
natural pair.

**Risk MED** — `MealLibrary` is 607 lines; the form, the catalogue fill and the diet/type filters
are entangled, and the `lg` dialog gets tall. Must be verified at 360px width. Do not nest
`FoodPicker` as a second `<dialog>`.

**Acceptance**
- Opening *Edit* on a filtered list and cancelling returns to the same filters and scroll position.
- Filling macros from the catalogue leaves every field editable afterwards and recalculates nothing
  on its own (existing product rule).
- `Save and assign…` closes this dialog and opens the assign dialog for the saved meal.
- Fits 360×640 with the footer visible.

---

## 7. Form submissions viewer
**Rank 7. Risk: LOW.**

**Today** Business → Forms → pick a form → submissions list → pick a submission → full-view switch;
going back loses the list position.

**Proposed dialog** *View submission* opens a `md` read-mostly modal: client name, submitted date,
Q/A list, and actions that matter at that moment — `Message client`, `Create assignment` (flow 2),
`Next submission ›` / `‹ Previous` so a coach can review a batch without closing. Dialog is
read-mostly, so focus lands on the heading.

**Why** Reviewing submissions is a batch task; today every item costs two navigations.

**Risk LOW** — read-only content plus two existing actions.

**Acceptance**
- Next/Previous move through submissions without closing the dialog.
- Closing returns to the submissions list at the same scroll position.
- The dialog is operable with keyboard only, including Next/Previous.

---

## 8. Client snapshot "peek"
**Rank 8. Risk: LOW. Build only after 1–4 land.**

**Today** The roster card shows `Fat loss · Beginner · 58 kg · Muscles and fatloss` with a *More*
link (see screenshot) — a one-line truncation whose only resolution is opening the full workspace.

**Proposed dialog** *More* opens a snapshot modal: goal/level/weight/height, next due plan, last
check-in, habit streaks, open balance — plus the quick actions (`Assign`, `Log measurement`,
`Message`, `Record payment`) wired to the dialogs above. Footer: `Open full workspace` for when the
coach really does want to go deep.

**Why** Most roster clicks are a question, not a work session. Answer the question without a
workspace switch; make the workspace an explicit choice.

**Risk LOW** — read-only aggregation over data already fetched, plus triggers for existing dialogs.
Watch: do not make this a second, competing client workspace. It answers and dispatches; it does not
host editing.

**Acceptance**
- *More* opens the snapshot without changing the active tab or the selected client.
- Each quick action opens its dialog with the client prefilled.
- `Open full workspace` navigates as today.

---

## Do NOT convert — and why that is the point

A dialog is a commitment device for a *short, bounded* task. Put long authoring in one and you get a
cramped scroll-prison with an Escape key that can destroy an hour of work.

1. **Workout builder (`WorkoutBuilder`, 523 lines, inside Plans).** Exercise search, reorderable
   rows, sets/reps/rest per row, drafts, the unsaved-changes banner with "Continue editing"
   (`resumeBuildId`). It is authoring, it is long, it needs width, and it already has a
   resume-after-leaving story. Leave it a full screen. In the flow-2 dialog, offer
   `Build structured workout →` which saves a draft and *then* navigates — an explicit, one-way,
   user-chosen exit.
2. **Program authoring (`ProgramsView` phases + items).** Multi-week, many rows, Up/Down reordering.
   Only the *preview-and-assign* tail becomes a dialog (flow 1); the editor stays a view.
3. **Form builder (`FormsView` edit mode).** Same reasoning. Only *view submission* converts.
4. **AI Coach and Messages.** Conversations are ongoing, not completable; they need persistence,
   history scroll and screen space. A chat in a modal is a worse chat.
5. **Plan calendar (`PlanGrid`) and Reports.** These are *for reading*. Shrinking a calendar or a
   chart into a modal removes the only thing they offer. The *cells* of PlanGrid should open the
   flow-2 dialog — the grid itself never becomes one.
6. **Macro calculator.** Already a standalone tool with its own client prefill; it is a destination,
   not a step inside another task. Keep it a view, but let flow 1/2 link to it with the client
   carried over.

## Sequencing

PR1: `Modal.tsx` + flow 4 (three small dialogs — proves the primitive on low-risk ground).
PR2: flow 1 (the headline fix) + delete `plannerPrefill`/`onAssign` plumbing from `App.tsx`.
PR3: flows 2 and 3. PR4: 5–7. PR5: 8.

## Test-suite exposure (645 Playwright tests)

- **No renames proposed.** Every trigger keeps its current label: *Assign to client*, *Add client*,
  *New assignment*, *Record payment*. Flow 1 adds `Assign and open plan`; flow 6 adds
  `Save and assign…`. Those are additions, not renames.
- **Structural breakage to expect**: selectors that assume a panel is a sibling of a list item
  (`LibraryTab`/`MealLibrary` assign panels, `AddClientForm` above the roster), and anything
  asserting `getByRole("group", { name: /Assign .../ })` — that group becomes the dialog's
  `aria-label`. Budget a selector pass per PR, scoped via the new `data-testid` dialog roots.
- **One behavioural change tests will catch deliberately**: template assignment no longer navigates
  to Plans. Any test asserting "after Assign, the Plans tab is active" must be rewritten to assert
  the opposite — that is the fix, not a regression.
