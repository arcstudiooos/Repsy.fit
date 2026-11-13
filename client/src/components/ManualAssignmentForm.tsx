import { useEffect, useState, type Dispatch, type FormEvent, type SetStateAction } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createAssignment, listMeals, queryKeys } from "../api";
import { plainErrorMessage } from "./States";
import { localToday, TYPE_CHIP } from "../tabs/AiCoachTab";
import { TYPE_DOT } from "../lib/typeChip";
import {
  ASSIGNMENT_TYPES,
  type Assignment,
  type AssignmentType,
  type NewAssignment,
  type TemplateExercise,
  type WorkoutTemplate,
} from "../types";
import { CUSTOM_GROUP, searchExercises, type Exercise } from "../data/exercises";

// Inputs: --surface2 background, 14px radius (design system).
const inputClass =
  "w-full rounded-card border border-border bg-surface2 px-3 py-2 text-text placeholder:text-dim " +
  "focus:border-accent";

const TITLE_PLACEHOLDER: Record<AssignmentType, string> = {
  Workout: "e.g. Push day - chest & shoulders",
  Nutrition: "e.g. 1800 kcal high-protein day",
  Habit: "e.g. Daily 10k steps",
  Recovery: "e.g. Foam roll + 20 min mobility",
};

// Dose per exercise: reps is text so "AMRAP" or "30 sec" work; rest is in seconds.
type Dose = { sets: number; reps: string; rest: number };
export type DoseRow = Exercise & Dose & { key: number };

const DEFAULT_DOSE: Dose = { sets: 3, reps: "10", rest: 60 };
const MIN_SETS = 1;
const MAX_SETS = 10;
const MIN_REST = 6;
const REST_PICKS = [30, 60, 90, 120];

// The prototype's plan line: "1. Back Squat — 4 sets × 6 reps · Rest 120s", in the coach's row
// order. Extra notes follow after a blank line.
function workoutDetails(rows: DoseRow[], notes: string): string {
  const list = rows.map((r, i) => `${i + 1}. ${r.name} — ${r.sets} sets × ${r.reps.trim()} reps · Rest ${r.rest}s`).join("\n");
  return notes ? `${list}\n\n${notes}` : list;
}

/** Template exercises (name, sets, reps, rest) as editable rows, in order. */
export function rowsFromTemplate(list: TemplateExercise[]): DoseRow[] {
  return list.map((e, i) => ({ name: e.name, group: CUSTOM_GROUP, sets: e.sets, reps: e.reps, rest: e.rest, key: i + 1 }));
}

/** Rows back to the stored shape (name, sets, reps, rest), keeping the coach's order. */
export function templateFromRows(rows: DoseRow[]): TemplateExercise[] {
  return rows.map((r) => ({ name: r.name, sets: r.sets, reps: r.reps.trim(), rest: r.rest }));
}

type PickerProps = { rows: DoseRow[]; onRowsChange: Dispatch<SetStateAction<DoseRow[]>> };

/**
 * The exercise search (46 exercises + custom) and the selected rows with sets / reps / rest controls.
 * Shared by the Manual Planner form and the Library's template form; the rows live in the parent.
 */
export function ExercisePicker({ rows, onRowsChange }: PickerProps) {
  const [exerciseQuery, setExerciseQuery] = useState("");
  const exerciseResults = searchExercises(exerciseQuery);
  const customName = exerciseQuery.trim();

  function addExercise(exercise: Exercise) {
    onRowsChange((list) => [...list, { ...exercise, ...DEFAULT_DOSE, key: Math.max(0, ...list.map((r) => r.key)) + 1 }]);
    setExerciseQuery("");
  }

  function updateExercise(key: number, change: Partial<Dose>) {
    onRowsChange((list) => list.map((item) => (item.key === key ? { ...item, ...change } : item)));
  }

  function moveExercise(index: number, by: -1 | 1) {
    onRowsChange((list) => {
      const target = index + by;
      if (target < 0 || target >= list.length) return list;
      const next = [...list];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  return (
    <div>
      <label htmlFor="exercise-search" className="mb-1 block text-sm font-semibold text-text">
        Search exercises
      </label>
      <div className="relative">
        <input
          id="exercise-search"
          className={inputClass}
          value={exerciseQuery}
          onChange={(e) => setExerciseQuery(e.target.value)}
          placeholder="Search by name or muscle group, e.g. squat or back"
          autoComplete="off"
        />
        {customName !== "" && (
          <ul
            aria-label="Exercise results"
            className="absolute left-0 right-0 z-10 mt-1 overflow-hidden rounded-card border border-border bg-surface"
          >
            {exerciseResults.map((ex) => (
              <li key={ex.name}>
                <button
                  type="button"
                  onClick={() => addExercise(ex)}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-surface2"
                >
                  <span className="font-semibold text-text">{ex.name}</span>
                  <span className="text-dim">{ex.group}</span>
                </button>
              </li>
            ))}
            <li className="border-t border-border">
              <button
                type="button"
                onClick={() => addExercise({ name: customName, group: CUSTOM_GROUP })}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-surface2"
              >
                <span className="font-semibold text-accent2">Add custom exercise "{customName}"</span>
                <span className="text-dim">{CUSTOM_GROUP}</span>
              </button>
            </li>
          </ul>
        )}
      </div>
      {rows.length > 0 && (
        <ul aria-label="Selected exercises" className="mt-2 flex flex-col gap-2">
          {rows.map((ex, index) => (
            <DoseRowItem
              key={ex.key}
              row={ex}
              isFirst={index === 0}
              isLast={index === rows.length - 1}
              onChange={(change) => updateExercise(ex.key, change)}
              onMove={(by) => moveExercise(index, by)}
              onRemove={() => onRowsChange((list) => list.filter((item) => item.key !== ex.key))}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

/** A plan opened from a Library template (Prompt 58): fills the form, still editable before saving. */
export type TemplatePrefill = { template: WorkoutTemplate; date: string };

type Props = {
  clientId: string;
  /** Called after the plan is saved and the list refreshed. */
  onCreated: (assignment: Assignment) => void;
  /** Start from a template: Workout, its name as title, its exercises, notes and "From template: name". */
  prefill?: TemplatePrefill | null;
  /** Nov 2026: the form opens from "+ New plan"; Cancel closes it without saving. */
  onCancel?: () => void;
};

// Manual create form: same shape as AI plans (type, title, details, reasoning, date),
// saved with source "manual" via POST /api/clients/:clientId/assignments.
export function ManualAssignmentForm({ clientId, onCreated, prefill, onCancel }: Props) {
  const queryClient = useQueryClient();
  const [type, setType] = useState<AssignmentType>("Workout");
  const [title, setTitle] = useState(prefill?.template.name ?? "");
  const [details, setDetails] = useState(prefill?.template.notes ?? "");
  const [reasoning, setReasoning] = useState(prefill ? `From template: ${prefill.template.name}` : "");
  const [date, setDate] = useState(() => prefill?.date || localToday());
  // Picked exercises with their dose (Workout only). Kept while the type changes; saved as the details.
  const [exercises, setExercises] = useState<DoseRow[]>(() => (prefill ? rowsFromTemplate(prefill.template.exercises) : []));
  // Prompt 80: meals from the library on a Nutrition plan (the client sees them with their macros).
  const [mealIds, setMealIds] = useState<string[]>([]);

  const mutation = useMutation({
    mutationFn: (input: NewAssignment) => createAssignment(clientId, input),
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.assignments(clientId) }); // refresh the list
      // Clear only on success - on error every typed value stays.
      setTitle("");
      setDetails("");
      setReasoning("");
      setDate(localToday());
      setExercises([]);
      setMealIds([]);
      onCreated(saved);
    },
  });

  // Workout with exercise rows: details are built from the rows, the textarea is optional notes.
  const fromExercises = type === "Workout" && exercises.length > 0;
  // Every saved plan line needs a rep count ("3 sets × 10 reps"), so a blank Reps box blocks saving.
  const missingReps = fromExercises && exercises.some((r) => r.reps.trim() === "");
  const canSubmit =
    title.trim() !== "" && (fromExercises || details.trim() !== "") && !missingReps && !mutation.isPending;

  function submit(ev: FormEvent) {
    ev.preventDefault();
    if (!canSubmit) return;
    const input: NewAssignment = {
      type,
      title: title.trim(),
      details: fromExercises ? workoutDetails(exercises, details.trim()) : details.trim(),
      reasoning: reasoning.trim(),
      source: "manual",
    };
    if (date) input.date = date;
    if (type === "Nutrition" && mealIds.length > 0) input.mealIds = mealIds;
    mutation.mutate(input);
  }

  return (
    <form onSubmit={submit} noValidate aria-label="New assignment" className="card p-5">
      <h3 className="mb-4 text-xl">New assignment</h3>
      <div role="group" aria-label="Type" className="flex flex-wrap gap-2">
        {ASSIGNMENT_TYPES.map((t) => {
          const isActive = t === type;
          return (
            <button
              key={t}
              type="button"
              aria-pressed={isActive}
              onClick={() => setType(t)}
              className={
                "inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 text-sm font-bold " +
                (isActive
                  ? `border-transparent ${TYPE_CHIP[t]} ring-2 ring-text ring-offset-2 ring-offset-surface`
                  : "border-border bg-surface text-text hover:border-dim")
              }
            >
              {/* Unselected: outlined with a small dot in the type colour; selected: filled. */}
              {!isActive && <span aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-full ${TYPE_DOT[t]}`} />}
              {t}
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex flex-col gap-4">
        <div>
          <label htmlFor="assignment-title" className="mb-1 block text-sm font-semibold text-text">
            Title
          </label>
          <input
            id="assignment-title"
            className={inputClass}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={TITLE_PLACEHOLDER[type]}
            autoComplete="off"
            aria-required="true"
          />
        </div>
        {type === "Workout" && <ExercisePicker rows={exercises} onRowsChange={setExercises} />}
        {type === "Nutrition" && <MealPicker selected={mealIds} onChange={setMealIds} />}
        <div>
          <label htmlFor="assignment-details" className="mb-1 block text-sm font-semibold text-text">
            {fromExercises ? "Extra notes (optional)" : "Details"}
          </label>
          <textarea
            id="assignment-details"
            rows={5}
            className={inputClass + " resize-y"}
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            placeholder={
              fromExercises ? "Warm-up, form cues, tempo." : "Write the full plan - meals with portions, or habit steps."
            }
            aria-required={fromExercises ? undefined : "true"}
          />
        </div>
        <div>
          <label htmlFor="assignment-reasoning" className="mb-1 block text-sm font-semibold text-text">
            Reasoning / why this plan (optional)
          </label>
          <textarea
            id="assignment-reasoning"
            rows={2}
            className={inputClass + " resize-y"}
            value={reasoning}
            onChange={(e) => setReasoning(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="assignment-date" className="mb-1 block text-sm font-semibold text-text">
            Date
          </label>
          <input
            id="assignment-date"
            type="date"
            className={inputClass + " sm:w-auto"}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
      </div>

      {mutation.isError && (
        <p role="alert" className="mt-4 text-sm font-semibold text-accent">
          {plainErrorMessage(mutation.error)}
        </p>
      )}

      {missingReps && <p className="mt-4 text-sm text-dim">Add reps for every exercise to save this plan.</p>}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={!canSubmit}
          className="btn-primary min-h-10 rounded-lg px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
        >
          {mutation.isPending ? "Saving..." : "Assign plan"}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={mutation.isPending}
            className="min-h-10 rounded-lg border border-border bg-surface2 px-4 py-2 text-sm font-semibold text-text hover:border-dim disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

type DoseRowItemProps = {
  row: DoseRow;
  isFirst: boolean;
  isLast: boolean;
  onChange: (change: Partial<Dose>) => void;
  onMove: (by: -1 | 1) => void;
  onRemove: () => void;
};

const smallButton = "rounded-lg border border-border px-2 py-1 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-40";

// One selected exercise: name, sets, reps, rest (number + quick picks), up / down and remove.
function DoseRowItem({ row, isFirst, isLast, onChange, onMove, onRemove }: DoseRowItemProps) {
  return (
    <li className="rounded-card border border-border bg-surface2 px-3 py-2 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-text">{row.name}</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label={`Move ${row.name} up`}
            disabled={isFirst}
            onClick={() => onMove(-1)}
            className={smallButton + " text-dim hover:text-text"}
          >
            ↑
          </button>
          <button
            type="button"
            aria-label={`Move ${row.name} down`}
            disabled={isLast}
            onClick={() => onMove(1)}
            className={smallButton + " text-dim hover:text-text"}
          >
            ↓
          </button>
          <button
            type="button"
            aria-label={`Remove ${row.name}`}
            onClick={onRemove}
            className="px-2 font-bold text-dim hover:text-accent"
          >
            ×
          </button>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs font-semibold text-dim">
          Sets
          <NumberInput
            label={`Sets for ${row.name}`}
            value={row.sets}
            min={MIN_SETS}
            max={MAX_SETS}
            onChange={(sets) => onChange({ sets })}
            className="w-16"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-dim">
          Reps
          <input
            aria-label={`Reps for ${row.name}`}
            className={inputClass + " w-24 py-1"}
            value={row.reps}
            onChange={(e) => onChange({ reps: e.target.value })}
            autoComplete="off"
          />
        </label>
        <div className="flex flex-col gap-1 text-xs font-semibold text-dim">
          Rest (sec)
          <div className="flex flex-wrap items-center gap-1">
            <NumberInput
              label={`Rest seconds for ${row.name}`}
              value={row.rest}
              min={MIN_REST}
              onChange={(rest) => onChange({ rest })}
              className="w-20"
            />
            <div role="group" aria-label={`Rest quick picks for ${row.name}`} className="flex gap-1">
              {REST_PICKS.map((seconds) => {
                const isActive = row.rest === seconds;
                return (
                  <button
                    key={seconds}
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => onChange({ rest: seconds })}
                    className={
                      smallButton + " " + (isActive ? "border-accent bg-accent text-on-accent" : "bg-surface text-text hover:border-dim")
                    }
                  >
                    {seconds}s
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </li>
  );
}

type NumberInputProps = {
  label: string;
  value: number;
  min: number;
  max?: number;
  onChange: (value: number) => void;
  className: string;
};

function clampWhole(raw: string, min: number, max?: number): number {
  const n = Math.round(Number(raw));
  if (raw.trim() === "" || !Number.isFinite(n) || n < min) return min;
  return max !== undefined && n > max ? max : n;
}

// Whole-number input: every change updates state at once (corrected into range); the box keeps
// what was typed until it loses focus, then shows the corrected value.
function NumberInput({ label, value, min, max, onChange, className }: NumberInputProps) {
  const [draft, setDraft] = useState(String(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setDraft(String(value)); // e.g. a rest quick pick
  }, [value, focused]);

  return (
    <input
      type="number"
      aria-label={label}
      min={min}
      max={max}
      step={1}
      className={inputClass + " py-1 " + className}
      value={draft}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        setDraft(String(value));
      }}
      onChange={(e) => {
        setDraft(e.target.value);
        onChange(clampWhole(e.target.value, min, max));
      }}
    />
  );
}

/** Prompt 80: "Add meals from library" for a Nutrition plan (up to 10, in the order picked). */
function MealPicker({ selected, onChange }: { selected: string[]; onChange: (ids: string[]) => void }) {
  const meals = useQuery({ queryKey: queryKeys.meals, queryFn: listMeals });
  const list = meals.data ?? [];
  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : selected.length >= 10 ? selected : [...selected, id]);
  return (
    <fieldset>
      <legend className="mb-1 text-sm font-semibold text-text">Add meals from library (optional)</legend>
      {meals.isPending ? (
        <p className="text-sm text-dim">Loading meals...</p>
      ) : meals.isError ? (
        <p role="alert" className="text-sm font-semibold text-amber-text">
          Couldn't load your meals.
        </p>
      ) : list.length === 0 ? (
        <p className="text-sm text-dim">No meals in your library yet. Add some in the Library tab.</p>
      ) : (
        <ul className="grid max-h-56 gap-1 overflow-y-auto rounded-lg border border-border p-2 sm:grid-cols-2">
          {list.map((m) => (
            <li key={m.id}>
              <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded px-2 text-sm hover:bg-surface2">
                <input type="checkbox" checked={selected.includes(m.id)} onChange={() => toggle(m.id)} className="h-4 w-4" />
                <span className="min-w-0 flex-1 truncate text-text">{m.name}</span>
                <span className="font-mono text-xs text-dim">{m.calories} kcal</span>
              </label>
            </li>
          ))}
        </ul>
      )}
      {selected.length > 0 && <p className="mt-1 text-xs text-dim">{selected.length} meal{selected.length === 1 ? "" : "s"} attached. Your client sees their calories and macros.</p>}
    </fieldset>
  );
}
