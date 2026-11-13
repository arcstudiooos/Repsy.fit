// Macro calculator (Prompt 61), a section of the Library tab. The maths runs on the server (POST /api/macros);
// the result is a starting estimate for coaching only. "Save as Nutrition assignment" saves it for a client.
// Adults only: the form stops with a plain message when the age is under 18.
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { calculateMacros, createAssignment, listClients, queryKeys, saveClientTargets } from "../api";
import { plainErrorMessage } from "./States";
import { localToday } from "../tabs/AiCoachTab";
import { ACTIVITY_LEVELS, GOALS, SEXES, type ActivityLevel, type Client, type MacroInput, type Sex } from "../types";

const inputClass =
  "w-full rounded-card border border-border bg-surface2 px-3 py-2 text-text placeholder:text-dim focus:border-accent";

/** The exact disclaimer line; it is shown on the result and saved in the assignment's reasoning. */
export const MACRO_DISCLAIMER = "Starting estimate for coaching only - not medical advice. Adjust from the client's real progress.";
export const UNDER_18_MESSAGE = "Macros are only calculated for adults aged 18 or older.";

type Props = {
  /** Pre-fill from this client (the link in Check-ins / Progress). */
  initialClientId?: string | null;
  /** Called once on mount so the app forgets the pre-fill (it is used once). */
  onPrefillUsed?: () => void;
};

export function MacroCalculator({ initialClientId = null, onPrefillUsed }: Props) {
  const queryClient = useQueryClient();
  const clients = useQuery({ queryKey: queryKeys.clients, queryFn: listClients });
  const list = clients.data ?? [];
  const sectionRef = useRef<HTMLElement>(null);

  const [clientId, setClientId] = useState("");
  const [weight, setWeight] = useState("");
  const [height, setHeight] = useState("");
  const [age, setAge] = useState("");
  const [sex, setSex] = useState<Sex | "">("");
  const [activity, setActivity] = useState<ActivityLevel | "">("");
  const [goal, setGoal] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [date, setDate] = useState(localToday);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pending, setPending] = useState(initialClientId);

  const calc = useMutation({ mutationFn: (input: MacroInput) => calculateMacros(input) });
  // Prompt 80: the result as the client's daily targets (shown in their Nutrition view).
  const saveTargets = useMutation({
    mutationFn: (v: { clientId: string; calories: number; proteinG: number }) =>
      saveClientTargets(v.clientId, { calorieTarget: v.calories, proteinTargetG: v.proteinG }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.clients }),
  });
  const save = useMutation({
    mutationFn: (v: { clientId: string; result: NonNullable<typeof calc.data>; input: MacroInput }) =>
      createAssignment(v.clientId, {
        type: "Nutrition",
        title: `Macro targets: ${v.result.calories} kcal`,
        details: [
          `${v.result.calories} kcal · Protein ${v.result.proteinG}g · Carbs ${v.result.carbsG}g · Fat ${v.result.fatG}g`,
          `Goal: ${v.input.goal}. Activity: ${v.input.activity}.`,
        ].join("\n"),
        reasoning: `Calculated with Mifflin-St Jeor for the goal "${v.input.goal}". ${MACRO_DISCLAIMER}`,
        source: "manual",
        date: date || localToday(),
      }),
    onSuccess: async (_a, v) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.assignments(v.clientId) });
    },
  });

  useEffect(() => {
    onPrefillUsed?.();
  }, [onPrefillUsed]);

  function fillFrom(c: Client) {
    setWeight(c.weightKg != null ? String(c.weightKg) : "");
    setHeight(c.heightCm != null ? String(c.heightCm) : "");
    setAge(c.age != null ? String(c.age) : "");
    setGoal(c.goal);
  }

  // Apply the pre-fill once the clients have loaded.
  useEffect(() => {
    if (!pending || !clients.data) return;
    const c = clients.data.find((x) => x.id === pending);
    if (c) {
      setClientId(c.id);
      fillFrom(c);
      sectionRef.current?.scrollIntoView?.({ block: "start" });
    }
    setPending(null);
  }, [pending, clients.data]);

  /** Any change to the inputs makes the shown result stale, so it is cleared. */
  const edited = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setFormError(null);
    calc.reset();
    save.reset();
    saveTargets.reset();
    setSaveError(null);
  };

  function submit(e: FormEvent) {
    e.preventDefault();
    setSaveError(null);
    save.reset();
    const ageN = age.trim() === "" ? NaN : Number(age);
    if (!Number.isInteger(ageN) || ageN < 1 || ageN > 120) return setFormError("Age must be a whole number from 1 to 120.");
    if (ageN < 18) {
      calc.reset();
      return setFormError(UNDER_18_MESSAGE);
    }
    const weightN = weight.trim() === "" ? NaN : Number(weight);
    if (!Number.isFinite(weightN) || weightN <= 0 || weightN > 500) return setFormError("Weight must be above 0 and at most 500 kg.");
    const heightN = height.trim() === "" ? NaN : Number(height);
    if (!Number.isFinite(heightN) || heightN <= 0 || heightN > 300) return setFormError("Height must be above 0 and at most 300 cm.");
    if (sex === "") return setFormError("Choose Female or Male (the formula needs it).");
    if (activity === "") return setFormError("Choose an activity level.");
    if (goal.trim() === "") return setFormError("Choose or type a goal.");
    setFormError(null);
    calc.mutate({ weightKg: weightN, heightCm: heightN, age: ageN, sex, activity, goal: goal.trim() });
  }

  function saveAssignment() {
    if (!calc.data || !calc.variables) return;
    if (clientId === "") return setSaveError("Choose a client to save this for.");
    setSaveError(null);
    save.mutate({ clientId, result: calc.data, input: calc.variables });
  }

  const problem = formError ?? (calc.isError ? plainErrorMessage(calc.error) : null);
  const clientName = list.find((c) => c.id === clientId)?.name ?? "";
  const labelClass = "mb-1 block text-sm font-semibold text-text";

  return (
    <section ref={sectionRef} id="macro-calculator" aria-labelledby="macro-calculator-heading" className="mt-4">
      <h3 id="macro-calculator-heading" className="card-title">
        Macro calculator
      </h3>
      <p className="mt-1 text-sm text-dim">
        A starting estimate for adults, from weight, height, age, sex, activity and goal. Pick a client to fill in what is known.
      </p>

      <form onSubmit={submit} noValidate aria-label="Macro calculator" className="card mt-4 p-5">
        <div className="flex flex-col gap-4">
          <div>
            <label htmlFor="macro-client" className={labelClass}>
              Client (optional)
            </label>
            <select
              id="macro-client"
              className={inputClass}
              value={clientId}
              onChange={(e) => {
                edited(setClientId)(e.target.value);
                const c = list.find((x) => x.id === e.target.value);
                if (c) fillFrom(c);
              }}
            >
              <option value="">No client chosen</option>
              {list.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor="macro-weight" className={labelClass}>
                Weight (kg)
              </label>
              <input id="macro-weight" type="number" inputMode="decimal" min={0} step="any" className={inputClass} value={weight} onChange={(e) => edited(setWeight)(e.target.value)} />
            </div>
            <div>
              <label htmlFor="macro-height" className={labelClass}>
                Height (cm)
              </label>
              <input id="macro-height" type="number" inputMode="decimal" min={0} step="any" className={inputClass} value={height} onChange={(e) => edited(setHeight)(e.target.value)} />
            </div>
            <div>
              <label htmlFor="macro-age" className={labelClass}>
                Age
              </label>
              <input id="macro-age" type="number" inputMode="numeric" min={0} step="1" className={inputClass} value={age} onChange={(e) => edited(setAge)(e.target.value)} />
            </div>
            <div>
              <label htmlFor="macro-sex" className={labelClass}>
                Sex
              </label>
              <select id="macro-sex" className={inputClass} value={sex} onChange={(e) => edited(setSex)(e.target.value as Sex | "")}>
                <option value="">Choose...</option>
                {SEXES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="macro-activity" className={labelClass}>
                Activity level
              </label>
              <select
                id="macro-activity"
                className={inputClass}
                value={activity}
                onChange={(e) => edited(setActivity)(e.target.value as ActivityLevel | "")}
              >
                <option value="">Choose...</option>
                {ACTIVITY_LEVELS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="macro-goal" className={labelClass}>
                Goal
              </label>
              <input
                id="macro-goal"
                list="macro-goals"
                className={inputClass}
                value={goal}
                maxLength={100}
                onChange={(e) => edited(setGoal)(e.target.value)}
                autoComplete="off"
              />
              <datalist id="macro-goals">
                {GOALS.map((g) => (
                  <option key={g} value={g} />
                ))}
              </datalist>
            </div>
          </div>
        </div>
        {problem && (
          <p role="alert" className="mt-4 text-sm font-semibold text-accent">
            {problem}
          </p>
        )}
        <div className="mt-4">
          <button type="submit" disabled={calc.isPending} className="btn btn-primary">
            {calc.isPending ? "Calculating..." : "Calculate"}
          </button>
        </div>
      </form>

      {calc.data && (
        <div role="region" aria-label="Macro result" className="card mt-4 p-5">
          <p className="font-heading text-4xl">{calc.data.calories} kcal</p>
          <p className="mt-2 font-mono text-sm text-text">
            Protein {calc.data.proteinG}g · Carbs {calc.data.carbsG}g · Fat {calc.data.fatG}g
          </p>
          <p className="mt-1 text-xs text-dim">
            Maintenance about {calc.data.tdee} kcal (resting {calc.data.bmr} kcal).
          </p>
          <p className="mt-3 text-sm font-semibold text-text">{MACRO_DISCLAIMER}</p>

          <div className="mt-4 flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="macro-save-date" className="mb-1 block text-xs font-semibold text-dim">
                Date
              </label>
              <input
                id="macro-save-date"
                type="date"
                className={inputClass + " sm:w-auto"}
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  save.reset();
                }}
              />
            </div>
            <button
              type="button"
              disabled={save.isPending}
              onClick={saveAssignment}
              className="btn btn-primary"
            >
              {save.isPending ? "Saving..." : "Save as Nutrition assignment"}
            </button>
            <button
              type="button"
              disabled={saveTargets.isPending}
              onClick={() => {
                if (!calc.data) return;
                if (clientId === "") return setSaveError("Choose a client to save this for.");
                setSaveError(null);
                saveTargets.mutate({ clientId, calories: calc.data.calories, proteinG: calc.data.proteinG });
              }}
              className="btn btn-secondary"
            >
              {saveTargets.isPending ? "Saving..." : clientName ? `Save as ${clientName}'s daily targets` : "Save as daily targets"}
            </button>
          </div>
          {saveError && (
            <p role="alert" className="mt-2 text-sm font-semibold text-accent">
              {saveError}
            </p>
          )}
          {save.isError && (
            <p role="alert" className="mt-2 text-sm font-semibold text-accent">
              {plainErrorMessage(save.error)}
            </p>
          )}
          {saveTargets.isError && (
            <p role="alert" className="mt-2 text-sm font-semibold text-accent">
              {plainErrorMessage(saveTargets.error)}
            </p>
          )}
          {saveTargets.isSuccess && (
            <p role="status" className="mt-2 text-sm font-semibold text-accent2">
              Saved as {clientName}'s daily targets: {calc.data.calories} kcal, {calc.data.proteinG} g protein.
            </p>
          )}
          {save.isSuccess && (
            <p role="status" className="mt-2 text-sm font-semibold text-accent2">
              Saved for {clientName} as a Nutrition plan.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
