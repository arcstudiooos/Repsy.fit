// Habit tracker (Prompt 54), a section of the Check-ins tab: the selected client's habits as rows,
// the last 7 days as columns, tap a cell to toggle done. Streaks come from the server. Coach-side in v2.
import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addHabit, getHabitWeek, queryKeys, setHabitDone, updateHabit } from "../api";
import { ErrorState, LoadingState, plainErrorMessage } from "./States";
import type { Habit } from "../types";

const MAX_HABITS = 8;

const weekday = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" });

export function HabitTracker({ clientId, today }: { clientId: string; today: string }) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: queryKeys.habits(clientId), queryFn: () => getHabitWeek(clientId, today) });
  const refresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.habits(clientId) });

  const [name, setName] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);

  const add = useMutation({
    mutationFn: (habitName: string) => addHabit(clientId, habitName),
    onSuccess: () => {
      setName("");
      return refresh();
    },
  });
  const rename = useMutation({
    mutationFn: ({ id, newName }: { id: string; newName: string }) => updateHabit(clientId, id, { name: newName }),
    onSuccess: () => {
      setEditing(null);
      return refresh();
    },
  });
  const archive = useMutation({
    mutationFn: (id: string) => updateHabit(clientId, id, { active: false }),
    onSuccess: refresh,
  });
  const tick = useMutation({
    mutationFn: ({ id, date, done }: { id: string; date: string; done: boolean }) => setHabitDone(clientId, id, date, done),
    onSuccess: refresh,
  });

  const habits = query.data?.habits ?? [];
  const full = habits.length >= MAX_HABITS;
  const problem = add.error ?? rename.error ?? archive.error ?? tick.error;

  function submitNew(e: FormEvent) {
    e.preventDefault();
    if (name.trim()) add.mutate(name.trim());
  }

  return (
    <section aria-label="Habit tracker" className="card mt-4 p-5">
      <h3 className="card-title">Habits this week</h3>
      <p className="mt-1 text-sm text-dim">Tap a day to mark it done. Up to {MAX_HABITS} habits per client.</p>

      {query.isPending || (query.isError && query.isFetching) ? (
        <div className="mt-3">
          <LoadingState />
        </div>
      ) : query.isError ? (
        <div className="mt-3">
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        </div>
      ) : (
        <>
          {habits.length === 0 ? (
            <p className="mt-3 text-dim">No habits yet. Add the first one below.</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table aria-label="Habit grid" className="w-full min-w-[34rem] border-collapse text-sm">
                <thead>
                  <tr className="text-left text-xs text-dim">
                    <th scope="col" className="py-1 pr-3 font-semibold">
                      Habit
                    </th>
                    {query.data!.days.map((d) => (
                      <th key={d} scope="col" className="px-1 py-1 text-center font-mono font-normal">
                        <span className="block">{weekday(d)}</span>
                        <span className="block">{d.slice(8)}</span>
                      </th>
                    ))}
                    <th scope="col" className="pl-3 py-1 font-semibold">
                      Streak
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {habits.map((h) => (
                    <HabitRow
                      key={h.id}
                      habit={h}
                      days={query.data!.days}
                      editing={editing?.id === h.id ? editing : null}
                      onEdit={(v) => setEditing(v)}
                      onRename={(newName) => rename.mutate({ id: h.id, newName })}
                      onArchive={() => archive.mutate(h.id)}
                      onTick={(date, done) => tick.mutate({ id: h.id, date, done })}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <form onSubmit={submitNew} noValidate aria-label="Add a habit" className="mt-4 flex flex-wrap items-end gap-3">
            <div className="min-w-[12rem] flex-1">
              <label htmlFor="newHabit" className="mb-1 block text-sm font-bold">
                New habit
              </label>
              <input
                id="newHabit"
                value={name}
                maxLength={60}
                disabled={full}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Drink 2 L of water"
                className="min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-base text-text disabled:opacity-60"
              />
            </div>
            <button type="submit" disabled={full || add.isPending} className="btn btn-primary">
              {add.isPending ? "Adding..." : "Add habit"}
            </button>
          </form>
          {full && <p className="mt-2 text-sm text-dim">That's {MAX_HABITS} habits. Archive one to add another.</p>}
        </>
      )}

      {problem && (
        <p role="alert" className="mt-3 text-sm font-semibold text-amber-text">
          {plainErrorMessage(problem)}
        </p>
      )}
    </section>
  );
}

function HabitRow({
  habit,
  days,
  editing,
  onEdit,
  onRename,
  onArchive,
  onTick,
}: {
  habit: Habit;
  days: string[];
  editing: { id: string; name: string } | null;
  onEdit: (v: { id: string; name: string } | null) => void;
  onRename: (name: string) => void;
  onArchive: () => void;
  onTick: (date: string, done: boolean) => void;
}) {
  const linkButton = "text-xs font-semibold text-dim underline hover:text-text";
  return (
    <tr className="border-t border-border">
      <th scope="row" className="py-2 pr-3 text-left font-normal">
        {editing ? (
          <form
            aria-label={`Rename ${habit.name}`}
            onSubmit={(e) => {
              e.preventDefault();
              if (editing.name.trim()) onRename(editing.name.trim());
            }}
            className="flex flex-wrap items-center gap-2"
          >
            <input
              aria-label="Habit name"
              value={editing.name}
              maxLength={60}
              onChange={(e) => onEdit({ id: habit.id, name: e.target.value })}
              className="min-h-9 w-40 rounded-lg border border-border bg-surface px-2 text-sm text-text"
            />
            <button type="submit" className={linkButton}>
              Save
            </button>
            <button type="button" onClick={() => onEdit(null)} className={linkButton}>
              Cancel
            </button>
          </form>
        ) : (
          <>
            <span className="font-semibold text-text">{habit.name}</span>
            <span className="ml-2 inline-flex gap-2">
              <button type="button" aria-label={`Rename ${habit.name}`} onClick={() => onEdit({ id: habit.id, name: habit.name })} className={linkButton}>
                Rename
              </button>
              <button type="button" aria-label={`Archive ${habit.name}`} onClick={onArchive} className={linkButton}>
                Archive
              </button>
            </span>
          </>
        )}
      </th>
      {days.map((d, i) => {
        const done = habit.week[i];
        return (
          <td key={d} className="px-1 py-2 text-center">
            <button
              type="button"
              aria-pressed={done}
              aria-label={`${habit.name} on ${d}`}
              onClick={() => onTick(d, !done)}
              className={
                "h-9 w-9 rounded-lg border text-sm font-bold " +
                (done ? "border-accent2 bg-accent2 text-white" : "border-border bg-surface2 text-dim hover:border-dim")
              }
            >
              {done ? "✓" : ""}
            </button>
          </td>
        );
      })}
      <td className="whitespace-nowrap py-2 pl-3 font-mono text-xs text-dim">
        <span className="block text-text">Streak {habit.currentStreak}</span>
        <span className="block">Best {habit.bestStreak}</span>
      </td>
    </tr>
  );
}
