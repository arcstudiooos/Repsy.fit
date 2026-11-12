// Meal library (Prompt 60), a section of the Library tab. The coach's own meals: search by name, filter by
// meal type, add / edit / delete (with a confirm) and "Assign to client", which saves a Nutrition assignment.
// Every number is typed in by the coach: no food database, barcode scan or automatic calculation.
import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createAssignment, createMeal, deleteMeal, listClients, listMeals, queryKeys, updateMeal } from "../api";
import { ConfirmDialog } from "./ConfirmDialog";
import { ErrorState, LoadingState, plainErrorMessage } from "./States";
import { localToday } from "../tabs/AiCoachTab";
import { MEAL_TYPES, type Meal, type MealType, type NewMeal } from "../types";

const inputClass =
  "w-full rounded-card border border-border bg-surface2 px-3 py-2 text-text placeholder:text-dim focus:border-accent";
const smallButton = "rounded-lg border border-border px-3 py-1.5 text-sm font-semibold text-text hover:border-dim disabled:opacity-60";

/** Drops a trailing ".0" so 30 reads "30", not "30.0"; keeps one-decimal values like 45.5. */
const num = (n: number) => String(Math.round(n * 10) / 10);

/** The one-line macro summary used on the card and in the assignment details. */
export function macroLine(m: Pick<Meal, "calories" | "proteinG" | "carbsG" | "fatG">): string {
  return `${m.calories} kcal · Protein ${num(m.proteinG)}g · Carbs ${num(m.carbsG)}g · Fat ${num(m.fatG)}g`;
}

/** Assignment details for a meal: its name, macros and steps (as the coach entered them). */
export function mealDetails(m: Meal): string {
  const parts = [m.name, macroLine(m)];
  if (m.steps !== "") parts.push("", m.steps);
  return parts.join("\n");
}

export function MealLibrary() {
  const query = useQuery({ queryKey: queryKeys.meals, queryFn: listMeals });
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<MealType | "All">("All");
  // null = no form; "new" = creating; a meal = editing it.
  const [editing, setEditing] = useState<Meal | "new" | null>(null);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<Meal | null>(null);
  const queryClient = useQueryClient();

  const remove = useMutation({
    mutationFn: (id: string) => deleteMeal(id),
    onSuccess: async () => {
      setToDelete(null);
      await queryClient.invalidateQueries({ queryKey: queryKeys.meals });
    },
  });

  const all = query.data ?? [];
  const needle = search.trim().toLowerCase();
  const shown = all.filter(
    (m) => (typeFilter === "All" || m.mealType === typeFilter) && (needle === "" || m.name.toLowerCase().includes(needle)),
  );

  return (
    <section aria-labelledby="meal-library-heading" className="mt-10">
      <h3 id="meal-library-heading" className="text-xl">
        Meal library
      </h3>
      <p className="mt-1 text-sm text-dim">Your own meals, with the calories and macros you enter. Assign one to any client as a Nutrition plan.</p>

      {editing ? (
        <MealForm key={editing === "new" ? "new" : editing.id} meal={editing === "new" ? null : editing} onDone={() => setEditing(null)} />
      ) : (
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1 basis-60">
            <label htmlFor="meal-search" className="mb-1 block text-sm font-semibold text-text">
              Search meals
            </label>
            <input
              id="meal-search"
              type="search"
              className={inputClass}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name"
              autoComplete="off"
            />
          </div>
          <div>
            <label htmlFor="meal-type-filter" className="mb-1 block text-sm font-semibold text-text">
              Meal type
            </label>
            <select
              id="meal-type-filter"
              className={inputClass + " sm:w-auto"}
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as MealType | "All")}
            >
              <option value="All">All meal types</option>
              {MEAL_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <button type="button" onClick={() => setEditing("new")} className="btn-primary rounded-lg px-4 py-2 text-sm">
            New meal
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
            No meals yet. Add one with New meal - you enter the calories and macros yourself.
          </p>
        ) : shown.length === 0 ? (
          <p className="rounded-card bg-surface2 px-4 py-6 text-center text-dim">No meal matches your search.</p>
        ) : (
          <ul aria-label="Meals" className="flex flex-col gap-3">
            {shown.map((m) => (
              <li key={m.id} className="card p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="text-lg font-semibold">{m.name}</h4>
                  <span className="rounded-full border border-border px-2 py-0.5 text-xs font-semibold text-dim">{m.mealType}</span>
                </div>
                <p className="mt-2 font-mono text-sm text-text">{macroLine(m)}</p>
                <p className="text-xs text-dim">Coach-entered values</p>
                {m.ingredients !== "" && (
                  <p className="mt-2 whitespace-pre-wrap text-sm text-text">
                    <span className="font-semibold">Ingredients: </span>
                    {m.ingredients}
                  </p>
                )}
                {m.steps !== "" && (
                  <p className="mt-1 whitespace-pre-wrap text-sm text-dim">
                    <span className="font-semibold text-text">Steps: </span>
                    {m.steps}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    aria-label={`Assign ${m.name} to client`}
                    aria-expanded={assigning === m.id}
                    onClick={() => setAssigning(assigning === m.id ? null : m.id)}
                    className="btn-primary rounded-lg px-3 py-1.5 text-sm"
                  >
                    Assign to client
                  </button>
                  <button type="button" aria-label={`Edit ${m.name}`} onClick={() => setEditing(m)} className={smallButton}>
                    Edit
                  </button>
                  <button type="button" aria-label={`Delete ${m.name}`} onClick={() => setToDelete(m)} className={smallButton}>
                    Delete
                  </button>
                </div>
                {assigning === m.id && <AssignPanel meal={m} />}
              </li>
            ))}
          </ul>
        )}
      </div>

      {toDelete && (
        <ConfirmDialog
          title="Delete this meal?"
          confirmLabel="Delete"
          pendingLabel="Deleting..."
          pending={remove.isPending}
          onConfirm={() => remove.mutate(toDelete.id)}
          onCancel={() => {
            remove.reset();
            setToDelete(null);
          }}
        >
          "{toDelete.name}" will be removed from your meal library. Plans already assigned from it stay as they are.
          {remove.isError && (
            <span role="alert" className="mt-2 block text-sm font-semibold text-accent">
              {plainErrorMessage(remove.error)}
            </span>
          )}
        </ConfirmDialog>
      )}
    </section>
  );
}

// Pick a client and a date; saves a Nutrition assignment right away (source "manual", reasoning pre-filled).
function AssignPanel({ meal }: { meal: Meal }) {
  const queryClient = useQueryClient();
  const clients = useQuery({ queryKey: queryKeys.clients, queryFn: listClients });
  const [clientId, setClientId] = useState("");
  const [date, setDate] = useState(localToday);
  const list = clients.data ?? [];
  const chosen = clientId || list[0]?.id || "";
  const chosenName = list.find((c) => c.id === chosen)?.name ?? "";

  const assign = useMutation({
    mutationFn: () =>
      createAssignment(chosen, {
        type: "Nutrition",
        title: meal.name,
        details: mealDetails(meal),
        reasoning: `From meal library: ${meal.name}`,
        source: "manual",
        date: date || localToday(),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.assignments(chosen) });
    },
  });

  return (
    <div role="group" aria-label={`Assign ${meal.name}`} className="mt-3 rounded-card bg-surface2 p-3">
      {clients.isPending ? (
        <LoadingState />
      ) : clients.isError ? (
        <ErrorState error={clients.error} onRetry={() => void clients.refetch()} />
      ) : list.length === 0 ? (
        <p className="text-sm text-dim">Add a client first, then you can assign this meal.</p>
      ) : (
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor={`meal-client-${meal.id}`} className="mb-1 block text-xs font-semibold text-dim">
              Client
            </label>
            <select
              id={`meal-client-${meal.id}`}
              className={inputClass + " sm:w-auto"}
              value={chosen}
              onChange={(e) => {
                setClientId(e.target.value);
                assign.reset();
              }}
            >
              {list.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={`meal-date-${meal.id}`} className="mb-1 block text-xs font-semibold text-dim">
              Date
            </label>
            <input
              id={`meal-date-${meal.id}`}
              type="date"
              className={inputClass + " sm:w-auto"}
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                assign.reset();
              }}
            />
          </div>
          <button
            type="button"
            disabled={assign.isPending}
            onClick={() => assign.mutate()}
            className="btn-primary rounded-lg px-4 py-2 text-sm disabled:opacity-60"
          >
            {assign.isPending ? "Assigning..." : "Assign meal"}
          </button>
        </div>
      )}
      {assign.isSuccess && (
        <p role="status" className="mt-2 text-sm font-semibold text-accent2">
          Assigned to {chosenName} as a Nutrition plan.
        </p>
      )}
      {assign.isError && (
        <p role="alert" className="mt-2 text-sm font-semibold text-accent">
          {plainErrorMessage(assign.error)}
        </p>
      )}
    </div>
  );
}

const toNumber = (s: string) => (s.trim() === "" ? NaN : Number(s));

// Create / edit form. All four numbers are required and typed in by the coach.
function MealForm({ meal, onDone }: { meal: Meal | null; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(meal?.name ?? "");
  const [mealType, setMealType] = useState<MealType>(meal?.mealType ?? "Breakfast");
  const [calories, setCalories] = useState(meal ? String(meal.calories) : "");
  const [proteinG, setProteinG] = useState(meal ? String(meal.proteinG) : "");
  const [carbsG, setCarbsG] = useState(meal ? String(meal.carbsG) : "");
  const [fatG, setFatG] = useState(meal ? String(meal.fatG) : "");
  const [ingredients, setIngredients] = useState(meal?.ingredients ?? "");
  const [steps, setSteps] = useState(meal?.steps ?? "");
  const [formError, setFormError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (input: NewMeal) => (meal ? updateMeal(meal.id, input) : createMeal(input)),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.meals });
      onDone();
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (name.trim() === "") return setFormError("Give the meal a name.");
    const kcal = toNumber(calories);
    if (!Number.isInteger(kcal) || kcal < 0 || kcal > 10000) return setFormError("Calories must be a whole number from 0 to 10000.");
    const macros = { proteinG: toNumber(proteinG), carbsG: toNumber(carbsG), fatG: toNumber(fatG) };
    for (const [label, v] of [["Protein", macros.proteinG], ["Carbs", macros.carbsG], ["Fat", macros.fatG]] as const) {
      if (!Number.isFinite(v) || v < 0 || v > 1000) return setFormError(`${label} must be a number from 0 to 1000.`);
    }
    setFormError(null);
    save.mutate({ name: name.trim(), mealType, calories: kcal, ...macros, ingredients: ingredients.trim(), steps: steps.trim() });
  }

  const problem = formError ?? (save.isError ? plainErrorMessage(save.error) : null);
  const numberField = (id: string, label: string, value: string, set: (v: string) => void, step: string) => (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-semibold text-text">
        {label}
      </label>
      <input id={id} type="number" inputMode="decimal" min={0} step={step} className={inputClass} value={value} onChange={(e) => set(e.target.value)} />
    </div>
  );

  return (
    <form onSubmit={submit} noValidate aria-label={meal ? "Edit meal" : "New meal"} className="card mt-4 p-5">
      <h4 className="mb-4 text-xl font-semibold">{meal ? "Edit meal" : "New meal"}</h4>
      <div className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
          <div>
            <label htmlFor="meal-name" className="mb-1 block text-sm font-semibold text-text">
              Meal name
            </label>
            <input
              id="meal-name"
              className={inputClass}
              value={name}
              maxLength={100}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Greek yoghurt bowl"
              autoComplete="off"
              aria-required="true"
            />
          </div>
          <div>
            <label htmlFor="meal-type" className="mb-1 block text-sm font-semibold text-text">
              Type
            </label>
            <select id="meal-type" className={inputClass} value={mealType} onChange={(e) => setMealType(e.target.value as MealType)}>
              {MEAL_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>
        <fieldset>
          <legend className="mb-1 text-sm font-semibold text-text">Coach-entered values</legend>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {numberField("meal-calories", "Calories (kcal)", calories, setCalories, "1")}
            {numberField("meal-protein", "Protein (g)", proteinG, setProteinG, "any")}
            {numberField("meal-carbs", "Carbs (g)", carbsG, setCarbsG, "any")}
            {numberField("meal-fat", "Fat (g)", fatG, setFatG, "any")}
          </div>
        </fieldset>
        <div>
          <label htmlFor="meal-ingredients" className="mb-1 block text-sm font-semibold text-text">
            Ingredients (optional)
          </label>
          <textarea
            id="meal-ingredients"
            rows={3}
            className={inputClass + " resize-y"}
            value={ingredients}
            maxLength={2000}
            onChange={(e) => setIngredients(e.target.value)}
            placeholder="One per line. Values above are not calculated from this list."
          />
        </div>
        <div>
          <label htmlFor="meal-steps" className="mb-1 block text-sm font-semibold text-text">
            Steps (optional)
          </label>
          <textarea
            id="meal-steps"
            rows={3}
            className={inputClass + " resize-y"}
            value={steps}
            maxLength={4000}
            onChange={(e) => setSteps(e.target.value)}
            placeholder="How to make it."
          />
        </div>
      </div>
      {problem && (
        <p role="alert" className="mt-4 text-sm font-semibold text-accent">
          {problem}
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="submit" disabled={save.isPending} className="btn-primary rounded-lg px-4 py-2 text-sm disabled:opacity-60">
          {save.isPending ? "Saving..." : "Save meal"}
        </button>
        <button type="button" onClick={onDone} disabled={save.isPending} className={smallButton}>
          Cancel
        </button>
      </div>
    </form>
  );
}
