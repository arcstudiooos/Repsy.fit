// Library tab (Prompt 58): the coach's own workout templates, plus the meal library section
// (Prompt 60). Search by name, create / edit with the
// Manual Planner's exercise search and sets / reps / rest controls, delete with a confirm, and
// "Assign to client", which opens that client's Plans with the form pre-filled.
// Templates belong to the signed-in coach only: no sharing, no marketplace.
import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createTemplate, deleteTemplate, listClients, listTemplates, queryKeys, updateTemplate } from "../api";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { MealLibrary } from "../components/MealLibrary";
import { MacroCalculator } from "../components/MacroCalculator";
import { ExercisePicker, rowsFromTemplate, templateFromRows, type DoseRow, type TemplatePrefill } from "../components/ManualAssignmentForm";
import { ErrorState, LoadingState, plainErrorMessage } from "../components/States";
import { localToday } from "./AiCoachTab";
import type { NewWorkoutTemplate, WorkoutTemplate } from "../types";

const inputClass =
  "w-full rounded-card border border-border bg-surface2 px-3 py-2 text-text placeholder:text-dim focus:border-accent";
const smallButton = "btn btn-secondary";

// UI batch 4: the three Library tools are separate views (same switch pattern as the Business views).
export const LIBRARY_VIEWS = ["Templates", "Meals", "Macro calculator"] as const;
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
};

export function LibraryTab({ view: viewProp, onViewChange, onAssign, macroClientId = null, onMacroPrefillUsed }: Props) {
  const [ownView, setOwnView] = useState<LibraryView>("Templates");
  const view = viewProp ?? ownView;
  const setView = onViewChange ?? setOwnView;

  return (
    <>
      <h2 className="text-2xl">Library</h2>
      <div role="group" aria-label="Library view" className="mt-3 flex flex-wrap gap-2">
        {LIBRARY_VIEWS.map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={view === v}
            onClick={() => setView(v)}
            className={
              "min-h-10 rounded-full border px-4 text-sm font-semibold " +
              (view === v ? "border-text bg-text text-bg" : "border-border bg-surface2 text-text hover:border-dim")
            }
          >
            {v}
          </button>
        ))}
      </div>
      {view === "Meals" ? (
        <MealLibrary />
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
              className={inputClass}
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
          <p className="rounded-card bg-surface2 px-4 py-6 text-center text-dim">
            No templates yet. Create your first one with New template.
          </p>
        ) : shown.length === 0 ? (
          <p className="rounded-card bg-surface2 px-4 py-6 text-center text-dim">No template matches "{search.trim()}".</p>
        ) : (
          <ul aria-label="Templates" className="flex flex-col gap-3">
            {shown.map((t) => (
              <li key={t.id} className="card p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="card-title">{t.name}</h3>
                  {t.focus !== "" && (
                    <span className="rounded-full border border-border px-2 py-0.5 text-xs font-semibold text-dim">{t.focus}</span>
                  )}
                  <span className="font-mono text-xs text-dim">
                    {t.exercises.length} {t.exercises.length === 1 ? "exercise" : "exercises"}
                  </span>
                </div>
                <ol className="mt-2 flex flex-col gap-0.5 text-sm text-text">
                  {t.exercises.map((e, i) => (
                    <li key={i}>
                      <span className="font-semibold">{e.name}</span>{" "}
                      <span className="font-mono text-dim">
                        {e.sets} × {e.reps} · Rest {e.rest}s
                      </span>
                    </li>
                  ))}
                </ol>
                {t.notes !== "" && <p className="mt-2 whitespace-pre-wrap text-sm text-dim">{t.notes}</p>}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    aria-label={`Assign ${t.name} to client`}
                    aria-expanded={assigning === t.id}
                    onClick={() => setAssigning(assigning === t.id ? null : t.id)}
                    className="btn btn-primary"
                  >
                    Assign to client
                  </button>
                  <button type="button" aria-label={`Edit ${t.name}`} onClick={() => setEditing(t)} className={smallButton}>
                    Edit
                  </button>
                  <button type="button" aria-label={`Delete ${t.name}`} onClick={() => setToDelete(t)} className={smallButton}>
                    Delete
                  </button>
                </div>
                {assigning === t.id && <AssignPanel template={t} onAssign={onAssign} />}
              </li>
            ))}
          </ul>
        )}
      </div>

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
function AssignPanel({ template, onAssign }: { template: WorkoutTemplate; onAssign: Props["onAssign"] }) {
  const clients = useQuery({ queryKey: queryKeys.clients, queryFn: listClients });
  const [clientId, setClientId] = useState("");
  const [date, setDate] = useState(localToday);
  const list = clients.data ?? [];
  const chosen = clientId || list[0]?.id || "";

  return (
    <div role="group" aria-label={`Assign ${template.name}`} className="mt-3 rounded-card bg-surface2 p-3">
      {clients.isPending ? (
        <LoadingState />
      ) : clients.isError ? (
        <ErrorState error={clients.error} onRetry={() => void clients.refetch()} />
      ) : list.length === 0 ? (
        <p className="text-sm text-dim">Add a client first, then you can assign this template.</p>
      ) : (
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor={`assign-client-${template.id}`} className="mb-1 block text-xs font-semibold text-dim">
              Client
            </label>
            <select
              id={`assign-client-${template.id}`}
              className={inputClass + " sm:w-auto"}
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
          <div>
            <label htmlFor={`assign-date-${template.id}`} className="mb-1 block text-xs font-semibold text-dim">
              Date
            </label>
            <input
              id={`assign-date-${template.id}`}
              type="date"
              className={inputClass + " sm:w-auto"}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <button
            type="button"
            onClick={() => onAssign(chosen, { template, date: date || localToday() })}
            className="btn btn-primary"
          >
            Open in Plans
          </button>
        </div>
      )}
    </div>
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
