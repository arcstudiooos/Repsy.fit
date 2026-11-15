// Building a meal's numbers from foods (Inspo N1/N7, Nov 2026).
//
// This is the food catalogue's reason to exist: instead of typing 450 kcal and four macros from
// memory, a coach picks "2 roti + 1 serving paneer" and reads the total.
//
// DELIBERATE CHOICE - and it matters, because the meal library makes a promise:
// the numbers are NEVER changed behind the coach's back. Picking foods shows a running total and a
// single "Use these numbers" button that FILLS the macro boxes, which stay editable afterwards. Same
// one-shot pattern as the calories helper. A mode that silently recalculated on every keystroke
// would take the coach's control away, which is the one thing the library guarantees.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listFoods, queryKeys } from "../api";
import { FOOD_CATEGORIES, type Food, type FoodCategory, type FoodPortion } from "../types";

const field = "w-full rounded-lg border border-border-strong bg-surface2 px-3 py-2 text-sm text-text";

/**
 * One food's numbers at a quantity of servings. Mirrors `scaled` in server routes/foods.ts, which
 * is drift-tested - the server stays the authority, this is for instant feedback while picking.
 */
export function scalePortion(food: Food, servings: number) {
  const q = Number.isFinite(servings) && servings > 0 ? servings : 0;
  const one = (n: number) => Math.round(n * q * 10) / 10;
  return {
    calories: Math.round(food.calories * q),
    proteinG: one(food.proteinG),
    carbsG: one(food.carbsG),
    fatG: one(food.fatG),
    fiberG: one(food.fiberG),
  };
}

/** What a list of portions adds up to. */
export function totalPortions(portions: FoodPortion[]) {
  return portions.reduce(
    (sum, p) => {
      const part = scalePortion(p.food, p.servings);
      const r = (n: number) => Math.round(n * 10) / 10;
      return {
        calories: sum.calories + part.calories,
        proteinG: r(sum.proteinG + part.proteinG),
        carbsG: r(sum.carbsG + part.carbsG),
        fatG: r(sum.fatG + part.fatG),
        fiberG: r(sum.fiberG + part.fiberG),
      };
    },
    { calories: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 },
  );
}

export function FoodPicker({
  onUse,
  onClose,
}: {
  onUse: (total: ReturnType<typeof totalPortions>, portions: FoodPortion[]) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<FoodCategory | "">("");
  const [portions, setPortions] = useState<FoodPortion[]>([]);

  const foods = useQuery({
    queryKey: queryKeys.foods(search.trim(), category),
    queryFn: () => listFoods(search.trim(), category),
  });

  const total = totalPortions(portions);
  const add = (food: Food) => {
    const existing = portions.findIndex((p) => p.food.id === food.id);
    // Picking the same food again means one more serving, not a duplicate row.
    if (existing >= 0) {
      setPortions(portions.map((p, i) => (i === existing ? { ...p, servings: p.servings + 1 } : p)));
    } else {
      setPortions([...portions, { food, servings: 1 }]);
    }
  };

  return (
    <section aria-label="Build from foods" className="mt-3 rounded-card border border-border p-3">
      <p className="text-sm text-dim">
        Pick what is in this meal and Repsy will add it up. Nothing is saved until you use the numbers, and you can edit
        them afterwards.
      </p>

      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_12rem]">
        <div>
          <label htmlFor="food-search" className="mb-1 block text-sm font-semibold text-text">
            Search foods
          </label>
          <input
            id="food-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="roti, paneer, oats..."
            autoComplete="off"
            className={field}
          />
        </div>
        <div>
          <label htmlFor="food-category" className="mb-1 block text-sm font-semibold text-text">
            Category
          </label>
          <select
            id="food-category"
            value={category}
            onChange={(e) => setCategory(e.target.value as FoodCategory | "")}
            className={field + " min-h-11"}
          >
            <option value="">All categories</option>
            {FOOD_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      {foods.isPending ? (
        <p className="mt-3 text-sm text-dim">Loading foods...</p>
      ) : foods.isError ? (
        <p role="alert" className="mt-3 text-sm font-semibold text-amber-text">
          The food list could not load. You can still type the numbers in yourself.
        </p>
      ) : (foods.data ?? []).length === 0 ? (
        <p className="mt-3 text-sm text-dim">No foods match that. Add your own under Library &rarr; Foods.</p>
      ) : (
        <ul aria-label="Foods" className="mt-3 grid max-h-64 gap-1.5 overflow-y-auto">
          {(foods.data ?? []).map((f) => (
            <li key={f.id}>
              <button
                type="button"
                onClick={() => add(f)}
                className="flex min-h-10 w-full flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-1.5 text-left text-sm hover:border-dim"
              >
                <span className="font-semibold text-text">{f.name}</span>
                {/* The serving in words AND grams: a coach thinks in rotis, but weighs in grams. */}
                <span className="text-xs text-dim">
                  {f.servingLabel} · {f.servingG} g · {f.calories} kcal
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {portions.length > 0 && (
        <>
          <ul aria-label="In this meal" className="mt-3 grid gap-2">
            {portions.map((p, i) => (
              <li key={p.food.id} className="flex flex-wrap items-end gap-2">
                <div className="w-24">
                  <label htmlFor={`portion-${p.food.id}`} className="mb-1 block text-xs font-bold text-dim">
                    Servings
                  </label>
                  <input
                    id={`portion-${p.food.id}`}
                    type="number"
                    min={0}
                    step="0.5"
                    value={p.servings}
                    onChange={(e) =>
                      setPortions(portions.map((x, j) => (j === i ? { ...x, servings: Number(e.target.value) } : x)))
                    }
                    className={field}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-text">{p.food.name}</p>
                  <p className="text-xs text-dim">
                    {p.food.servingLabel} each · {scalePortion(p.food, p.servings).calories} kcal
                  </p>
                </div>
                <button
                  type="button"
                  aria-label={`Remove ${p.food.name}`}
                  onClick={() => setPortions(portions.filter((_, j) => j !== i))}
                  className="btn btn-secondary min-h-10"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>

          <p aria-live="polite" className="mt-3 text-sm font-semibold text-text">
            Total: {total.calories} kcal · Protein {total.proteinG}g · Carbs {total.carbsG}g · Fat {total.fatG}g · Fibre{" "}
            {total.fiberG}g
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary min-h-11" onClick={() => onUse(total, portions)}>
              Use these numbers
            </button>
            <button type="button" className="btn btn-secondary min-h-11" onClick={() => setPortions([])}>
              Start again
            </button>
          </div>
        </>
      )}

      <button type="button" className="btn btn-secondary mt-3 min-h-10" onClick={onClose}>
        Close
      </button>
    </section>
  );
}
