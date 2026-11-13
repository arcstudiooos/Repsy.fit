// The client's Progress tab (Prompt 81): their own weight and adherence charts (the coach's chart component,
// lazy-loaded with this chunk), their body measurements with "Add measurements", and the streak summary.
// Weight shows in the client's unit (stored in kg). Nothing about at-risk flags, rank or coach notes.
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addMyMeasurement, deleteMyMeasurement, getMyMeasurements, getMyProfile, getMyProgress, queryKeys } from "../api";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { ProgressCharts } from "../components/ProgressCharts";
import { LoadingState, plainErrorMessage } from "../components/States";
import { localDateKey } from "../lib/schedule";
import { MyStreaksSection } from "./sections";
import type { MyMeasurement } from "../types";

type TapeKey = "waistCm" | "chestCm" | "armCm" | "hipCm" | "bodyFatPercent";
const FIELDS: { key: TapeKey; label: string; unit: string; max: number }[] = [
  { key: "waistCm", label: "Waist (cm)", unit: "cm", max: 300 },
  { key: "chestCm", label: "Chest (cm)", unit: "cm", max: 300 },
  { key: "armCm", label: "Arm (cm)", unit: "cm", max: 300 },
  { key: "hipCm", label: "Hip (cm)", unit: "cm", max: 300 },
  { key: "bodyFatPercent", label: "Body fat (%)", unit: "%", max: 75 },
];
const inputClass = "min-h-11 w-full rounded-lg border border-border bg-surface2 px-3 text-base text-text";

export default function ProgressView() {
  const profile = useQuery({ queryKey: queryKeys.myProfile, queryFn: getMyProfile });
  const progress = useQuery({ queryKey: queryKeys.myProgress, queryFn: getMyProgress });
  const units = profile.data?.units ?? "kg";
  return (
    <>
      <h1 className="text-3xl">Progress</h1>
      <section aria-label="Charts">
        {progress.isPending || profile.isPending ? (
          <LoadingState />
        ) : progress.isError || profile.isError ? (
          <p role="alert" className="mt-4 text-sm font-semibold text-amber-text">
            {plainErrorMessage(progress.error ?? profile.error)}
          </p>
        ) : progress.data.length === 0 ? (
          <p className="card mt-4 p-4 text-sm text-dim">
            No check-ins yet. Send a weekly check-in and your weight and plan adherence charts will appear here.
          </p>
        ) : (
          <ProgressCharts logs={progress.data} units={units} />
        )}
      </section>
      <MeasurementsSection />
      <MyStreaksSection />
    </>
  );
}

function MeasurementsSection() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: queryKeys.myMeasurements, queryFn: getMyMeasurements });
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const [toDelete, setToDelete] = useState<MyMeasurement | null>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);
  useEffect(() => {
    if (!open && returnFocus.current) addRef.current?.focus();
  }, [open]);
  const close = (didSave: boolean) => {
    returnFocus.current = true;
    setSaved(didSave);
    setOpen(false);
  };
  const remove = useMutation({
    mutationFn: (id: string) => deleteMyMeasurement(id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: queryKeys.myMeasurements });
      setToDelete(null);
      returnFocus.current = true;
      addRef.current?.focus();
    },
  });
  return (
    <section aria-labelledby="measurements-h" className="card mt-5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="measurements-h" className="font-body text-base font-bold">
          Body measurements
        </h2>
        {!open && (
          <button
            ref={addRef}
            type="button"
            onClick={() => {
              setSaved(false);
              setOpen(true);
            }}
            className="btn btn-primary min-h-11"
          >
            Add measurements
          </button>
        )}
      </div>
      {saved && (
        <p role="status" className="mt-2 text-sm font-semibold text-accent2">
          Measurements saved.
        </p>
      )}
      {open && <AddMeasurements onDone={close} />}
      {list.isPending ? (
        <LoadingState />
      ) : list.isError ? (
        <p role="alert" className="mt-3 text-sm font-semibold text-amber-text">
          {plainErrorMessage(list.error)}
        </p>
      ) : list.data.length === 0 ? (
        <p className="mt-3 text-sm text-dim">No measurements yet.</p>
      ) : (
        <ul aria-label="Measurements" className="mt-3 divide-y divide-border">
          {list.data.map((m) => (
            <MeasurementRow key={m.id} m={m} onDelete={() => setToDelete(m)} />
          ))}
        </ul>
      )}
      {toDelete && (
        <ConfirmDialog
          title="Delete these measurements?"
          confirmLabel="Delete"
          pendingLabel="Deleting..."
          pending={remove.isPending}
          onConfirm={() => remove.mutate(toDelete.id)}
          onCancel={() => {
            remove.reset();
            setToDelete(null);
          }}
        >
          The measurements from {toDelete.date} ({summary(toDelete)}) will be removed. This cannot be undone.
          {remove.isError && (
            <span role="alert" className="mt-2 block font-semibold text-amber-text">
              {plainErrorMessage(remove.error)}
            </span>
          )}
        </ConfirmDialog>
      )}
    </section>
  );
}

const summary = (m: MyMeasurement) =>
  FIELDS.filter((f) => m[f.key] != null)
    .map((f) => `${f.label.split(" (")[0]} ${m[f.key]} ${f.unit}`)
    .join(" · ");

function MeasurementRow({ m, onDelete }: { m: MyMeasurement; onDelete: () => void }) {
  return (
    <li className="flex flex-wrap items-start gap-x-3 gap-y-1 py-2">
      <span className="font-mono text-sm text-dim">{m.date}</span>
      <span className="min-w-0 flex-1 text-sm text-text">
        {summary(m)}
        {m.note && <span className="block text-xs text-dim">{m.note}</span>}
      </span>
      {m.createdBy === "client" ? (
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Delete measurements from ${m.date}: ${summary(m)}`}
          className="min-h-11 px-2 text-sm font-semibold text-accent underline underline-offset-4"
        >
          Delete
        </button>
      ) : (
        <span className="text-xs text-dim">Added by your coach</span>
      )}
    </li>
  );
}

function AddMeasurements({ onDone }: { onDone: (saved: boolean) => void }) {
  const qc = useQueryClient();
  const today = localDateKey(new Date());
  const [date, setDate] = useState(today);
  const [vals, setVals] = useState<Record<TapeKey, string>>({ waistCm: "", chestCm: "", armCm: "", hipCm: "", bodyFatPercent: "" });
  const [note, setNote] = useState("");
  const [error, setError] = useState<{ field: TapeKey | "date" | null; text: string } | null>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  useEffect(() => dateRef.current?.focus(), []);
  const save = useMutation({
    mutationFn: addMyMeasurement,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: queryKeys.myMeasurements });
      onDone(true);
    },
  });
  const invalid = (field: TapeKey | "date") =>
    error?.field === field ? { "aria-invalid": true as const, "aria-describedby": "ms-error" } : {};
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > today) return setError({ field: "date", text: "Pick a date that isn't in the future." });
    const body: Record<TapeKey, number | null> = { waistCm: null, chestCm: null, armCm: null, hipCm: null, bodyFatPercent: null };
    for (const f of FIELDS) {
      const s = vals[f.key].trim();
      if (s === "") continue;
      const n = Number(s);
      if (!Number.isFinite(n) || n <= 0 || n > f.max) return setError({ field: f.key, text: `${f.label}: more than 0 and at most ${f.max}.` });
      body[f.key] = n;
    }
    if (Object.values(body).every((v) => v === null)) return setError({ field: null, text: "Enter at least one measurement." });
    setError(null);
    save.mutate({ date, ...body, note: note.trim() });
  }
  return (
    <form onSubmit={submit} noValidate aria-label="Add measurements" className="mt-3 grid gap-3 rounded-lg border border-border p-3">
      <div className="sm:w-48">
        <label htmlFor="ms-date" className="mb-1 block text-sm font-semibold">
          Date
        </label>
        <input id="ms-date" ref={dateRef} {...invalid("date")} type="date" max={today} value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {FIELDS.map((f) => (
          <div key={f.key}>
            <label htmlFor={`ms-${f.key}`} className="mb-1 block text-sm font-semibold">
              {f.label}
            </label>
            <input
              id={`ms-${f.key}`}
              {...invalid(f.key)}
              inputMode="decimal"
              value={vals[f.key]}
              onChange={(e) => setVals((v) => ({ ...v, [f.key]: e.target.value }))}
              className={inputClass}
            />
          </div>
        ))}
      </div>
      <div>
        <label htmlFor="ms-note" className="mb-1 block text-sm font-semibold">
          Note (optional)
        </label>
        <input id="ms-note" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} className={inputClass} />
      </div>
      {(error || save.isError) && (
        <p id="ms-error" role="alert" className="text-sm font-semibold text-amber-text">
          {error?.text ?? plainErrorMessage(save.error)}
        </p>
      )}
      <div className="flex gap-2">
        <button type="submit" disabled={save.isPending} className="btn btn-primary min-h-11">
          {save.isPending ? "Saving..." : "Save measurements"}
        </button>
        <button type="button" onClick={() => onDone(false)} className="min-h-11 rounded-lg border border-border px-4 text-sm font-semibold text-text">
          Cancel
        </button>
      </div>
    </form>
  );
}
