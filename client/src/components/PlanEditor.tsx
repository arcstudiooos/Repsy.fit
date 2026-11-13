// The plan editor fields (title, details, why, and optionally the date). Shared by the AI Coach
// suggestion / draft card ("Edit" before assigning) and the Plans card's "Edit" (saved with PATCH).
export type PlanFields = { title: string; details: string; reasoning: string; date?: string };

type Props = {
  /** Prefix for the input ids, unique on the page. */
  idPrefix: string;
  value: PlanFields;
  onChange: (next: PlanFields) => void;
  /** Show the date input (Plans edit). */
  withDate?: boolean;
};

const field = "w-full rounded-lg border border-border bg-surface2 px-3 py-2 text-sm text-text";

/** Title and details are required; returns the first problem in plain words, or null. */
export function planProblem(plan: PlanFields): string | null {
  if (plan.title.trim() === "") return "Give the plan a title.";
  if (plan.details.trim() === "") return "The plan needs some details.";
  if (plan.date !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(plan.date)) return "Pick a date for the plan.";
  return null;
}

export function PlanEditor({ idPrefix, value: plan, onChange, withDate = false }: Props) {
  return (
    <>
      <div>
        <label htmlFor={`${idPrefix}-title`} className="mb-1 block text-sm font-semibold">
          Title
        </label>
        <input id={`${idPrefix}-title`} value={plan.title} maxLength={200} onChange={(e) => onChange({ ...plan, title: e.target.value })} className={field} />
      </div>
      <div>
        <label htmlFor={`${idPrefix}-details`} className="mb-1 block text-sm font-semibold">
          Plan details
        </label>
        <textarea
          id={`${idPrefix}-details`}
          value={plan.details}
          rows={Math.min(18, Math.max(6, plan.details.split("\n").length + 1))}
          maxLength={6000}
          onChange={(e) => onChange({ ...plan, details: e.target.value })}
          className={`${field} font-mono`}
        />
        <p className="mt-1 text-xs text-dim">Exercise lines: 1. Bench Press — 4 sets × 6 reps · 60 kg · Rest 120s</p>
      </div>
      <div>
        <label htmlFor={`${idPrefix}-why`} className="mb-1 block text-sm font-semibold">
          Why this plan
        </label>
        <textarea
          id={`${idPrefix}-why`}
          value={plan.reasoning}
          rows={3}
          maxLength={2000}
          onChange={(e) => onChange({ ...plan, reasoning: e.target.value })}
          className={field}
        />
      </div>
      {withDate && (
        <div>
          <label htmlFor={`${idPrefix}-date`} className="mb-1 block text-sm font-semibold">
            Date
          </label>
          <input
            id={`${idPrefix}-date`}
            type="date"
            value={plan.date ?? ""}
            onChange={(e) => onChange({ ...plan, date: e.target.value })}
            className={`${field} sm:w-auto`}
          />
        </div>
      )}
    </>
  );
}
