// Exercise library (Inspo W1, Nov 2026).
//
// The catalogue a structured workout is built from. Two sets of rows in one list: Repsy's seeded
// stock movements (read-only, badged "Repsy") and the coach's own (editable). A coach who wants to
// change a stock movement copies it first - "Copy to my library" - so the shared set never drifts.
//
// Deliberately no video embeds: mediaUrl is rendered as a plain link that opens in a new tab, which
// keeps CSP untouched and means a coach can point at YouTube, Vimeo or their own recording.
import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  copyExercise,
  createExercise,
  deleteExercise,
  listExercises,
  queryKeys,
  updateExercise,
  type ExerciseQuery,
} from "../api";
import { ConfirmDialog } from "./ConfirmDialog";
import { ErrorState, LoadingState, plainErrorMessage } from "./States";
import { EQUIPMENT, MUSCLE_GROUPS, type Exercise, type NewExercise } from "../types";

const inputClass =
  "w-full rounded-card border border-border-strong bg-surface2 px-3 py-2 text-text placeholder:text-dim focus:border-accent";

const SCOPES = [
  { key: "all", label: "All" },
  { key: "stock", label: "Repsy library" },
  { key: "mine", label: "My library" },
] as const;

const blank: NewExercise = { name: "", equipment: "Bodyweight", muscleGroup: "Full body", mediaUrl: "", instructions: "" };

export function ExerciseLibrary() {
  const queryClient = useQueryClient();
  const [scope, setScope] = useState<"all" | "stock" | "mine">("all");
  const [q, setQ] = useState("");
  const [equipment, setEquipment] = useState("");
  const [muscleGroup, setMuscleGroup] = useState("");
  // null = the form is closed. A string id = editing that one. "new" = creating.
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<NewExercise>(blank);
  const [formError, setFormError] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<Exercise | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const query: ExerciseQuery = { scope, q: q.trim(), equipment, muscleGroup };
  const listQuery = useQuery({ queryKey: queryKeys.exercises(query), queryFn: () => listExercises(query) });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["exercises"] });
  const onError = (err: unknown) => setFormError(plainErrorMessage(err));

  const saveMutation = useMutation({
    mutationFn: (input: NewExercise) =>
      editing && editing !== "new" ? updateExercise(editing, input) : createExercise(input),
    onSuccess: async (saved) => {
      await refresh();
      setEditing(null);
      setDraft(blank);
      setFormError(null);
      setNotice(`Saved "${saved.name}".`);
    },
    onError,
  });

  const copyMutation = useMutation({
    mutationFn: copyExercise,
    onSuccess: async (copy) => {
      await refresh();
      setNotice(`Copied to your library as "${copy.name}". Edit it there.`);
    },
    onError,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteExercise,
    onSuccess: async () => {
      await refresh();
      setToDelete(null);
      setNotice("Exercise deleted.");
    },
    onError: (err) => {
      setToDelete(null);
      onError(err);
    },
  });

  function startEdit(ex: Exercise) {
    setEditing(ex.id);
    setDraft({
      name: ex.name,
      equipment: ex.equipment,
      muscleGroup: ex.muscleGroup,
      mediaUrl: ex.mediaUrl,
      instructions: ex.instructions,
    });
    setFormError(null);
    setNotice(null);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!draft.name?.trim()) {
      setFormError("Give the exercise a name.");
      return;
    }
    saveMutation.mutate({ ...draft, name: draft.name.trim() });
  }

  const items = listQuery.data ?? [];
  const filtersOn = Boolean(q.trim() || equipment || muscleGroup);

  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold">Exercises</h3>
          <p className="text-sm text-dim">
            Repsy's movements plus your own. These are the building blocks of a workout.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary min-h-11"
          onClick={() => {
            setEditing("new");
            setDraft(blank);
            setFormError(null);
            setNotice(null);
          }}
        >
          Add exercise
        </button>
      </div>

      {/* Scope: all / stock / mine */}
      <div role="group" aria-label="Which exercises" className="flex flex-wrap gap-2">
        {SCOPES.map((s) => (
          <button
            key={s.key}
            type="button"
            aria-pressed={scope === s.key}
            onClick={() => setScope(s.key)}
            className={
              "min-h-10 rounded-full border px-4 text-sm font-semibold " +
              (scope === s.key ? "border-text bg-text text-bg" : "border-border-strong bg-surface2 text-text hover:border-dim")
            }
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Search + filters */}
      <div className="grid gap-2 sm:grid-cols-3">
        <div>
          <label htmlFor="ex-search" className="mb-1 block text-sm font-bold">
            Search
          </label>
          <input
            id="ex-search"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Squat, row, plank..."
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="ex-equipment" className="mb-1 block text-sm font-bold">
            Equipment
          </label>
          <select
            id="ex-equipment"
            value={equipment}
            onChange={(e) => setEquipment(e.target.value)}
            className={inputClass + " min-h-11"}
          >
            <option value="">Any equipment</option>
            {EQUIPMENT.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="ex-muscle" className="mb-1 block text-sm font-bold">
            Muscle group
          </label>
          <select
            id="ex-muscle"
            value={muscleGroup}
            onChange={(e) => setMuscleGroup(e.target.value)}
            className={inputClass + " min-h-11"}
          >
            <option value="">Any muscle group</option>
            {MUSCLE_GROUPS.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </div>
      </div>

      {notice && (
        <p role="status" className="text-sm font-semibold text-accent2">
          {notice}
        </p>
      )}
      {formError && !editing && (
        <p role="alert" className="text-sm font-semibold text-amber-text">
          {formError}
        </p>
      )}

      {/* Create / edit form */}
      {editing && (
        <form onSubmit={submit} noValidate aria-label={editing === "new" ? "Add exercise" : "Edit exercise"} className="card grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="ex-name" className="mb-1 block text-sm font-bold">
                Name
              </label>
              <input
                id="ex-name"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                className={inputClass}
                autoFocus
              />
            </div>
            <div>
              <label htmlFor="ex-media" className="mb-1 block text-sm font-bold">
                Demo link (optional)
              </label>
              <input
                id="ex-media"
                value={draft.mediaUrl}
                onChange={(e) => setDraft({ ...draft, mediaUrl: e.target.value })}
                placeholder="https://..."
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="ex-form-equipment" className="mb-1 block text-sm font-bold">
                Equipment
              </label>
              <select
                id="ex-form-equipment"
                value={draft.equipment}
                onChange={(e) => setDraft({ ...draft, equipment: e.target.value as NewExercise["equipment"] })}
                className={inputClass + " min-h-11"}
              >
                {EQUIPMENT.map((x) => (
                  <option key={x} value={x}>
                    {x}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="ex-form-muscle" className="mb-1 block text-sm font-bold">
                Muscle group
              </label>
              <select
                id="ex-form-muscle"
                value={draft.muscleGroup}
                onChange={(e) => setDraft({ ...draft, muscleGroup: e.target.value as NewExercise["muscleGroup"] })}
                className={inputClass + " min-h-11"}
              >
                {MUSCLE_GROUPS.map((x) => (
                  <option key={x} value={x}>
                    {x}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="ex-instructions" className="mb-1 block text-sm font-bold">
              How to do it (optional)
            </label>
            <textarea
              id="ex-instructions"
              value={draft.instructions}
              onChange={(e) => setDraft({ ...draft, instructions: e.target.value })}
              rows={3}
              className={inputClass}
            />
          </div>
          {formError && (
            <p role="alert" className="text-sm font-semibold text-amber-text">
              {formError}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={saveMutation.isPending} className="btn btn-primary min-h-11">
              {saveMutation.isPending ? "Saving..." : "Save exercise"}
            </button>
            <button
              type="button"
              className="btn btn-secondary min-h-11"
              onClick={() => {
                setEditing(null);
                setFormError(null);
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* The grid */}
      {listQuery.isPending ? (
        <LoadingState />
      ) : listQuery.isError ? (
        <ErrorState error={listQuery.error} onRetry={() => void listQuery.refetch()} />
      ) : items.length === 0 ? (
        <p className="card text-sm text-dim">
          {filtersOn
            ? "No exercise matches those filters. Clear them, or add your own movement."
            : scope === "mine"
              ? "You have not added any exercises of your own yet. Repsy's library is under \"All\"."
              : "No exercises found."}
        </p>
      ) : (
        <>
          <p className="text-sm text-dim">
            {items.length} {items.length === 1 ? "exercise" : "exercises"}
          </p>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((ex) => (
              <li key={ex.id} className="card grid gap-2">
                <div className="flex items-start justify-between gap-2">
                  <h4 className="font-bold">{ex.name}</h4>
                  {ex.stock && (
                    <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-xs font-semibold text-dim">
                      Repsy
                    </span>
                  )}
                </div>
                <p className="flex flex-wrap gap-1.5 text-xs">
                  <span className="rounded-full bg-surface2 px-2 py-0.5 font-semibold text-dim">{ex.equipment}</span>
                  <span className="rounded-full bg-surface2 px-2 py-0.5 font-semibold text-dim">{ex.muscleGroup}</span>
                </p>
                {ex.instructions && <p className="text-sm text-dim">{ex.instructions}</p>}
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  {ex.mediaUrl && (
                    <a
                      href={ex.mediaUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-sm font-semibold text-accent underline"
                    >
                      Watch demo
                    </a>
                  )}
                  {ex.stock ? (
                    <button
                      type="button"
                      className="btn btn-secondary min-h-10"
                      disabled={copyMutation.isPending}
                      onClick={() => copyMutation.mutate(ex.id)}
                    >
                      Copy to my library
                    </button>
                  ) : (
                    <>
                      <button type="button" className="btn btn-secondary min-h-10" onClick={() => startEdit(ex)}>
                        Edit
                      </button>
                      <button type="button" className="btn btn-secondary min-h-10" onClick={() => setToDelete(ex)}>
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {toDelete && (
        <ConfirmDialog
          title={`Delete "${toDelete.name}"?`}
          confirmLabel="Delete exercise"
          pendingLabel="Deleting..."
          pending={deleteMutation.isPending}
          onCancel={() => setToDelete(null)}
          onConfirm={() => deleteMutation.mutate(toDelete.id)}
        >
          This removes it from your library. Workouts that already use it keep what you wrote.
        </ConfirmDialog>
      )}
    </section>
  );
}
