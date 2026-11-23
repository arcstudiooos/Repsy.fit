// The structured workout builder (Inspo W3/W5/W6/W7/W8/W9, Nov 2026).
//
// Turns a plan from a block of text into sections -> exercises with per-set reps. The header carries
// a live "Estimated time", exactly the feedback that makes a builder feel like a real tool.
//
// DELIBERATE CHOICES
//  * No drag-and-drop library. CLAUDE.md forbids new npm dependencies, and drag-only reordering
//    fails the a11y bar anyway. Order is changed with Move up / Move down buttons, which work with
//    a keyboard, a screen reader and a thumb.
//  * Per-set reps are edited as a comma list ("12, 12, 10"), the same shape they are displayed in.
//    One field, no set-row explosion, and it reads the way a coach writes it.
//  * Saving sends the whole structure; the server regenerates the plan text from it. Closing without
//    saving changes nothing.
//  * Advanced fields (load, RPE, distance, what the client logs) sit behind a per-exercise toggle so
//    the common case stays two inputs.
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { getStructure, listExercises, queryKeys, saveStructure } from "../api";
import { ErrorState, LoadingState, plainErrorMessage } from "./States";
import { clearDraft, getDraft, setDraft } from "./UnsavedChangesBanner";
import {
  PROTOCOLS,
  RECORD_FIELDS,
  TIMED_PROTOCOLS,
  type RecordField,
  type WorkoutExerciseInput,
  type WorkoutSectionInput,
} from "../types";

const field = "w-full rounded-lg border border-border-strong bg-surface2 px-3 py-2 text-sm text-text";
const tiny = "rounded-lg border border-border-strong bg-surface2 px-2 py-1 text-sm text-text";

/** "12, 12, 10" <-> [12, 12, 10]. Anything unparseable is simply dropped. */
export const repsToText = (reps: number[]) => reps.join(", ");
export const textToReps = (text: string) =>
  text
    .split(",")
    .map((r) => Number(r.trim()))
    .filter((r) => Number.isFinite(r) && r > 0 && r <= 1000)
    .slice(0, 20)
    .map((r) => Math.round(r));

const blankExercise = (): WorkoutExerciseInput => ({
  exerciseId: null,
  name: "",
  repsPerSet: [],
  loadPerSet: [],
  durationSec: null,
  distanceM: null,
  rpe: null,
  restSec: 60,
  notes: "",
  recordFields: [],
});

const blankSection = (): WorkoutSectionInput => ({
  protocol: "Regular",
  sets: 1,
  restSec: 0,
  durationSec: null,
  notes: "",
  exercises: [blankExercise()],
});

/** Mirrors estimateSeconds in server/src/workouts/structure.ts (a drift test keeps them in step). */
const SECONDS_PER_REP = 3;
const FALLBACK_SET_SEC = 45;
export function estimateSeconds(sections: WorkoutSectionInput[]): number {
  let total = 0;
  for (const section of sections) {
    if (TIMED_PROTOCOLS.includes(section.protocol) && section.durationSec) {
      total += section.durationSec * Math.max(1, section.sets) + section.restSec;
      continue;
    }
    let work = 0;
    for (const ex of section.exercises) {
      const sets = Math.max(ex.repsPerSet.length, ex.loadPerSet.length) || Math.max(1, section.sets);
      const perSet = ex.durationSec
        ? ex.durationSec
        : ex.repsPerSet.length
          ? (ex.repsPerSet.reduce((a, b) => a + b, 0) / ex.repsPerSet.length) * SECONDS_PER_REP
          : FALLBACK_SET_SEC;
      work += sets * perSet + Math.max(0, sets - 1) * ex.restSec;
    }
    const rounds = Math.max(1, section.sets);
    const hasPerSet = section.exercises.some((e) => e.repsPerSet.length || e.loadPerSet.length);
    total += (hasPerSet ? work : work * rounds) + Math.max(0, rounds - 1) * section.restSec;
  }
  return Math.round(total);
}

export function clockLabel(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const two = (n: number) => String(n).padStart(2, "0");
  const h = Math.floor(s / 3600);
  return h ? `${h}:${two(Math.floor((s % 3600) / 60))}:${two(s % 60)}` : `${Math.floor(s / 60)}:${two(s % 60)}`;
}

type Props = {
  clientId: string;
  assignmentId: string;
  /** What the plan is called, for the unsaved-changes banner. */
  title?: string;
  /** Called after a successful save, so the plan list can refetch the regenerated text. */
  onSaved: () => void;
  onClose: () => void;
  /** Bring the coach back to this builder from the banner. */
  onResume?: () => void;
};

export function WorkoutBuilder({ clientId, assignmentId, title = "this workout", onSaved, onClose, onResume }: Props) {
  const structureQuery = useQuery({
    queryKey: queryKeys.structure(clientId, assignmentId),
    queryFn: () => getStructure(clientId, assignmentId),
  });
  // The catalogue, for the "pick an exercise" lists. One request, reused by every row.
  const catalogue = useQuery({ queryKey: queryKeys.exercises({}), queryFn: () => listExercises({}) });

  const [sections, setSections] = useState<WorkoutSectionInput[] | null>(null);
  const [open, setOpen] = useState<string>(""); // "s-e" of the exercise showing advanced fields
  const [error, setError] = useState<string | null>(null);

  // Load once, preferring a draft the coach already started: they may have navigated away and come
  // back through the unsaved-changes banner, in which case the server's copy is the stale one.
  // Otherwise a plan with no stored structure arrives parsed from its text, so the builder opens on
  // what the coach already wrote rather than on nothing.
  useEffect(() => {
    if (!structureQuery.data || sections !== null) return;
    const draft = getDraft();
    const unsaved = draft?.id === assignmentId ? (draft.payload as WorkoutSectionInput[] | undefined) : undefined;
    setSections((unsaved ?? structureQuery.data.sections).map((s) => ({ ...s })));
  }, [structureQuery.data, sections, assignmentId]);

  const saveMutation = useMutation({
    mutationFn: () => saveStructure(clientId, assignmentId, sections ?? []),
    onSuccess: () => {
      clearDraft(assignmentId);
      onSaved();
      onClose();
    },
    onError: (err) => setError(plainErrorMessage(err)),
  });

  const estimate = useMemo(() => estimateSeconds(sections ?? []), [sections]);

  // Inspo W13: once the coach has changed something, say so anywhere they navigate. Compared against
  // the server's answer, so merely opening the builder is not "unsaved changes".
  const loaded = structureQuery.data?.sections;
  const dirty = sections !== null && loaded !== undefined && JSON.stringify(sections) !== JSON.stringify(loaded);
  useEffect(() => {
    if (!dirty) {
      clearDraft(assignmentId);
      return;
    }
    setDraft({
      id: assignmentId,
      label: title,
      kind: "workout",
      payload: sections,
      resume: () => onResume?.(),
      discard: () => {
        setSections(loaded ? loaded.map((s) => ({ ...s })) : []);
        onClose();
      },
    });
  }, [dirty, assignmentId, title, loaded, onResume, onClose]);

  // NOTE: no clear-on-unmount. Navigating away unmounts this component, and that is exactly when
  // the banner has to stay up. The draft is cleared explicitly on save, discard and Cancel instead.

  if (structureQuery.isPending) return <LoadingState />;
  if (structureQuery.isError) return <ErrorState error={structureQuery.error} onRetry={() => void structureQuery.refetch()} />;
  if (!sections) return <LoadingState />;

  const update = (si: number, patch: Partial<WorkoutSectionInput>) =>
    setSections(sections.map((s, i) => (i === si ? { ...s, ...patch } : s)));
  const updateEx = (si: number, ei: number, patch: Partial<WorkoutExerciseInput>) =>
    setSections(
      sections.map((s, i) =>
        i === si ? { ...s, exercises: s.exercises.map((e, j) => (j === ei ? { ...e, ...patch } : e)) } : s,
      ),
    );
  const move = <T,>(list: T[], from: number, to: number) => {
    if (to < 0 || to >= list.length) return list;
    const next = [...list];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    return next;
  };

  const problem = (() => {
    for (const [si, s] of sections.entries()) {
      for (const e of s.exercises) {
        if (!e.name.trim()) return `Every exercise needs a name${sections.length > 1 ? ` (section ${si + 1})` : ""}.`;
      }
    }
    return null;
  })();

  return (
    <section aria-label="Workout builder" className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="card-title">Build the workout</h3>
          <p className="text-sm text-dim">
            {structureQuery.data?.stored
              ? "Sections, exercises and the reps for each set."
              : "Read from the plan text. Save to turn it into a structured workout."}
          </p>
        </div>
        <p className="rounded-full border border-border px-3 py-1 text-sm font-semibold" data-estimate>
          Estimated time <span className="tabular-nums">{clockLabel(estimate)}</span>
        </p>
      </div>

      {sections.map((section, si) => (
        <div key={si} className="rounded-card border border-border p-3">
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label htmlFor={`sec-${si}-protocol`} className="mb-1 block text-xs font-bold">
                How it runs
              </label>
              <select
                id={`sec-${si}-protocol`}
                value={section.protocol}
                onChange={(e) => update(si, { protocol: e.target.value as WorkoutSectionInput["protocol"] })}
                className={tiny + " min-h-10"}
              >
                {PROTOCOLS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor={`sec-${si}-sets`} className="mb-1 block text-xs font-bold">
                Rounds
              </label>
              <input
                id={`sec-${si}-sets`}
                type="number"
                min={1}
                max={50}
                value={section.sets}
                onChange={(e) => update(si, { sets: Math.max(1, Number(e.target.value) || 1) })}
                className={tiny + " min-h-10 w-20"}
              />
            </div>
            {TIMED_PROTOCOLS.includes(section.protocol) && (
              <div>
                <label htmlFor={`sec-${si}-window`} className="mb-1 block text-xs font-bold">
                  Window (min)
                </label>
                <input
                  id={`sec-${si}-window`}
                  type="number"
                  min={0}
                  max={120}
                  value={section.durationSec ? Math.round(section.durationSec / 60) : ""}
                  onChange={(e) => update(si, { durationSec: Number(e.target.value) ? Number(e.target.value) * 60 : null })}
                  className={tiny + " min-h-10 w-24"}
                />
              </div>
            )}
            <div className="ml-auto flex flex-wrap justify-end gap-1">
              <button type="button" className="btn btn-secondary min-h-10" disabled={si === 0} onClick={() => setSections(move(sections, si, si - 1))}>
                Move up
              </button>
              <button
                type="button"
                className="btn btn-secondary min-h-10"
                disabled={si === sections.length - 1}
                onClick={() => setSections(move(sections, si, si + 1))}
              >
                Move down
              </button>
              <button
                type="button"
                className="btn btn-secondary min-h-10"
                aria-label={`Duplicate the ${section.protocol} section`}
                onClick={() =>
                  setSections([
                    ...sections.slice(0, si + 1),
                    { ...section, exercises: section.exercises.map((e) => ({ ...e, repsPerSet: [...e.repsPerSet] })) },
                    ...sections.slice(si + 1),
                  ])
                }
              >
                Duplicate section
              </button>
              <button type="button" className="btn btn-secondary min-h-10" onClick={() => setSections(sections.filter((_, i) => i !== si))}>
                Remove section
              </button>
            </div>
          </div>

          <div className="mt-2">
            <label htmlFor={`sec-${si}-notes`} className="mb-1 block text-xs font-bold">
              Section note (optional)
            </label>
            <input id={`sec-${si}-notes`} value={section.notes} onChange={(e) => update(si, { notes: e.target.value })} className={field} />
          </div>

          <ul className="mt-3 grid gap-2">
            {section.exercises.map((ex, ei) => {
              const key = `${si}-${ei}`;
              const showAdvanced = open === key;
              return (
                <li key={ei} className="rounded-lg border border-border-strong bg-surface2 p-2">
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
                    <div>
                      <label htmlFor={`ex-${key}-name`} className="mb-1 block text-xs font-bold">
                        Exercise
                      </label>
                      <input
                        id={`ex-${key}-name`}
                        value={ex.name}
                        list={`ex-options-${key}`}
                        onChange={(e) => {
                          const match = (catalogue.data ?? []).find((c) => c.name === e.target.value);
                          updateEx(si, ei, { name: e.target.value, exerciseId: match ? match.id : null });
                        }}
                        placeholder="Start typing, or pick from your library"
                        className={field}
                      />
                      {/* A datalist gives the catalogue without a custom dropdown or a new dependency. */}
                      <datalist id={`ex-options-${key}`}>
                        {(catalogue.data ?? []).map((c) => (
                          <option key={c.id} value={c.name} />
                        ))}
                      </datalist>
                    </div>
                    <div>
                      <label htmlFor={`ex-${key}-reps`} className="mb-1 block text-xs font-bold">
                        Reps per set
                      </label>
                      <input
                        id={`ex-${key}-reps`}
                        value={repsToText(ex.repsPerSet)}
                        onChange={(e) => updateEx(si, ei, { repsPerSet: textToReps(e.target.value) })}
                        placeholder="12, 12, 10"
                        inputMode="numeric"
                        className={field + " tabular-nums"}
                      />
                      <p className="mt-0.5 text-xs text-dim">
                        {ex.repsPerSet.length
                          ? `${ex.repsPerSet.length} ${ex.repsPerSet.length === 1 ? "set" : "sets"}`
                          : "One number per set"}
                      </p>
                    </div>
                    <div>
                      <label htmlFor={`ex-${key}-rest`} className="mb-1 block text-xs font-bold">
                        Rest (s)
                      </label>
                      <input
                        id={`ex-${key}-rest`}
                        type="number"
                        min={0}
                        max={3600}
                        value={ex.restSec}
                        onChange={(e) => updateEx(si, ei, { restSec: Math.max(0, Number(e.target.value) || 0) })}
                        className={field + " tabular-nums"}
                      />
                    </div>
                    <div className="flex flex-wrap items-end gap-1">
                      <button type="button" className="btn btn-secondary min-h-10" disabled={ei === 0} onClick={() => update(si, { exercises: move(section.exercises, ei, ei - 1) })}>
                        Up
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary min-h-10"
                        disabled={ei === section.exercises.length - 1}
                        onClick={() => update(si, { exercises: move(section.exercises, ei, ei + 1) })}
                      >
                        Down
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary min-h-10"
                        aria-label={`Duplicate ${ex.name || "exercise"}`}
                        onClick={() =>
                          update(si, {
                            exercises: [
                              ...section.exercises.slice(0, ei + 1),
                              { ...ex, repsPerSet: [...ex.repsPerSet] },
                              ...section.exercises.slice(ei + 1),
                            ],
                          })
                        }
                      >
                        Duplicate
                      </button>
                      <button type="button" className="btn btn-secondary min-h-10" onClick={() => update(si, { exercises: section.exercises.filter((_, j) => j !== ei) })}>
                        Remove
                      </button>
                    </div>
                  </div>

                  <button
                    type="button"
                    aria-expanded={showAdvanced}
                    className="mt-2 text-sm font-semibold text-accent underline"
                    onClick={() => setOpen(showAdvanced ? "" : key)}
                  >
                    {showAdvanced ? "Fewer options" : "More options"}
                  </button>

                  {showAdvanced && (
                    <div className="mt-2 grid gap-2 border-t border-border pt-2 sm:grid-cols-2">
                      <div>
                        <label htmlFor={`ex-${key}-load`} className="mb-1 block text-xs font-bold">
                          Load per set
                        </label>
                        <input
                          id={`ex-${key}-load`}
                          value={ex.loadPerSet.join(", ")}
                          onChange={(e) =>
                            updateEx(si, ei, { loadPerSet: e.target.value.split(",").map((l) => l.trim()).filter(Boolean).slice(0, 20) })
                          }
                          placeholder="60 kg, 60 kg, 65 kg"
                          className={field}
                        />
                      </div>
                      <div>
                        <label htmlFor={`ex-${key}-time`} className="mb-1 block text-xs font-bold">
                          Hold / time per set (s)
                        </label>
                        <input
                          id={`ex-${key}-time`}
                          type="number"
                          min={0}
                          max={3600}
                          value={ex.durationSec ?? ""}
                          onChange={(e) => updateEx(si, ei, { durationSec: Number(e.target.value) ? Number(e.target.value) : null })}
                          placeholder="For a plank or a carry"
                          className={field}
                        />
                      </div>
                      <div>
                        <label htmlFor={`ex-${key}-rpe`} className="mb-1 block text-xs font-bold">
                          Target effort (RPE 1-10)
                        </label>
                        <input
                          id={`ex-${key}-rpe`}
                          type="number"
                          min={1}
                          max={10}
                          step={0.5}
                          value={ex.rpe ?? ""}
                          onChange={(e) => updateEx(si, ei, { rpe: Number(e.target.value) ? Number(e.target.value) : null })}
                          className={field}
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <p className="mb-1 text-xs font-bold">What the client logs back</p>
                        <div className="flex flex-wrap gap-1.5">
                          {RECORD_FIELDS.map((f) => {
                            const on = ex.recordFields.includes(f);
                            return (
                              <button
                                key={f}
                                type="button"
                                aria-pressed={on}
                                onClick={() =>
                                  updateEx(si, ei, {
                                    recordFields: on ? ex.recordFields.filter((x) => x !== f) : [...ex.recordFields, f as RecordField],
                                  })
                                }
                                className={
                                  "min-h-10 rounded-full border px-3 text-sm font-semibold " +
                                  (on ? "border-text bg-text text-bg" : "border-border text-text hover:border-dim")
                                }
                              >
                                {f}
                              </button>
                            );
                          })}
                        </div>
                        <p className="mt-1 text-xs text-dim">Nothing picked means the client just ticks it off.</p>
                      </div>
                      <div className="sm:col-span-2">
                        <label htmlFor={`ex-${key}-notes`} className="mb-1 block text-xs font-bold">
                          Note for this exercise
                        </label>
                        <input id={`ex-${key}-notes`} value={ex.notes} onChange={(e) => updateEx(si, ei, { notes: e.target.value })} className={field} />
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          <button
            type="button"
            className="btn btn-secondary mt-2 min-h-10"
            onClick={() => update(si, { exercises: [...section.exercises, blankExercise()] })}
          >
            Add exercise
          </button>
        </div>
      ))}

      <button type="button" className="btn btn-secondary min-h-11 justify-self-start" onClick={() => setSections([...sections, blankSection()])}>
        Add section
      </button>

      {(error || problem) && (
        <p role="alert" className="text-sm font-semibold text-amber-text">
          {error ?? problem}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-primary min-h-11"
          disabled={saveMutation.isPending || problem !== null}
          onClick={() => {
            setError(null);
            saveMutation.mutate();
          }}
        >
          {saveMutation.isPending ? "Saving..." : "Save workout"}
        </button>
        <button
          type="button"
          className="btn btn-secondary min-h-11"
          onClick={() => {
            clearDraft(assignmentId);
            onClose();
          }}
        >
          Cancel
        </button>
        {sections.length > 0 && (
          <button
            type="button"
            className="btn btn-secondary min-h-11"
            onClick={() => setSections([])}
            title="Go back to a plain text plan"
          >
            Clear structure
          </button>
        )}
      </div>
      <p className="text-xs text-dim">
        Saving rewrites the plan text from these sections, so your client sees exactly this.
      </p>
    </section>
  );
}
