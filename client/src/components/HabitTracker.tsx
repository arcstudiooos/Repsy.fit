// Habit tracker (Prompt 54), a section of the Check-ins tab: the selected client's habits as rows,
// the last 7 days as columns, tap a cell to toggle done. Streaks come from the server. Coach-side in v2.
import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addHabit, getHabitWeek, queryKeys, setHabitDone, updateHabit } from "../api";
import { EVERY_DAY, HABIT_CATEGORIES, HABIT_PRESETS, WEEKDAY_LABELS, WEEKDAY_ORDER } from "../types";
import { ErrorState, LoadingState, plainErrorMessage } from "./States";
import type { Habit } from "../types";

const MAX_HABITS = 8;

const weekday = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" });

export function HabitTracker({ clientId, today }: { clientId: string; today: string }) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: queryKeys.habits(clientId), queryFn: () => getHabitWeek(clientId, today) });
  const refresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.habits(clientId) });

  const [name, setName] = useState("");
  // Inspo C3: the preset library and the recurrence for the habit being added.
  const [picking, setPicking] = useState(false);
  const [days, setDays] = useState<number[]>(EVERY_DAY);
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);

  const add = useMutation({
    mutationFn: ({ habitName, habitDays }: { habitName: string; habitDays: number[] }) =>
      addHabit(clientId, habitName, habitDays),
    onSuccess: () => {
      setName("");
      setDays(EVERY_DAY);
      setPicking(false);
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
    if (name.trim()) add.mutate({ habitName: name.trim(), habitDays: days });
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
            <button type="button" disabled={full} className="btn btn-secondary" onClick={() => setPicking(!picking)}>
              {picking ? "Hide examples" : "Pick from examples"}
            </button>
          </form>

          {/* Which days it is expected on. Every day is the default, and what every older habit means. */}
          <div role="group" aria-label="Which days" className="mt-3">
            <p className="mb-1 text-sm font-bold">Which days</p>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                aria-pressed={days.length >= 7}
                onClick={() => setDays(EVERY_DAY)}
                className={
                  "min-h-10 rounded-full border px-3 text-sm font-semibold " +
                  (days.length >= 7 ? "border-text bg-text text-bg" : "border-border text-text hover:border-dim")
                }
              >
                Every day
              </button>
              {WEEKDAY_ORDER.map((d) => {
                const on = days.length < 7 && days.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={on}
                    aria-label={WEEKDAY_LABELS[d]}
                    onClick={() => {
                      // Coming from "every day", the first tap means "only this day".
                      const base = days.length >= 7 ? [] : days;
                      const next = base.includes(d) ? base.filter((x) => x !== d) : [...base, d];
                      // Never leave a habit nobody is ever expected to do.
                      setDays(next.length === 0 ? EVERY_DAY : next);
                    }}
                    className={
                      "min-h-10 min-w-10 rounded-full border px-3 text-sm font-semibold " +
                      (on ? "border-text bg-text text-bg" : "border-border text-text hover:border-dim")
                    }
                  >
                    {WEEKDAY_LABELS[d]}
                  </button>
                );
              })}
            </div>
          </div>

          {picking && (
            <div className="mt-3 grid gap-3">
              {HABIT_CATEGORIES.map((category) => (
                <div key={category}>
                  <p className="mb-1 text-sm font-bold">{category}</p>
                  <ul className="flex flex-wrap gap-1.5">
                    {HABIT_PRESETS.filter((x) => x.category === category).map((preset) => (
                      <li key={preset.name}>
                        <button
                          type="button"
                          disabled={full}
                          // A preset fills the box and its usual days in: it never saves on its own,
                          // so the coach still chooses.
                          onClick={() => {
                            setName(preset.name);
                            setDays(preset.days);
                          }}
                          className="min-h-10 rounded-full border border-border px-3 text-sm text-text hover:border-dim disabled:opacity-60"
                        >
                          {preset.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
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
            {/* Inspo C3: say so when a habit is not an every-day one. */}
            {habit.recurrence && habit.recurrence !== "Every day" && (
              <span className="ml-2 rounded-full border border-border px-2 py-0.5 text-xs text-dim">{habit.recurrence}</span>
            )}
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
        // A day the habit was never expected on is NOT a miss. It stays tickable (a client who did
        // it anyway deserves the credit) but it is drawn faintly so the row reads honestly.
        const expected = habit.weekScheduled?.[i] ?? true;
        return (
          <td key={d} className="px-1 py-2 text-center">
            <button
              type="button"
              aria-pressed={done}
              aria-label={`${habit.name} on ${d}${expected ? "" : " (not expected)"}`}
              onClick={() => onTick(d, !done)}
              className={
                "h-9 w-9 rounded-lg border text-sm font-bold " +
                (done
                  ? "border-accent2 bg-accent2 text-white"
                  : expected
                    ? "border-border-strong bg-surface2 text-dim hover:border-dim"
                    : "border-transparent bg-transparent text-dim opacity-40 hover:border-border")
              }
            >
              {done ? "✓" : expected ? "" : "·"}
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
