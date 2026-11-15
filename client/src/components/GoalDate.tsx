// The day a client is working towards (Inspo C5, Nov 2026), on their workspace header.
//
// Why this earns its place: a coach writing next week's plan for someone whose wedding is in five
// weeks makes different decisions than for someone with no date. The countdown is the whole value -
// a stored date nobody sees is just another field.
//
// Shown as one quiet line that becomes an editor when clicked. No card, no banner: most clients
// have no goal date, and a permanent empty prompt on every client is clutter.
import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys, updateGoal } from "../api";
import { goalLine } from "../lib/goalDate";
import { localToday } from "../tabs/AiCoachTab";
import { plainErrorMessage } from "./States";
import type { Client } from "../types";

export function GoalDate({ client }: { client: Client }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [goalDate, setGoalDate] = useState(client.goalDate ?? "");
  const [goalEvent, setGoalEvent] = useState(client.goalEvent ?? "");

  const save = useMutation({
    mutationFn: () => updateGoal(client.id, { goalDate: goalDate || null, goalEvent: goalEvent.trim() }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.clients });
      setEditing(false);
    },
  });

  const line = goalLine(client.goalDate ?? null, client.goalEvent ?? "", localToday());

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="min-h-10 text-left text-sm text-dim underline decoration-border hover:text-text"
      >
        {/* Nothing set yet reads as an invitation, not as missing data. */}
        {line ?? "Add a goal date"}
      </button>
    );
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    save.mutate();
  }

  return (
    <form onSubmit={submit} noValidate aria-label={`Goal date for ${client.name}`} className="grid gap-2 sm:grid-cols-[10rem_1fr_auto_auto]">
      <div>
        <label htmlFor="goal-date" className="mb-1 block text-xs font-bold text-dim">
          Date
        </label>
        <input
          id="goal-date"
          type="date"
          value={goalDate}
          onChange={(e) => setGoalDate(e.target.value)}
          className="min-h-11 w-full rounded-lg border border-border-strong bg-surface2 px-3 text-sm text-text"
        />
      </div>
      <div>
        <label htmlFor="goal-event" className="mb-1 block text-xs font-bold text-dim">
          What is it?
        </label>
        <input
          id="goal-event"
          value={goalEvent}
          maxLength={80}
          placeholder="Wedding, half marathon, holiday..."
          onChange={(e) => setGoalEvent(e.target.value)}
          className="min-h-11 w-full rounded-lg border border-border-strong bg-surface2 px-3 text-sm text-text"
        />
      </div>
      <div className="flex items-end">
        <button type="submit" disabled={save.isPending} className="btn btn-primary min-h-11">
          {save.isPending ? "Saving..." : "Save"}
        </button>
      </div>
      <div className="flex items-end">
        <button
          type="button"
          className="btn btn-secondary min-h-11"
          onClick={() => {
            // Cancel restores what is stored, so a half-typed date is never left on screen.
            setGoalDate(client.goalDate ?? "");
            setGoalEvent(client.goalEvent ?? "");
            setEditing(false);
          }}
        >
          Cancel
        </button>
      </div>
      {save.isError && (
        <p role="alert" className="text-sm font-semibold text-amber-text sm:col-span-4">
          {plainErrorMessage(save.error)}
        </p>
      )}
    </form>
  );
}
