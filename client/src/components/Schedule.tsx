// Business > Schedule (Prompt 69): the coach's week view of appointments.
// Times are stored and sent as UTC; this view shows and edits them in the viewer's local timezone
// (src/lib/schedule.ts holds every conversion). Booking only: no reminders, no video-call
// integration, no calendar sync, and clients cannot book themselves.
import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createAppointment, deleteAppointment, listAppointments, queryKeys, updateAppointment } from "../api";
import { ConfirmDialog } from "./ConfirmDialog";
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

/** Block colour by type, from the assignment type colours (no new colours). Full class names so Tailwind keeps them. */
const TYPE_BORDER: Record<AppointmentType, string> = {
  Session: "border-l-type-workout",
  Call: "border-l-type-nutrition",
  "Check-in review": "border-l-type-recovery",
  Other: "border-l-type-habit",
};

const inputClass = "min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-base text-text";
const labelClass = "mb-1 block text-sm font-bold";

const rangeText = (start: Date) => {
  const end = addDays(start, 6);
  const short = (d: Date, year: boolean) => d.toLocaleDateString([], { month: "short", day: "numeric", ...(year ? { year: "numeric" } : {}) });
  return `${short(start, false)} - ${short(end, true)}`;
};

export function Schedule({ clients }: { clients: Client[] }) {
  const queryClient = useQueryClient();
  const [start, setStart] = useState(() => weekStartOf(new Date()));
  const [editing, setEditing] = useState<Appointment | "new" | null>(null);
  const [deleting, setDeleting] = useState<Appointment | null>(null);
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

  const navButton = "btn btn-secondary";

  return (
    <section aria-label="Schedule" className="mt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setStart(addDays(start, -7))} className={navButton}>
            Previous week
          </button>
          <button type="button" onClick={() => setStart(addDays(start, 7))} className={navButton}>
            Next week
          </button>
          <button type="button" onClick={() => setStart(weekStartOf(new Date()))} disabled={isThisWeek} className={navButton + " disabled:opacity-50"}>
            This week
          </button>
          <h3 className="ml-1 font-mono text-base">{rangeText(start)}</h3>
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
      <p className="mt-2 text-xs text-dim">
        Times are shown in your timezone ({viewerTimeZone()}) and stored in UTC.
        {clients.length === 0 && " Add a client first to book an appointment."}
      </p>

      {editing && (
        <AppointmentForm
          // A new key per record, so switching from one edit to another starts from that record's values.
          key={editing === "new" ? "new" : editing.id}
          clients={clients}
          existing={editing === "new" ? undefined : editing}
          defaultDay={days.find((d) => localDateKey(d) === todayKey) ?? days[0]}
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
          {query.data.length === 0 && <p className="mt-4 text-sm text-dim">No appointments this week.</p>}
          <ul aria-label="Week" className="mt-4 grid grid-cols-1 gap-2 lg:grid-cols-7">
            {days.map((d) => {
              const key = localDateKey(d);
              const isToday = key === todayKey;
              const items = byDay.get(key) ?? [];
              return (
                <li key={key} className="min-w-0">
                  <div
                    role="group"
                    aria-label={dayHeading(d)}
                    aria-current={isToday ? "date" : undefined}
                    className={"h-full rounded-card border p-2 " + (isToday ? "border-accent bg-surface" : "border-border bg-surface2")}
                  >
                    <p
                      className={
                        "mb-2 inline-block rounded-full px-2 py-0.5 text-xs font-bold " + (isToday ? "bg-accent text-on-accent" : "text-dim")
                      }
                    >
                      {dayHeading(d)}
                    </p>
                    {items.length > 0 && (
                      <ul className="space-y-2">
                        {items.map((a) => (
                          <Block
                            key={a.id}
                            appointment={a}
                            onEdit={() => setEditing(a)}
                            onDelete={() => setDeleting(a)}
                            onStatus={(status) => setStatus.mutate({ id: a.id, status })}
                          />
                        ))}
                      </ul>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          {setStatus.isError && (
            <p role="alert" className="mt-3 text-sm font-semibold text-amber-text">
              {plainErrorMessage(setStatus.error)}
            </p>
          )}
        </>
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
          <p>
            "{deleting.title}" with {deleting.clientName} will be removed from the schedule. This can't be undone.
          </p>
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

function Block({
  appointment: a,
  onEdit,
  onDelete,
  onStatus,
}: {
  appointment: Appointment;
  onEdit: () => void;
  onDelete: () => void;
  onStatus: (status: AppointmentStatus) => void;
}) {
  const inactive = a.status === "Cancelled" || a.status === "No-show";
  return (
    <li className={"rounded-lg border border-l-4 border-border bg-surface p-2 text-sm " + TYPE_BORDER[a.type]}>
      <p className="font-mono text-xs text-text">{timeRangeText(a.startsAt, a.endsAt)}</p>
      <p className={"mt-0.5 break-words font-semibold " + (inactive ? "text-dim line-through" : "text-text")}>{a.title}</p>
      <p className="break-words text-xs text-dim">
        {a.clientName} · {a.type}
      </p>
      {a.location && <p className="break-all text-xs text-dim">{a.location}</p>}
      {a.note && <p className="mt-1 break-words text-xs text-dim">{a.note}</p>}
      <select
        aria-label={`Status for ${a.title}`}
        value={a.status}
        onChange={(e) => onStatus(e.target.value as AppointmentStatus)}
        className="mt-2 min-h-10 w-full rounded-lg border border-border bg-surface2 px-2 text-sm text-text lg:px-1 lg:text-xs"
      >
        {APPOINTMENT_STATUSES.map((s) => (
          <option key={s}>{s}</option>
        ))}
      </select>
      <div className="mt-1 flex gap-1">
        <button type="button" aria-label={`Edit ${a.title}`} onClick={onEdit} className="min-h-10 rounded-lg px-2 text-xs text-dim underline-offset-2 hover:text-text hover:underline">
          Edit
        </button>
        <button type="button" aria-label={`Delete ${a.title}`} onClick={onDelete} className="min-h-10 rounded-lg px-2 text-xs text-dim underline-offset-2 hover:text-text hover:underline">
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
