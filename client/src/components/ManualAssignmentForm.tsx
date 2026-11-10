import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createAssignment, queryKeys } from "../api";
import { plainErrorMessage } from "./States";
import { localToday, TYPE_CHIP } from "../tabs/AiCoachTab";
import { ASSIGNMENT_TYPES, type Assignment, type AssignmentType, type NewAssignment } from "../types";

// Inputs: --surface2 background, 14px radius (design system).
const inputClass =
  "w-full rounded-card border border-border bg-surface2 px-3 py-2 text-text placeholder:text-dim " +
  "focus:border-accent focus:outline-none";

const TITLE_PLACEHOLDER: Record<AssignmentType, string> = {
  Workout: "e.g. Push day - chest & shoulders",
  Nutrition: "e.g. 1800 kcal high-protein day",
  Habit: "e.g. Daily 10k steps",
  Recovery: "e.g. Foam roll + 20 min mobility",
};

type Props = {
  clientId: string;
  /** Called after the plan is saved and the list refreshed. */
  onCreated: (assignment: Assignment) => void;
};

// Manual create form: same shape as AI plans (type, title, details, reasoning, date),
// saved with source "manual" via POST /api/clients/:clientId/assignments.
export function ManualAssignmentForm({ clientId, onCreated }: Props) {
  const queryClient = useQueryClient();
  const [type, setType] = useState<AssignmentType>("Workout");
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [reasoning, setReasoning] = useState("");
  const [date, setDate] = useState(localToday);

  const mutation = useMutation({
    mutationFn: (input: NewAssignment) => createAssignment(clientId, input),
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.assignments(clientId) }); // refresh the list
      // Clear only on success - on error every typed value stays.
      setTitle("");
      setDetails("");
      setReasoning("");
      setDate(localToday());
      onCreated(saved);
    },
  });

  const canSubmit = title.trim() !== "" && details.trim() !== "" && !mutation.isPending;

  function submit(ev: FormEvent) {
    ev.preventDefault();
    if (!canSubmit) return;
    const input: NewAssignment = {
      type,
      title: title.trim(),
      details: details.trim(),
      reasoning: reasoning.trim(),
      source: "manual",
    };
    if (date) input.date = date;
    mutation.mutate(input);
  }

  return (
    <form onSubmit={submit} noValidate aria-label="New assignment" className="card mt-6 p-5">
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
                `rounded-lg px-3 py-1.5 text-sm font-bold ${TYPE_CHIP[t]} ` +
                (isActive ? "ring-2 ring-text ring-offset-2 ring-offset-surface" : "opacity-50 hover:opacity-75")
              }
            >
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
        <div>
          <label htmlFor="assignment-details" className="mb-1 block text-sm font-semibold text-text">
            Details
          </label>
          <textarea
            id="assignment-details"
            rows={5}
            className={inputClass + " resize-y"}
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            placeholder="Write the full plan - meals with portions, or habit steps."
            aria-required="true"
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

      <button
        type="submit"
        disabled={!canSubmit}
        className="btn-primary mt-4 rounded-lg px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
      >
        {mutation.isPending ? "Saving..." : "Assign plan"}
      </button>
    </form>
  );
}
