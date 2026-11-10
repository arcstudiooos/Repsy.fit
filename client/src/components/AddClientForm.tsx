import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient, queryKeys } from "../api";
import { plainErrorMessage } from "./States";
import { GOALS, LEVELS, type Client, type Level, type NewClient } from "../types";

const OTHER_GOAL = "__other__";

// Inputs: --surface2 background, 14px radius (design system).
const inputClass =
  "w-full rounded-card border border-border bg-surface2 px-3 py-2 text-text placeholder:text-dim " +
  "focus:border-accent";
const invalidClass = " border-accent";

type Props = {
  /** Called after the client is saved and the list refreshed. */
  onCreated: (client: Client) => void;
  /** Shows a Cancel button (hidden when the form must stay open, e.g. zero clients). */
  onCancel?: () => void;
  /** Increase to move keyboard focus to the Name field (e.g. after "Add client"). 0 = don't. */
  focusSignal?: number;
};

type Errors = Partial<Record<"name" | "goal" | "age" | "weightKg" | "heightCm", string>>;

/** Positive number check for the optional number fields ("" = not given). */
function numberError(raw: string, label: string, wholeNumber = false): string | undefined {
  if (raw.trim() === "") return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n)) return `${label} must be a number`;
  if (n < 0) return `${label} can't be negative`;
  if (n === 0) return `${label} must be more than 0`;
  if (wholeNumber && !Number.isInteger(n)) return `${label} must be a whole number`;
  return undefined;
}

export function AddClientForm({ onCreated, onCancel, focusSignal = 0 }: Props) {
  const queryClient = useQueryClient();
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (focusSignal > 0) nameRef.current?.focus();
  }, [focusSignal]);
  const [name, setName] = useState("");
  const [goalChoice, setGoalChoice] = useState(""); // "" = not chosen (server default)
  const [goalOther, setGoalOther] = useState("");
  const [age, setAge] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [level, setLevel] = useState<Level>("Beginner");
  const [focus, setFocus] = useState("");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Errors>({});

  const mutation = useMutation({
    mutationFn: createClient,
    onSuccess: async (client) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.clients }); // refresh the list
      onCreated(client);
    },
  });

  function validate(): Errors {
    const e: Errors = {};
    if (name.trim() === "") e.name = "Name is required";
    if (goalChoice === OTHER_GOAL && goalOther.trim() === "") e.goal = "Type a goal, or pick one from the list";
    e.age = numberError(age, "Age", true);
    e.weightKg = numberError(weightKg, "Weight");
    e.heightCm = numberError(heightCm, "Height");
    return Object.fromEntries(Object.entries(e).filter(([, v]) => v)) as Errors;
  }

  function submit(ev: FormEvent) {
    ev.preventDefault();
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length > 0) return; // do not submit

    const input: NewClient = { name: name.trim(), level };
    const goal = goalChoice === OTHER_GOAL ? goalOther.trim() : goalChoice;
    if (goal) input.goal = goal;
    if (age.trim()) input.age = Number(age);
    if (weightKg.trim()) input.weightKg = Number(weightKg);
    if (heightCm.trim()) input.heightCm = Number(heightCm);
    if (focus.trim()) input.focus = focus.trim();
    if (notes.trim()) input.notes = notes.trim();
    mutation.mutate(input);
  }

  return (
    <form onSubmit={submit} noValidate aria-label="Add client" className="card mb-5 p-5">
      <h3 className="mb-4 text-xl">Add client</h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field id="client-name" label="Name" error={errors.name} className="sm:col-span-2">
          <input
            ref={nameRef}
            id="client-name"
            className={inputClass + (errors.name ? invalidClass : "")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="off"
            aria-required="true"
            aria-invalid={!!errors.name}
            aria-describedby={errors.name ? "client-name-error" : undefined}
          />
        </Field>

        <Field id="client-goal" label="Goal" error={errors.goal}>
          <select
            id="client-goal"
            className={inputClass}
            value={goalChoice}
            onChange={(e) => setGoalChoice(e.target.value)}
          >
            <option value="">Choose a goal (optional)</option>
            {GOALS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
            <option value={OTHER_GOAL}>Other - type your own</option>
          </select>
          {goalChoice === OTHER_GOAL && (
            <input
              id="client-goal-other"
              aria-label="Your goal"
              className={inputClass + " mt-2" + (errors.goal ? invalidClass : "")}
              value={goalOther}
              onChange={(e) => setGoalOther(e.target.value)}
              placeholder="e.g. Powerlifting meet prep"
              aria-invalid={!!errors.goal}
              aria-describedby={errors.goal ? "client-goal-error" : undefined}
            />
          )}
        </Field>

        <Field id="client-level" label="Level">
          <select
            id="client-level"
            className={inputClass}
            value={level}
            onChange={(e) => setLevel(e.target.value as Level)}
          >
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-3 gap-3 sm:col-span-2">
          {(
            [
              ["client-age", "Age", age, setAge, errors.age, "1"],
              ["client-weight", "Weight kg", weightKg, setWeightKg, errors.weightKg, "any"],
              ["client-height", "Height cm", heightCm, setHeightCm, errors.heightCm, "any"],
            ] as const
          ).map(([id, label, value, set, error, step]) => (
            <Field key={id} id={id} label={label} error={error}>
              <input
                id={id}
                type="number"
                inputMode="decimal"
                min={0}
                step={step}
                className={inputClass + (error ? invalidClass : "")}
                value={value}
                onChange={(e) => set(e.target.value)}
                aria-invalid={!!error}
                aria-describedby={error ? `${id}-error` : undefined}
              />
            </Field>
          ))}
        </div>

        <Field id="client-focus" label="Focus" className="sm:col-span-2">
          <input
            id="client-focus"
            className={inputClass}
            value={focus}
            onChange={(e) => setFocus(e.target.value)}
            placeholder="e.g. Lower body strength, protein intake"
          />
        </Field>

        <Field id="client-notes" label="Notes" className="sm:col-span-2">
          <textarea
            id="client-notes"
            rows={3}
            className={inputClass + " resize-y"}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Vegetarian. Trains 4x/week. Sleep inconsistent."
          />
        </Field>
      </div>

      {mutation.isError && (
        <p role="alert" className="mt-4 text-sm font-semibold text-amber-text">
          Couldn't save the client: {plainErrorMessage(mutation.error)}
        </p>
      )}

      <div className="mt-5 flex flex-wrap gap-3">
        <button type="submit" disabled={mutation.isPending} className="btn-primary rounded-lg px-4 py-2 text-sm disabled:opacity-60">
          {mutation.isPending ? "Saving..." : "Save client"}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-border bg-surface2 px-4 py-2 text-sm font-semibold text-text hover:border-dim"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

/** Label above the field, error message under it. */
function Field({
  id,
  label,
  error,
  className = "",
  children,
}: {
  id: string;
  label: string;
  error?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-sm font-semibold text-text">
        {label}
      </label>
      {children}
      {error && (
        <p id={`${id}-error`} className="mt-1 text-sm font-semibold text-amber-text">
          {error}
        </p>
      )}
    </div>
  );
}
