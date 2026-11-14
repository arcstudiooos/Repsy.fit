// Programs: reusable multi-week plans (Inspo W10, Nov 2026) in Business -> Programs.
//
// A program is a TEMPLATE. Assigning it creates ordinary assignments on real dates, and the two are
// independent from then on - so a coach writes an eight-week block once and can still change one
// client's week without touching everyone else's.
//
// DELIBERATE CHOICES
//  * Assigning always goes through a PREVIEW. Committing weeks of a client's calendar unseen is not
//    something a coach should be asked to do.
//  * Items are edited as a flat list with week and day pickers, not a grid. The grid is the Plans
//    calendar's job; here the coach is writing, not reading.
//  * Phases reorder by Up / Down buttons: no new dependency, keyboard-reachable.
import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  assignProgram,
  copyProgram,
  createProgram,
  deleteProgram,
  listPrograms,
  previewProgram,
  queryKeys,
  updateProgram,
} from "../api";
import { ConfirmDialog } from "./ConfirmDialog";
import { ErrorState, LoadingState, plainErrorMessage } from "./States";
import { TYPE_CHIP, localToday } from "../tabs/AiCoachTab";
import {
  ASSIGNMENT_TYPES,
  WEEKDAY_LABELS,
  WEEKDAY_ORDER,
  type AssignmentType,
  type Client,
  type Program,
  type ProgramPhase,
} from "../types";

const field = "w-full rounded-lg border border-border bg-surface2 px-3 py-2 text-sm text-text";
// The one list, so a new type never needs finding here.
const TYPES = ASSIGNMENT_TYPES;

const blankPhase = (n: number): ProgramPhase => ({ name: `Phase ${n}`, weeks: 4, items: [] });

export function ProgramsView({ clients }: { clients: Client[] }) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: queryKeys.programs, queryFn: listPrograms });
  const [editing, setEditing] = useState<Program | "new" | null>(null);
  const [assigning, setAssigning] = useState<Program | null>(null);
  const [toDelete, setToDelete] = useState<Program | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.programs });

  const copy = useMutation({
    mutationFn: copyProgram,
    onSuccess: async (made) => {
      await refresh();
      setEditing(made);
    },
    onError: (e) => setError(plainErrorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: deleteProgram,
    onSuccess: async () => {
      await refresh();
      setToDelete(null);
      setNotice("Program deleted. Any plans already on a client's calendar are untouched.");
    },
    onError: (e) => {
      setToDelete(null);
      setError(plainErrorMessage(e));
    },
  });

  if (query.isPending) return <LoadingState />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;

  if (editing) {
    return (
      <ProgramBuilder
        program={editing === "new" ? null : editing}
        onDone={async () => {
          await refresh();
          setEditing(null);
        }}
        onCancel={() => setEditing(null)}
      />
    );
  }
  if (assigning) {
    return (
      <AssignProgram
        program={assigning}
        clients={clients}
        onDone={(created, name) => {
          setAssigning(null);
          setNotice(`Added ${created} ${created === 1 ? "plan" : "plans"} to ${name}'s calendar.`);
        }}
        onCancel={() => setAssigning(null)}
      />
    );
  }

  const programs = query.data ?? [];

  return (
    <section aria-label="Programs" className="mt-4 grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold">Programs</h3>
          <p className="text-sm text-dim">
            A multi-week plan you write once and give to any client. Assigning one fills in their calendar.
          </p>
        </div>
        <button type="button" className="btn btn-primary min-h-11" onClick={() => setEditing("new")}>
          New program
        </button>
      </div>

      {notice && (
        <p role="status" className="text-sm font-semibold text-accent2">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm font-semibold text-amber-text">
          {error}
        </p>
      )}

      {programs.length === 0 ? (
        <p className="card text-sm text-dim">
          No programs yet. Build one from the phases of a block you already coach, then give it to a client with a start date.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {programs.map((p) => (
            <li key={p.id} className="card grid gap-2">
              <div>
                <h4 className="font-bold">{p.name}</h4>
                {p.description && <p className="mt-0.5 text-sm text-dim">{p.description}</p>}
              </div>
              <p className="text-sm text-dim">
                {p.totalWeeks} {p.totalWeeks === 1 ? "week" : "weeks"} · {p.phases.length}{" "}
                {p.phases.length === 1 ? "phase" : "phases"} · {p.totalItems} {p.totalItems === 1 ? "plan" : "plans"}
              </p>
              <div className="flex flex-wrap gap-2">
                {clients.length > 0 && p.totalItems > 0 && (
                  <button type="button" className="btn btn-primary min-h-10" onClick={() => setAssigning(p)}>
                    Give to a client
                  </button>
                )}
                <button type="button" className="btn btn-secondary min-h-10" onClick={() => setEditing(p)}>
                  Edit
                </button>
                <button type="button" className="btn btn-secondary min-h-10" disabled={copy.isPending} onClick={() => copy.mutate(p.id)}>
                  Duplicate
                </button>
                <button type="button" className="btn btn-secondary min-h-10" onClick={() => setToDelete(p)}>
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {toDelete && (
        <ConfirmDialog
          title={`Delete "${toDelete.name}"?`}
          confirmLabel="Delete program"
          pendingLabel="Deleting..."
          pending={remove.isPending}
          onCancel={() => setToDelete(null)}
          onConfirm={() => remove.mutate(toDelete.id)}
        >
          Plans already on a client's calendar stay exactly as they are. Only the template goes.
        </ConfirmDialog>
      )}
    </section>
  );
}

/** Writing the phases and what sits in each week. */
function ProgramBuilder({ program, onDone, onCancel }: { program: Program | null; onDone: () => void; onCancel: () => void }) {
  const [name, setName] = useState(program?.name ?? "");
  const [description, setDescription] = useState(program?.description ?? "");
  const [phases, setPhases] = useState<ProgramPhase[]>(program?.phases ?? [blankPhase(1)]);
  const [problem, setProblem] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => {
      const body = { name: name.trim(), description: description.trim(), phases };
      return program ? updateProgram(program.id, body) : createProgram(body);
    },
    onSuccess: onDone,
    onError: (e) => setProblem(plainErrorMessage(e)),
  });

  const updatePhase = (i: number, patch: Partial<ProgramPhase>) =>
    setPhases(phases.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const movePhase = (from: number, to: number) => {
    if (to < 0 || to >= phases.length) return;
    const next = [...phases];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    setPhases(next);
  };

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setProblem("Give the program a name.");
    for (const [i, phase] of phases.entries()) {
      if (!phase.name.trim()) return setProblem(`Phase ${i + 1} needs a name.`);
      for (const item of phase.items) {
        if (!item.title.trim()) return setProblem(`Everything in ${phase.name} needs a title.`);
        if (item.week > phase.weeks) {
          return setProblem(`"${item.title}" is in week ${item.week}, but ${phase.name} only runs ${phase.weeks} weeks.`);
        }
      }
    }
    setProblem(null);
    save.mutate();
  }

  const totalWeeks = phases.reduce((n, p) => n + Math.max(1, p.weeks), 0);

  return (
    <form onSubmit={submit} noValidate aria-label={program ? "Edit program" : "New program"} className="mt-4 grid gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="prog-name" className="mb-1 block text-sm font-bold">
            Program name
          </label>
          <input id="prog-name" value={name} onChange={(e) => setName(e.target.value)} className={field} autoFocus />
        </div>
        <div>
          <label htmlFor="prog-desc" className="mb-1 block text-sm font-bold">
            What it is for (optional)
          </label>
          <input id="prog-desc" value={description} onChange={(e) => setDescription(e.target.value)} className={field} />
        </div>
      </div>
      <p className="text-sm text-dim">
        {totalWeeks} {totalWeeks === 1 ? "week" : "weeks"} in total.
      </p>

      <ul className="grid gap-3">
        {phases.map((phase, pi) => (
          <li key={pi} className="rounded-card border border-border p-3">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[10rem] flex-1">
                <label htmlFor={`phase-${pi}-name`} className="mb-1 block text-sm font-bold">
                  Phase {pi + 1}
                </label>
                <input
                  id={`phase-${pi}-name`}
                  value={phase.name}
                  onChange={(e) => updatePhase(pi, { name: e.target.value })}
                  className={field}
                />
              </div>
              <div className="w-24">
                <label htmlFor={`phase-${pi}-weeks`} className="mb-1 block text-sm font-bold">
                  Weeks
                </label>
                <input
                  id={`phase-${pi}-weeks`}
                  type="number"
                  min={1}
                  max={52}
                  value={phase.weeks}
                  onChange={(e) => updatePhase(pi, { weeks: Math.max(1, Number(e.target.value) || 1) })}
                  className={field}
                />
              </div>
              <button type="button" className="btn btn-secondary min-h-10" disabled={pi === 0} onClick={() => movePhase(pi, pi - 1)}>
                Up
              </button>
              <button
                type="button"
                className="btn btn-secondary min-h-10"
                disabled={pi === phases.length - 1}
                onClick={() => movePhase(pi, pi + 1)}
              >
                Down
              </button>
              <button
                type="button"
                className="btn btn-secondary min-h-10"
                disabled={phases.length === 1}
                onClick={() => setPhases(phases.filter((_, j) => j !== pi))}
              >
                Remove phase
              </button>
            </div>

            <ul className="mt-3 grid gap-2">
              {phase.items.map((item, ii) => (
                <li key={ii} className="grid gap-2 border-t border-border pt-2 sm:grid-cols-[5rem_7rem_8rem_1fr_auto]">
                  <div>
                    <label htmlFor={`p${pi}i${ii}-week`} className="mb-1 block text-xs font-bold text-dim">
                      Week
                    </label>
                    <input
                      id={`p${pi}i${ii}-week`}
                      type="number"
                      min={1}
                      max={phase.weeks}
                      value={item.week}
                      onChange={(e) =>
                        updatePhase(pi, {
                          items: phase.items.map((x, j) => (j === ii ? { ...x, week: Math.max(1, Number(e.target.value) || 1) } : x)),
                        })
                      }
                      className={field}
                    />
                  </div>
                  <div>
                    <label htmlFor={`p${pi}i${ii}-day`} className="mb-1 block text-xs font-bold text-dim">
                      Day
                    </label>
                    <select
                      id={`p${pi}i${ii}-day`}
                      value={item.weekday}
                      onChange={(e) =>
                        updatePhase(pi, {
                          items: phase.items.map((x, j) => (j === ii ? { ...x, weekday: Number(e.target.value) } : x)),
                        })
                      }
                      className={field + " min-h-11"}
                    >
                      {WEEKDAY_ORDER.map((d) => (
                        <option key={d} value={d}>
                          {WEEKDAY_LABELS[d]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor={`p${pi}i${ii}-type`} className="mb-1 block text-xs font-bold text-dim">
                      Type
                    </label>
                    <select
                      id={`p${pi}i${ii}-type`}
                      value={item.type}
                      onChange={(e) =>
                        updatePhase(pi, {
                          items: phase.items.map((x, j) => (j === ii ? { ...x, type: e.target.value as AssignmentType } : x)),
                        })
                      }
                      className={field + " min-h-11"}
                    >
                      {TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor={`p${pi}i${ii}-title`} className="mb-1 block text-xs font-bold text-dim">
                      Title
                    </label>
                    <input
                      id={`p${pi}i${ii}-title`}
                      value={item.title}
                      onChange={(e) =>
                        updatePhase(pi, { items: phase.items.map((x, j) => (j === ii ? { ...x, title: e.target.value } : x)) })
                      }
                      className={field}
                    />
                  </div>
                  <div className="flex items-end">
                    <button
                      type="button"
                      className="btn btn-secondary min-h-10"
                      onClick={() => updatePhase(pi, { items: phase.items.filter((_, j) => j !== ii) })}
                    >
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>

            <button
              type="button"
              className="btn btn-secondary mt-2 min-h-10"
              onClick={() =>
                updatePhase(pi, { items: [...phase.items, { week: 1, weekday: 1, type: "Workout", title: "", details: "" }] })
              }
            >
              Add to this phase
            </button>
          </li>
        ))}
      </ul>

      <button
        type="button"
        className="btn btn-secondary min-h-11 justify-self-start"
        onClick={() => setPhases([...phases, blankPhase(phases.length + 1)])}
      >
        Add a phase
      </button>

      {problem && (
        <p role="alert" className="text-sm font-semibold text-amber-text">
          {problem}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={save.isPending} className="btn btn-primary min-h-11">
          {save.isPending ? "Saving..." : "Save program"}
        </button>
        <button type="button" className="btn btn-secondary min-h-11" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/** Giving a program to a client: always preview first, then commit. */
function AssignProgram({
  program,
  clients,
  onDone,
  onCancel,
}: {
  program: Program;
  clients: Client[];
  onDone: (created: number, clientName: string) => void;
  onCancel: () => void;
}) {
  const queryClient = useQueryClient();
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const [startDate, setStartDate] = useState(localToday());
  const [problem, setProblem] = useState<string | null>(null);

  const clientName = clients.find((c) => c.id === clientId)?.name ?? "the client";

  const preview = useMutation({
    mutationFn: () => previewProgram(program.id, clientId, startDate),
    onError: (e) => setProblem(plainErrorMessage(e)),
  });
  const commit = useMutation({
    mutationFn: () => assignProgram(program.id, clientId, startDate),
    onSuccess: async (result) => {
      // The client's plans changed, so anything showing them must refetch.
      await queryClient.invalidateQueries({ queryKey: ["clients"] });
      onDone(result.created, clientName);
    },
    onError: (e) => setProblem(plainErrorMessage(e)),
  });

  return (
    <section aria-label={`Give ${program.name} to a client`} className="mt-4 grid gap-4">
      <h3 className="text-lg font-bold">{program.name}</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="assign-client" className="mb-1 block text-sm font-bold">
            Which client
          </label>
          <select
            id="assign-client"
            value={clientId}
            onChange={(e) => {
              setClientId(e.target.value);
              preview.reset();
            }}
            className={field + " min-h-11"}
          >
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="assign-start" className="mb-1 block text-sm font-bold">
            Starts on
          </label>
          <input
            id="assign-start"
            type="date"
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              preview.reset();
            }}
            className={field + " min-h-11"}
          />
          {/* Said plainly, because a coach expects a week to begin on a Monday. */}
          <p className="mt-1 text-xs text-dim">Week 1 begins on this date, whichever day of the week it is.</p>
        </div>
      </div>

      {problem && (
        <p role="alert" className="text-sm font-semibold text-amber-text">
          {problem}
        </p>
      )}

      {!preview.data ? (
        <button
          type="button"
          disabled={!clientId || preview.isPending}
          className="btn btn-primary min-h-11 justify-self-start"
          onClick={() => {
            setProblem(null);
            preview.mutate();
          }}
        >
          {preview.isPending ? "Working it out..." : "Show me the dates"}
        </button>
      ) : (
        <>
          <p className="text-sm font-semibold text-text">
            This adds {preview.data.count} {preview.data.count === 1 ? "plan" : "plans"} to {clientName}'s calendar.
          </p>
          <ol className="grid gap-1.5">
            {preview.data.items.map((item, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2 border-b border-border pb-1.5 text-sm last:border-b-0">
                <span className="font-mono text-xs text-dim">{item.date}</span>
                <span className={"rounded-full px-2 py-0.5 text-xs font-semibold " + TYPE_CHIP[item.type]}>{item.type}</span>
                <span className="text-text">{item.title}</span>
                <span className="text-xs text-dim">{item.phaseName}</span>
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={commit.isPending} className="btn btn-primary min-h-11" onClick={() => commit.mutate()}>
              {commit.isPending ? "Adding..." : `Add these ${preview.data.count} to the calendar`}
            </button>
            <button type="button" className="btn btn-secondary min-h-11" onClick={() => preview.reset()}>
              Change the dates
            </button>
          </div>
        </>
      )}
      <button type="button" className="btn btn-secondary min-h-11 justify-self-start" onClick={onCancel}>
        Back to programs
      </button>
    </section>
  );
}
