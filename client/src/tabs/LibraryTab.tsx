// Library tab (Prompt 58): the coach's own workout templates, plus the meal library section
// (Prompt 60). Search by name, create / edit with the
// Manual Planner's exercise search and sets / reps / rest controls, delete with a confirm, and
// "Assign to client", which opens that client's Plans with the form pre-filled.
// Templates belong to the signed-in coach only: no sharing, no marketplace.
import { useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createTemplate, deleteTemplate, listClients, listTemplates, queryKeys, updateTemplate } from "../api";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Modal } from "../components/Modal";
import { MealLibrary } from "../components/MealLibrary";
import { ExerciseLibrary } from "../components/ExerciseLibrary";
import { MacroCalculator } from "../components/MacroCalculator";
import { ProgramsView } from "../components/ProgramsView";
import { FormsView } from "../components/FormsView";
import { ExercisePicker, ManualAssignmentForm, rowsFromTemplate, templateFromRows, type DoseRow, type TemplatePrefill } from "../components/ManualAssignmentForm";
import { ErrorState, LoadingState, plainErrorMessage } from "../components/States";
import { localToday } from "./AiCoachTab";
import type { Client, NewWorkoutTemplate, WorkoutTemplate } from "../types";

const inputClass =
  "w-full rounded-card border border-border-strong bg-surface2 px-3 py-2 text-text placeholder:text-dim focus:border-accent";
const smallButton = "btn btn-secondary";

// UI batch 4: the three Library tools are separate views (same switch pattern as the Business views).
// Nov 2026: Library is a top-level destination, and Programs and Forms moved into it from
// "Business". They are reusable PROGRAMMING - a programme of workouts, a questionnaire a client
// fills in - which has nothing to do with money or admin; filing them under Business was what made
// that tab a junk drawer. Everything a coach builds once and reuses now lives in one place.
export const LIBRARY_VIEWS = ["Templates", "Exercises", "Meals", "Programs", "Forms", "Macro calculator"] as const;
export type LibraryView = (typeof LIBRARY_VIEWS)[number];

type Props = {
  /** The open Library view; owned by App so it is remembered and the macro links can open the calculator. */
  view?: LibraryView;
  onViewChange?: (view: LibraryView) => void;
  /** Open Plans for `clientId`, starting a new assignment from the template. */
  onAssign: (clientId: string, prefill: TemplatePrefill) => void;
  /** Prompt 61: a client whose details should pre-fill the macro calculator (used once). */
  macroClientId?: string | null;
  onMacroPrefillUsed?: () => void;
  /** Programs and Forms both assign to a client, so they need the roster. */
  clients: Client[];
};

export function LibraryTab({ view: viewProp, onViewChange, onAssign, macroClientId = null, onMacroPrefillUsed, clients }: Props) {
  const [ownView, setOwnView] = useState<LibraryView>("Templates");
  const view = viewProp ?? ownView;
  const setView = onViewChange ?? setOwnView;

  return (
    <>
      <h2 className="page-title">Library</h2>
      <p className="text-sm text-dim">Build once, reuse for many clients — templates, programs and the tools behind them.</p>
      {/* One quiet tab strip instead of six filled boxes. All six destinations stay reachable in the
          original order (muscle memory), with the utility separated by a hairline and muted. */}
      <div
        role="group"
        aria-label="Library view"
        className="mt-3 flex flex-nowrap gap-1 overflow-x-auto border-b border-border"
      >
        {LIBRARY_VIEWS.map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={view === v}
            onClick={() => setView(v)}
            className={`relative flex min-h-11 shrink-0 items-center px-3 text-sm font-semibold transition-colors first:pl-0 ${
              view === v ? "text-text after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-accent2" : "text-dim hover:text-text"
            }`}
          >
            {v}
          </button>
        ))}
      </div>
      {view === "Meals" ? (
        <MealLibrary />
      ) : view === "Exercises" ? (
        <ExerciseLibrary />
      ) : view === "Programs" ? (
        <ProgramsView clients={clients} />
      ) : view === "Forms" ? (
        <FormsView clients={clients} />
      ) : view === "Macro calculator" ? (
        <MacroCalculator initialClientId={macroClientId} onPrefillUsed={onMacroPrefillUsed} />
      ) : (
        <TemplatesView onAssign={onAssign} />
      )}
    </>
  );
}

// The workout templates view (Prompt 58).
function TemplatesView({ onAssign }: { onAssign: Props["onAssign"] }) {
  const query = useQuery({ queryKey: queryKeys.templates, queryFn: listTemplates });
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // null = no form; "new" = creating; a template = editing it.
  const [editing, setEditing] = useState<WorkoutTemplate | "new" | null>(null);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<WorkoutTemplate | null>(null);
  const queryClient = useQueryClient();

  const remove = useMutation({
    mutationFn: (id: string) => deleteTemplate(id),
    onSuccess: async () => {
      setToDelete(null);
      await queryClient.invalidateQueries({ queryKey: queryKeys.templates });
    },
  });

  const all = query.data ?? [];
  const needle = search.trim().toLowerCase();
  const shown = needle === "" ? all : all.filter((t) => t.name.toLowerCase().includes(needle));

  return (
    <>
      <p className="mt-4 text-sm text-dim">Your workout templates. Build one once, then assign it to any client.</p>

      {editing ? (
        <TemplateForm
          key={editing === "new" ? "new" : editing.id}
          template={editing === "new" ? null : editing}
          onDone={() => setEditing(null)}
        />
      ) : (
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1 basis-60">
            <label htmlFor="template-search" className="mb-1 block text-sm font-semibold text-text">
              Search templates
            </label>
            <input
              id="template-search"
              type="search"
              className="min-h-11 w-full rounded-none border-0 border-b border-border-strong bg-transparent px-0 text-text placeholder:text-dim focus:border-accent2"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name"
              autoComplete="off"
            />
          </div>
          <button type="button" onClick={() => setEditing("new")} className="btn btn-primary">
            New template
          </button>
        </div>
      )}

      <div className="mt-4">
        {query.isPending || (query.isError && query.isFetching) ? (
          <LoadingState />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : all.length === 0 ? (
          <p className="mt-4 py-8 text-center text-dim">
            No templates yet. Create your first one with New template.
          </p>
        ) : shown.length === 0 ? (
          <p className="mt-4 py-8 text-center text-dim">No template matches "{search.trim()}".</p>
        ) : (
          <ul aria-label="Templates" className="mt-4 flex flex-col divide-y divide-border">
            {shown.map((t) => {
              const full = expanded.has(t.id);
              const rows = full ? t.exercises : t.exercises.slice(0, 3);
              return (
              <li key={t.id} className="flex flex-col gap-3 py-4 first:pt-0 sm:flex-row sm:items-start sm:gap-4">
                {/* One calm typographic row: no framed chip, no nested boxes, no mono numerals. */}
                <div className="min-w-0 w-full sm:flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <h3 className="card-title">{t.name}</h3>
                    {t.focus !== "" && <span className="text-sm text-dim">· {t.focus}</span>}
                    <span className="ml-auto whitespace-nowrap text-xs tabular-nums text-dim">
                      {t.exercises.length} {t.exercises.length === 1 ? "exercise" : "exercises"}
                    </span>
                  </div>
                  <ol className="mt-2 flex flex-col gap-1">
                    {rows.map((e, i) => (
                      <li key={i} className="text-sm text-text">
                        <span className="font-semibold">{e.name}</span>{" "}
                        <span className="tabular-nums text-dim">
                          {e.sets} × {e.reps} · Rest {e.rest}s
                        </span>
                      </li>
                    ))}
                  </ol>
                  {t.exercises.length > 3 && (
                    <button
                      type="button"
                      aria-expanded={full}
                      onClick={() =>
                        setExpanded((prev) => {
                          const next = new Set(prev);
                          if (next.has(t.id)) next.delete(t.id);
                          else next.add(t.id);
                          return next;
                        })
                      }
                      className="mt-1 min-h-10 text-sm font-semibold text-accent-text underline underline-offset-4"
                    >
                      {full ? "Show fewer" : `View all ${t.exercises.length} exercises`}
                    </button>
                  )}
                  {t.notes !== "" && <p className="mt-2 whitespace-pre-wrap text-sm text-dim">{t.notes}</p>}
                </div>
                {/* A three-column grid on phone keeps all actions on ONE row — no orphaned Delete,
                    no tall empty gap — and keeps Assign visibly first. */}
                <div className="grid w-full grid-cols-3 items-center gap-2 sm:flex sm:w-auto">
                  {/* Assign is the unmistakable first action; the one orange stays on New template. */}
                  <button
                    type="button"
                    aria-label={`Assign ${t.name} to client`}
                    aria-expanded={assigning === t.id}
                    onClick={() => setAssigning(assigning === t.id ? null : t.id)}
                    className="btn btn-secondary min-h-11 justify-center whitespace-nowrap"
                  >
                    <span className="sm:hidden">Assign</span>
                    <span className="hidden sm:inline">Assign to client</span>
                    <span aria-hidden="true" className="font-bold text-accent2">→</span>
                  </button>
                  <button type="button" aria-label={`Edit ${t.name}`} onClick={() => setEditing(t)} className={`${smallButton} justify-center`}>
                    Edit
                  </button>
                  {/* Destructive action: amber, last, and behind the existing confirm. */}
                  <button type="button" aria-label={`Delete ${t.name}`} onClick={() => setToDelete(t)} className="btn btn-ghost min-h-11 justify-center text-amber-text">
                    Delete
                  </button>
                </div>
              </li>
              );
            })}
          </ul>
        )}
      </div>

      {assigning && (
        <AssignDialog
          template={all.find((t) => t.id === assigning) ?? shown[0]}
          onAssign={onAssign}
          onClose={() => setAssigning(null)}
        />
      )}

      {toDelete && (
        <ConfirmDialog
          title="Delete this template?"
          confirmLabel="Delete"
          pendingLabel="Deleting..."
          pending={remove.isPending}
          onConfirm={() => remove.mutate(toDelete.id)}
          onCancel={() => {
            remove.reset();
            setToDelete(null);
          }}
        >
          "{toDelete.name}" will be removed from your library. Workouts already assigned from it stay as they are.
          {remove.isError && (
            <span role="alert" className="mt-2 block text-sm font-semibold text-accent">
              {plainErrorMessage(remove.error)}
            </span>
          )}
        </ConfirmDialog>
      )}

    </>
  );
}

// Pick any of the coach's clients and a date, then continue in Plans (nothing is saved yet).
/**
 * Assign a template: a dialog that finishes the job (Nov 2026 UI batch).
 *
 * This used to be the worst journey in the app. The button said "Open in Plans", and it meant it:
 * one click changed the top tab, the sub-view AND the selected client, dropping the coach into the
 * planner with no way back to the library they were browsing. Assigning three templates meant
 * walking back three times.
 *
 * Now the same ManualAssignmentForm opens in a dialog over the library. It is deliberately the SAME
 * component, not a copy of it, so the payload, the validation and the "a blank Reps box blocks
 * saving" rule cannot drift from the planner's version.
 *
 * "Open in Plans instead" is kept as a quiet way out, because a coach who wants the week's context
 * around the plan should still be able to get it - as a choice now, rather than as the only outcome.
 */
function AssignDialog({
  template,
  onAssign,
  onClose,
}: {
  template: WorkoutTemplate;
  onAssign: Props["onAssign"];
  onClose: () => void;
}) {
  const clients = useQuery({ queryKey: queryKeys.clients, queryFn: listClients });
  const [clientId, setClientId] = useState("");
  const [done, setDone] = useState<string[]>([]);
  const list = clients.data ?? [];
  const chosen = clientId || list[0]?.id || "";
  const chosenName = list.find((c) => c.id === chosen)?.name ?? "";
  const clientRef = useRef<HTMLSelectElement>(null);

  return (
    <Modal
      title={`Assign ${template.name}`}
      description={template.focus || undefined}
      size="lg"
      initialFocus={clientRef}
      onRequestClose={onClose}
    >
      {clients.isPending ? (
        <LoadingState />
      ) : clients.isError ? (
        <ErrorState error={clients.error} onRetry={() => void clients.refetch()} />
      ) : list.length === 0 ? (
        <p className="empty-state">Add a client first, then you can assign this template.</p>
      ) : (
        <>
          {/* Client only. The date deliberately lives in the form below and nowhere else: an
              earlier version had a date picker here AND in the form, which is two controls for one
              fact - the kind of thing that makes a coach wonder which one won. */}
          <div className="sm:max-w-xs">
            <label htmlFor={`assign-client-${template.id}`} className="mb-1 block text-xs font-semibold text-dim">
              Client
            </label>
            <select
              id={`assign-client-${template.id}`}
              ref={clientRef}
              className={inputClass}
              value={chosen}
              onChange={(e) => setClientId(e.target.value)}
            >
              {list.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {done.length > 0 && (
            <p className="mt-3 text-sm font-semibold text-accent2">
              Assigned to {done.join(", ")}. Pick another client to assign it again.
            </p>
          )}

          <div className="mt-4 border-t border-border pt-4">
            {/* Keyed on the client so switching client restarts the form from the template,
                instead of carrying the previous client's edits over to the next one. */}
            <ManualAssignmentForm
              key={chosen}
              clientId={chosen}
              prefill={{ template, date: localToday() }}
              onCreated={() => {
                // Stays open: assigning one template to several clients is the normal case.
                setDone((d) => (d.includes(chosenName) ? d : [...d, chosenName]));
              }}
              onCancel={onClose}
            />
          </div>

          <button
            type="button"
            onClick={() => onAssign(chosen, { template, date: localToday() })}
            className="btn btn-ghost mt-3"
          >
            Open in Plans instead
          </button>
        </>
      )}
    </Modal>
  );
}

// Create / edit form: name, focus, exercises (the Planner's search + dose rows) and notes.
function TemplateForm({ template, onDone }: { template: WorkoutTemplate | null; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(template?.name ?? "");
  const [focus, setFocus] = useState(template?.focus ?? "");
  const [notes, setNotes] = useState(template?.notes ?? "");
  const [rows, setRows] = useState<DoseRow[]>(() => (template ? rowsFromTemplate(template.exercises) : []));
  const [formError, setFormError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (input: NewWorkoutTemplate) => (template ? updateTemplate(template.id, input) : createTemplate(input)),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.templates });
      onDone();
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (name.trim() === "") return setFormError("Give the template a name.");
    if (rows.length === 0) return setFormError("Add at least one exercise.");
    if (rows.some((r) => r.reps.trim() === "")) return setFormError("Add reps for every exercise.");
    setFormError(null);
    save.mutate({ name: name.trim(), focus: focus.trim(), exercises: templateFromRows(rows), notes: notes.trim() });
  }

  const problem = formError ?? (save.isError ? plainErrorMessage(save.error) : null);

  return (
    <form onSubmit={submit} noValidate aria-label={template ? "Edit template" : "New template"} className="card mt-4 p-5">
      <h3 className="mb-4 card-title">{template ? "Edit template" : "New template"}</h3>
      <div className="flex flex-col gap-4">
        <div>
          <label htmlFor="template-name" className="mb-1 block text-sm font-semibold text-text">
            Template name
          </label>
          <input
            id="template-name"
            className={inputClass}
            value={name}
            maxLength={100}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Push day - chest & shoulders"
            autoComplete="off"
            aria-required="true"
          />
        </div>
        <div>
          <label htmlFor="template-focus" className="mb-1 block text-sm font-semibold text-text">
            Focus (optional)
          </label>
          <input
            id="template-focus"
            className={inputClass}
            value={focus}
            maxLength={100}
            onChange={(e) => setFocus(e.target.value)}
            placeholder="e.g. Upper body strength"
            autoComplete="off"
          />
        </div>
        <ExercisePicker rows={rows} onRowsChange={setRows} />
        <div>
          <label htmlFor="template-notes" className="mb-1 block text-sm font-semibold text-text">
            Notes (optional)
          </label>
          <textarea
            id="template-notes"
            rows={3}
            className={inputClass + " resize-y"}
            value={notes}
            maxLength={2000}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Warm-up, form cues, tempo."
          />
        </div>
      </div>
      {problem && (
        <p role="alert" className="mt-4 text-sm font-semibold text-accent">
          {problem}
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="submit" disabled={save.isPending} className="btn btn-primary">
          {save.isPending ? "Saving..." : "Save template"}
        </button>
        <button type="button" onClick={onDone} disabled={save.isPending} className={smallButton}>
          Cancel
        </button>
      </div>
    </form>
  );
}
