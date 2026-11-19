// Calendar / Schedule (Prompt 69, redesigned Nov 2026): the coach's week at a glance.
// Times are stored and sent as UTC; this view shows and edits them in the viewer's local timezone
// (src/lib/schedule.ts holds every conversion). Booking only: no reminders, no video-call
// integration, no calendar sync, and clients cannot book themselves.
//
// The redesign killed the "seven beige boxes" the coach complained about: a compact 7-day rail with
// per-day counts keeps the shape of the week, and a flat, day-grouped agenda shows only days that
// actually have appointments. Every row has one anchor (the title), a tabular-nums time gutter, a
// labelled type chip, a one-tap link to the client, a status pill and properly-sized actions.
import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createAppointment, deleteAppointment, listAppointments, queryKeys, updateAppointment } from "../api";
import { ConfirmDialog } from "./ConfirmDialog";
import { Modal } from "./Modal";
import { ErrorState, LoadingState, plainErrorMessage } from "./States";
import {
  addDays,
  dayHeading,
  fromLocalInput,
  localDateKey,
  timeRangeText,
  toLocalInput,
  viewerTimeZone,
  weekDays,
  weekRangeUtc,
  weekStartOf,
} from "../lib/schedule";
import {
  APPOINTMENT_STATUSES,
  APPOINTMENT_TYPES,
  type Appointment,
  type AppointmentStatus,
  type AppointmentType,
  type Client,
} from "../types";

// Appointment types reuse the assignment-type tokens. A label ALWAYS accompanies the colour, so
// colour is never the sole carrier of meaning. No raw hex, no -soft tints.
const TYPE_TEXT: Record<AppointmentType, string> = {
  Session: "text-type-workout-text",
  Call: "text-type-nutrition-text",
  "Check-in review": "text-type-recovery-text",
  Other: "text-type-habit-text",
};
const TYPE_RAIL: Record<AppointmentType, string> = {
  Session: "bg-type-workout",
  Call: "bg-type-nutrition",
  "Check-in review": "bg-type-recovery",
  Other: "bg-type-habit",
};
const STATUS_TEXT: Record<AppointmentStatus, string> = {
  Booked: "text-accent2",
  Done: "text-dim",
  Cancelled: "text-amber-text",
  "No-show": "text-amber-text",
};

const inputClass = "min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-base text-text";
const labelClass = "mb-1 block text-sm font-bold";

const rangeText = (start: Date) => {
  const end = addDays(start, 6);
  const short = (d: Date, year: boolean) => d.toLocaleDateString([], { month: "short", day: "numeric", ...(year ? { year: "numeric" } : {}) });
  return `${short(start, false)} - ${short(end, true)}`;
};

export function Schedule({ clients, onOpenClient }: { clients: Client[]; onOpenClient: (clientId: string) => void }) {
  const queryClient = useQueryClient();
  const [start, setStart] = useState(() => weekStartOf(new Date()));
  const [editing, setEditing] = useState<Appointment | "new" | null>(null);
  const [deleting, setDeleting] = useState<Appointment | null>(null);
  const [statusFor, setStatusFor] = useState<Appointment | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  // A status change is reversible for a few seconds - a mis-tap must never change a booking silently.
  const [undo, setUndo] = useState<{ appointment: Appointment; previous: AppointmentStatus } | null>(null);

  const startKey = localDateKey(start);
  const query = useQuery({
    queryKey: queryKeys.appointments(startKey),
    queryFn: () => {
      const { from, to } = weekRangeUtc(start);
      return listAppointments(from, to);
    },
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["business", "appointments"] });
    // Today's Tasks on Home lists today's appointments.
    void queryClient.invalidateQueries({ queryKey: ["tasks", "today"] });
  };
  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: AppointmentStatus }) => updateAppointment(id, { status }),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteAppointment(id),
    onSuccess: () => {
      setDeleting(null);
      refresh();
    },
  });

  const days = useMemo(() => weekDays(start), [start]);
  const todayKey = localDateKey(new Date());
  const byDay = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    for (const a of query.data ?? []) {
      const key = localDateKey(new Date(a.startsAt));
      map.set(key, [...(map.get(key) ?? []), a]);
    }
    return map;
  }, [query.data]);
  const isThisWeek = startKey === localDateKey(weekStartOf(new Date()));
  const selected = selectedDay ? days.find((d) => localDateKey(d) === selectedDay) : undefined;
  const visibleDays = selectedDay ? days.filter((d) => localDateKey(d) === selectedDay) : days;
  const agendaDays = visibleDays.filter((d) => (byDay.get(localDateKey(d))?.length ?? 0) > 0);

  function chooseStatus(a: Appointment, status: AppointmentStatus) {
    if (status === a.status) {
      setStatusFor(null);
      return;
    }
    setUndo({ appointment: a, previous: a.status });
    setStatusFor(null);
    setStatus.mutate({ id: a.id, status });
  }
  function undoStatus() {
    if (!undo) return;
    setStatus.mutate({ id: undo.appointment.id, status: undo.previous });
    setUndo(null);
  }

  const navButton = "btn btn-secondary min-h-11";

  return (
    <section aria-label="Schedule" className="mt-4 pb-20 sm:pb-0">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="page-title">Calendar</h2>
          <p className="text-sm text-dim">Week of {rangeText(start)}</p>
        </div>
        <button
          type="button"
          onClick={() => setEditing("new")}
          disabled={clients.length === 0}
          className="btn btn-primary min-h-11"
        >
          Add appointment
        </button>
      </div>

      {/* One quiet control row: week navigation, a jump back to today, and the timezone invariant. */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="button" aria-label="Previous week" onClick={() => { setStart(addDays(start, -7)); setSelectedDay(null); }} className={navButton}>
          <span aria-hidden="true">‹</span>
        </button>
        <button type="button" aria-label="Next week" onClick={() => { setStart(addDays(start, 7)); setSelectedDay(null); }} className={navButton}>
          <span aria-hidden="true">›</span>
        </button>
        <button
          type="button"
          onClick={() => { setStart(weekStartOf(new Date())); setSelectedDay(null); }}
          disabled={isThisWeek && !selectedDay}
          className={navButton + " disabled:opacity-50"}
        >
          This week
        </button>
        <span className="ml-auto rounded-full bg-surface2 px-3 py-1.5 text-xs text-dim" title="Times are stored in UTC and shown in your local timezone.">
          {viewerTimeZone()}
        </span>
      </div>
      <p className="mt-2 break-words text-sm text-dim">
        All times in your timezone ({viewerTimeZone()}); stored in UTC.
        {clients.length === 0 && " Add a client first to book an appointment."}
      </p>

      {/* The week rail: seven tappable chips carry the week's shape and each day's count. Empty days
          are a tappable "0" that opens Add prefilled for that day - no dead beige boxes. */}
      <div role="group" aria-label="Week" className="mt-4 flex flex-nowrap gap-1 overflow-x-auto pb-1 sm:gap-1.5">
        {days.map((d) => {
          const key = localDateKey(d);
          const isToday = key === todayKey;
          const count = byDay.get(key)?.length ?? 0;
          const isSelected = selectedDay === key;
          return (
            <button
              key={key}
              type="button"
              aria-label={`${dayHeading(d)}: ${count} appointment${count === 1 ? "" : "s"}`}
              aria-pressed={isSelected}
              aria-current={isToday ? "date" : undefined}
              onClick={() => setSelectedDay((cur) => (cur === key ? null : key))}
              className={`flex min-h-14 min-w-[2.25rem] flex-1 flex-col items-center justify-center rounded-card border px-0.5 py-1.5 transition-colors sm:min-w-[3.75rem] sm:px-2 ${
                isSelected ? "border-accent2" : isToday ? "border-border-strong" : "border-border hover:border-strong"
              }`}
            >
              <span className={`text-[11px] uppercase tracking-wide ${isToday ? "text-accent2" : "text-dim"}`}>
                {d.toLocaleDateString([], { weekday: "short" })}
              </span>
              <span className={`text-lg font-semibold tabular-nums ${isToday ? "text-accent2" : "text-text"}`}>{d.getDate()}</span>
              <span className="text-[11px] tabular-nums text-dim">{count}</span>
            </button>
          );
        })}
      </div>

      {editing && (
        <AppointmentForm
          key={editing === "new" ? (selected ? localDateKey(selected) : "new") : editing.id}
          clients={clients}
          existing={editing === "new" ? undefined : editing}
          defaultDay={selected ?? days.find((d) => localDateKey(d) === todayKey) ?? days[0]}
          onDone={() => {
            setEditing(null);
            refresh();
          }}
          onCancel={() => setEditing(null)}
        />
      )}

      {query.isPending || (query.isError && query.isFetching) ? (
        <div className="mt-4">
          <LoadingState />
        </div>
      ) : query.isError ? (
        <div className="mt-4">
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        </div>
      ) : (
        <>
          {undo && (
            <div className="mt-3 flex items-center justify-between gap-3 rounded-card border border-border bg-surface2 px-4 py-2 text-sm">
              <span className="text-dim">
                Status changed to <span className="font-semibold text-text">{undo.appointment.status === "Done" ? "Done" : "updated"}</span>.
              </span>
              <button type="button" onClick={undoStatus} className="font-bold text-accent-text underline underline-offset-4">
                Undo
              </button>
            </div>
          )}

          {query.data.length === 0 ? (
            <div className="mt-6 flex flex-col items-center gap-2 py-8 text-center">
              <p className="font-semibold text-text">Nothing booked this week.</p>
              <p className="text-sm text-dim">Your week is open — add the first session when you're ready.</p>
              <button type="button" onClick={() => setEditing("new")} disabled={clients.length === 0} className="btn btn-primary">
                Add appointment
              </button>
            </div>
          ) : agendaDays.length === 0 ? (
            <p className="empty-state mt-6 py-8 text-center">No appointments on that day.</p>
          ) : (
            <ul className="mt-4 flex flex-col gap-5">
              {agendaDays.map((d) => {
                const key = localDateKey(d);
                const isToday = key === todayKey;
                const items = [...(byDay.get(key) ?? [])].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
                return (
                  <li key={key}>
                    <div aria-label={dayHeading(d)} aria-current={isToday ? "date" : undefined} className="mb-2 flex items-baseline gap-2 border-b border-border pb-1.5">
                      <h3 className="text-sm font-bold text-text">{dayHeading(d)}</h3>
                      <span className="text-xs tabular-nums text-dim">{items.length}</span>
                    </div>
                    <ul className="flex flex-col gap-1.5">
                      {items.map((a) => (
                        <AppointmentRow
                          key={a.id}
                          appointment={a}
                          onEdit={() => setEditing(a)}
                          onDelete={() => setDeleting(a)}
                          onStatus={() => setStatusFor(a)}
                          onClient={() => onOpenClient(a.clientId)}
                        />
                      ))}
                    </ul>
                  </li>
                );
              })}
            </ul>
          )}

          {setStatus.isError && (
            <p role="alert" className="mt-3 text-sm font-semibold text-amber-text">
              {plainErrorMessage(setStatus.error)}
            </p>
          )}
        </>
      )}

      {/* Status lives in ONE labelled pill, opened into four big, keyboard-operable choices. A native
          <select> was unthemeable, generic, and cost extra taps for the most common action. */}
      {statusFor && (
        <Modal
          title="Change appointment status"
          description={`${statusFor.title} · ${statusFor.clientName}`}
          onRequestClose={() => setStatusFor(null)}
        >
          <div role="group" aria-label={`Status for ${statusFor.title}`} className="flex flex-col gap-2">
            {APPOINTMENT_STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                aria-label={`Set status ${s}`}
                aria-pressed={s === statusFor.status}
                disabled={setStatus.isPending}
                onClick={() => chooseStatus(statusFor, s)}
                className={`flex min-h-11 items-center justify-between rounded-card border px-4 text-left text-sm font-semibold transition-colors ${
                  s === statusFor.status ? "border-accent2 bg-surface2 text-text" : "border-border text-dim hover:text-text"
                }`}
              >
                {s}
                {s === statusFor.status && <span aria-hidden="true" className="text-accent2">✓</span>}
              </button>
            ))}
          </div>
        </Modal>
      )}

      {deleting && (
        <ConfirmDialog
          title="Delete this appointment?"
          confirmLabel="Delete"
          pendingLabel="Deleting..."
          pending={remove.isPending}
          onConfirm={() => remove.mutate(deleting.id)}
          onCancel={() => setDeleting(null)}
        >
          <p>"{deleting.title}" with {deleting.clientName} will be removed from the schedule. This can't be undone.</p>
          {remove.isError && (
            <p role="alert" className="mt-2 font-semibold text-amber-text">
              {plainErrorMessage(remove.error)}
            </p>
          )}
        </ConfirmDialog>
      )}
    </section>
  );
}

/** A flat appointment row: no nested box, one bold anchor, a labelled type chip and a client link. */
function AppointmentRow({
  appointment: a,
  onEdit,
  onDelete,
  onStatus,
  onClient,
}: {
  appointment: Appointment;
  onEdit: () => void;
  onDelete: () => void;
  onStatus: () => void;
  onClient: () => void;
}) {
  const inactive = a.status === "Cancelled" || a.status === "No-show";
  return (
    <li className="flex flex-col gap-2 rounded-card border border-border bg-surface p-3 hover:border-strong sm:flex-row sm:flex-wrap sm:items-start sm:gap-x-3">
      <span aria-hidden="true" className={`hidden h-9 w-[3px] shrink-0 rounded-full sm:block ${TYPE_RAIL[a.type]}`} />
      <div className="min-w-0 w-full sm:flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="whitespace-nowrap text-sm tabular-nums text-dim">{timeRangeText(a.startsAt, a.endsAt)}</span>
          <span className={`rounded-full bg-surface2 px-2 py-0.5 text-[11px] font-bold ${TYPE_TEXT[a.type]}`}>{a.type}</span>
        </div>
        <p className={`mt-0.5 break-words font-semibold ${inactive ? "text-dim line-through" : "text-text"}`}>{a.title}</p>
        <div className="flex flex-wrap items-center gap-x-2 text-sm">
          <button type="button" onClick={onClient} aria-label={`Open ${a.clientName}`} className="font-semibold text-accent-text underline underline-offset-4">
            {a.clientName}
          </button>
          {a.location && <span className="break-all text-dim">· {a.location}</span>}
        </div>
        {a.note && <p className="mt-1 break-words text-xs text-dim">{a.note}</p>}
      </div>
      <div className="flex w-full flex-wrap items-center gap-1.5 sm:w-auto">
        <button
          type="button"
          aria-label={`Status for ${a.title}`}
          onClick={onStatus}
          className={`flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-surface2 px-3 text-xs font-bold ${STATUS_TEXT[a.status]}`}
        >
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
          {a.status}
          <span aria-hidden="true">▾</span>
        </button>
        <button type="button" aria-label={`Edit ${a.title}`} onClick={onEdit} className="btn btn-secondary min-h-11">
          Edit
        </button>
        <button type="button" aria-label={`Delete ${a.title}`} onClick={onDelete} className="btn btn-ghost min-h-11 text-amber-text">
          Delete
        </button>
      </div>
    </li>
  );
}

function AppointmentForm({
  clients,
  existing,
  defaultDay,
  onDone,
  onCancel,
}: {
  clients: Client[];
  existing?: Appointment;
  defaultDay: Date;
  onDone: () => void;
  onCancel: () => void;
}) {
  // New appointments start at 9:00 local on the day shown (today in the current week), for one hour.
  const nineAm = new Date(defaultDay.getFullYear(), defaultDay.getMonth(), defaultDay.getDate(), 9);
  const [clientId, setClientId] = useState(existing?.clientId ?? clients[0]?.id ?? "");
  const [title, setTitle] = useState(existing?.title ?? "");
  const [type, setType] = useState<AppointmentType>(existing?.type ?? "Session");
  const [startsAt, setStartsAt] = useState(toLocalInput(existing?.startsAt ?? nineAm.toISOString()));
  const [endsAt, setEndsAt] = useState(toLocalInput(existing?.endsAt ?? new Date(nineAm.getTime() + 3_600_000).toISOString()));
  const [location, setLocation] = useState(existing?.location ?? "");
  const [status, setStatus] = useState<AppointmentStatus>(existing?.status ?? "Booked");
  const [note, setNote] = useState(existing?.note ?? "");
  const [problem, setProblem] = useState<string | null>(null);
  const id = existing?.id ?? "new";

  const save = useMutation({
    mutationFn: (times: { startsAt: string; endsAt: string }) => {
      const fields = { clientId, title: title.trim(), type, ...times, location: location.trim(), status, note: note.trim() };
      return existing ? updateAppointment(existing.id, fields) : createAppointment(fields);
    },
    onSuccess: onDone,
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    // The inputs hold LOCAL time; the server gets UTC.
    const s = fromLocalInput(startsAt);
    const en = fromLocalInput(endsAt);
    if (!s) return setProblem("Please choose the start time.");
    if (!en) return setProblem("Please choose the end time.");
    if (new Date(en) <= new Date(s)) return setProblem("The end time must be after the start time.");
    setProblem(null);
    save.mutate({ startsAt: s, endsAt: en });
  }

  return (
    <form
      aria-label={existing ? "Edit appointment" : "Add appointment"}
      noValidate
      onSubmit={submit}
      className="card mt-4 grid gap-3 p-4 sm:grid-cols-2"
    >
      <div>
        <label htmlFor={`appt-client-${id}`} className={labelClass}>
          Client
        </label>
        <select id={`appt-client-${id}`} value={clientId} onChange={(e) => setClientId(e.target.value)} className={inputClass}>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor={`appt-title-${id}`} className={labelClass}>
          Title
        </label>
        <input id={`appt-title-${id}`} value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
      </div>
      <div>
        <label htmlFor={`appt-type-${id}`} className={labelClass}>
          Type
        </label>
        <select id={`appt-type-${id}`} value={type} onChange={(e) => setType(e.target.value as AppointmentType)} className={inputClass}>
          {APPOINTMENT_TYPES.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </div>
      {existing && (
        <div>
          <label htmlFor={`appt-status-${id}`} className={labelClass}>
            Status
          </label>
          <select id={`appt-status-${id}`} value={status} onChange={(e) => setStatus(e.target.value as AppointmentStatus)} className={inputClass}>
            {APPOINTMENT_STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
      )}
      <div>
        <label htmlFor={`appt-start-${id}`} className={labelClass}>
          Starts
        </label>
        <input id={`appt-start-${id}`} type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className={inputClass} />
      </div>
      <div>
        <label htmlFor={`appt-end-${id}`} className={labelClass}>
          Ends
        </label>
        <input id={`appt-end-${id}`} type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className={inputClass} />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor={`appt-location-${id}`} className={labelClass}>
          Location or link (optional)
        </label>
        <input id={`appt-location-${id}`} value={location} maxLength={300} onChange={(e) => setLocation(e.target.value)} className={inputClass} />
        <p className="mt-1 text-xs text-dim">Plain text. Your client sees this; nothing is opened or joined for you.</p>
      </div>
      <div className="sm:col-span-2">
        <label htmlFor={`appt-note-${id}`} className={labelClass}>
          Note (optional, only you see it)
        </label>
        <input id={`appt-note-${id}`} value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} className={inputClass} />
      </div>
      {(problem || save.isError) && (
        <p role="alert" className="text-sm font-semibold text-amber-text sm:col-span-2">
          {problem ?? plainErrorMessage(save.error)}
        </p>
      )}
      <div className="flex gap-2 sm:col-span-2">
        <button type="submit" disabled={save.isPending || !clientId} className="btn btn-primary min-h-11">
          {save.isPending ? "Saving..." : "Save appointment"}
        </button>
        <button type="button" onClick={onCancel} className="min-h-11 rounded-lg px-4 text-sm text-dim hover:text-text">
          Cancel
        </button>
      </div>
    </form>
  );
}
