// Body measurements (Prompt 56), a section of the Check-ins tab: add a set of measurements for the
// selected client, read them as a table (newest first), delete with a confirm, and chart one of them
// over time. Weight is a chart choice but is read from the progress logs, never stored here.
import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { addMeasurement, deleteMeasurement, listMeasurements, listProgress, queryKeys } from "../api";
import { ConfirmDialog } from "./ConfirmDialog";
import { ErrorState, LoadingState, plainErrorMessage } from "./States";
import type { Measurement, NewMeasurement } from "../types";

const ACCENT = "#FF4A1F"; // design-system accent, same as the Progress charts
const CHART_HEIGHT = 220;
const shortDate = (date: string) => date.slice(5);

type TapeKey = "waistCm" | "chestCm" | "armCm" | "hipCm" | "bodyFatPercent";
const FIELDS: { key: TapeKey; label: string; word: string; unit: string; max: string }[] = [
  { key: "waistCm", label: "Waist (cm)", word: "waist", unit: "cm", max: "300" },
  { key: "chestCm", label: "Chest (cm)", word: "chest", unit: "cm", max: "300" },
  { key: "armCm", label: "Arm (cm)", word: "arm", unit: "cm", max: "300" },
  { key: "hipCm", label: "Hip (cm)", word: "hip", unit: "cm", max: "300" },
  { key: "bodyFatPercent", label: "Body fat (%)", word: "body fat", unit: "%", max: "75" },
];
const WEIGHT = { key: "weightKg", label: "Weight (kg)", word: "weight", unit: "kg" } as const;

type FormState = Record<TapeKey, string> & { date: string; note: string };
const emptyForm = (date: string): FormState => ({ date, waistCm: "", chestCm: "", armCm: "", hipCm: "", bodyFatPercent: "", note: "" });

const show = (value: number | null) => (value === null ? "-" : String(value));

export function Measurements({ clientId, today }: { clientId: string; today: string }) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: queryKeys.measurements(clientId), queryFn: () => listMeasurements(clientId) });
  // Weight for the chart comes from the Progress logs (oldest first); if they fail to load it is just not offered.
  const progress = useQuery({ queryKey: queryKeys.progress(clientId), queryFn: () => listProgress(clientId) });

  const [form, setForm] = useState<FormState>(() => emptyForm(today));
  const [formError, setFormError] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<Measurement | null>(null);
  const [chartKey, setChartKey] = useState<string | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.measurements(clientId) });
  const add = useMutation({
    mutationFn: (input: NewMeasurement) => addMeasurement(clientId, input),
    onSuccess: () => {
      setForm((f) => emptyForm(f.date));
      return refresh();
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteMeasurement(clientId, id),
    onSuccess: () => {
      setToDelete(null);
      return refresh();
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    add.reset();
    const body: NewMeasurement = { date: form.date };
    let any = false;
    for (const { key } of FIELDS) {
      if (form[key].trim() !== "") {
        body[key] = Number(form[key]);
        any = true;
      }
    }
    if (!form.date) return setFormError("Pick a date.");
    if (!any) return setFormError("Enter at least one measurement.");
    if (form.note.trim()) body.note = form.note.trim();
    setFormError(null);
    add.mutate(body);
  }

  const items = query.data ?? [];
  const hasWeight = (progress.data ?? []).some((l) => l.weightKg !== null);
  const choices = [...(hasWeight ? [WEIGHT] : []), ...FIELDS];
  const chosen = choices.find((c) => c.key === chartKey) ?? choices[0];
  const problem = formError ?? (add.isError ? plainErrorMessage(add.error) : null);

  // Oldest first so the line reads left to right; rows without that value are skipped.
  const points: { date: string; value: number }[] =
    chosen.key === "weightKg"
      ? (progress.data ?? []).filter((l) => l.weightKg !== null).map((l) => ({ date: l.date, value: l.weightKg as number }))
      : [...items].reverse().flatMap((m) => {
          const value = m[chosen.key];
          return value === null ? [] : [{ date: m.date, value }];
        });

  return (
    <section aria-label="Body measurements" className="card mt-4 p-5">
      <h3 className="text-base">Body measurements</h3>
      <p className="mt-1 text-sm text-dim">Log tape measurements and body fat for this client. Every value is typed in by hand.</p>

      <form onSubmit={submit} noValidate aria-label="Add measurements" className="mt-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="measurementDate" className="mb-1 block text-sm font-bold">
              Measurement date
            </label>
            <input
              id="measurementDate"
              type="date"
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              className="min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-base text-text"
            />
          </div>
          {FIELDS.map(({ key, label, max }) => (
            <div key={key}>
              <label htmlFor={`m-${key}`} className="mb-1 block text-sm font-bold">
                {label}
              </label>
              <input
                id={`m-${key}`}
                type="number"
                inputMode="decimal"
                step="0.1"
                min="0"
                max={max}
                value={form[key]}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                className="min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-base text-text"
              />
            </div>
          ))}
        </div>
        <div className="mt-4">
          <label htmlFor="measurementNote" className="mb-1 block text-sm font-bold">
            Measurement note
          </label>
          <input
            id="measurementNote"
            value={form.note}
            maxLength={500}
            onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
            className="min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-base text-text"
          />
        </div>
        {problem && (
          <p role="alert" className="mt-3 text-sm font-semibold text-amber-text">
            {problem}
          </p>
        )}
        <div className="mt-4">
          <button type="submit" disabled={add.isPending} className="btn-primary rounded-lg px-5 py-2 text-sm disabled:opacity-60">
            {add.isPending ? "Adding..." : "Add measurement"}
          </button>
        </div>
      </form>

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
          {items.length === 0 ? (
            <p className="mt-4 text-dim">No measurements yet. Add the first set above.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table aria-label="Measurements" className="w-full min-w-[34rem] border-collapse text-sm">
                <thead>
                  <tr className="text-left text-xs text-dim">
                    <th scope="col" className="py-1 pr-3 font-semibold">
                      Date
                    </th>
                    {FIELDS.map((f) => (
                      <th key={f.key} scope="col" className="px-2 py-1 font-semibold">
                        {f.label}
                      </th>
                    ))}
                    <th scope="col" className="px-2 py-1 font-semibold">
                      Note
                    </th>
                    <th scope="col" className="py-1 pl-2 text-right font-semibold">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((m) => (
                    <tr key={m.id} className="border-t border-border">
                      <th scope="row" className="py-2 pr-3 text-left font-mono font-normal text-text">
                        {m.date}
                      </th>
                      {FIELDS.map((f) => (
                        <td key={f.key} className="px-2 py-2 font-mono text-text">
                          {show(m[f.key])}
                        </td>
                      ))}
                      <td className="min-w-0 max-w-[14rem] break-words px-2 py-2 text-dim">
                        {m.createdBy === "client" && <span className="mr-1 font-semibold text-accent2">Added by client.</span>}
                        {m.note}
                      </td>
                      <td className="py-2 pl-2 text-right">
                        <button
                          type="button"
                          aria-label={`Delete measurement ${m.date}`}
                          onClick={() => setToDelete(m)}
                          className="rounded px-1 text-sm text-dim underline-offset-2 hover:text-text hover:underline"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-6">
            <label htmlFor="measurementChart" className="mb-1 block text-sm font-bold">
              Chart
            </label>
            <select
              id="measurementChart"
              value={chosen.key}
              onChange={(e) => setChartKey(e.target.value)}
              className="min-h-11 rounded-lg border border-border bg-surface px-3 text-base text-text"
            >
              {choices.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
            {points.length === 0 ? (
              <p className="mt-3 text-dim">No {chosen.word} values logged yet.</p>
            ) : (
              <div role="img" aria-label={`${chosen.label} over time`} className="mt-3">
                <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
                  <LineChart data={points} margin={{ top: 8, right: 12, bottom: 8, left: 4 }}>
                    <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                    <XAxis dataKey="date" tickFormatter={shortDate} stroke="var(--dim)" />
                    <YAxis domain={["dataMin - 1", "dataMax + 1"]} width={44} stroke="var(--dim)" />
                    <Tooltip labelFormatter={(date) => String(date)} formatter={(value) => [`${value} ${chosen.unit}`, chosen.label]} />
                    <Line type="monotone" dataKey="value" stroke={ACCENT} strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
            {chosen.key === "weightKg" && <p className="mt-1 text-xs text-dim">Weight comes from the Progress check-ins.</p>}
          </div>
        </>
      )}

      {remove.isError && (
        <p role="alert" className="mt-3 text-sm font-semibold text-amber-text">
          Couldn't delete: {plainErrorMessage(remove.error)}
        </p>
      )}
      {toDelete && (
        <ConfirmDialog
          title="Delete this measurement?"
          confirmLabel="Delete"
          pendingLabel="Deleting..."
          pending={remove.isPending}
          onConfirm={() => remove.mutate(toDelete.id)}
          onCancel={() => {
            remove.reset();
            setToDelete(null);
          }}
        >
          The measurements for {toDelete.date} will be removed. This cannot be undone.
        </ConfirmDialog>
      )}
    </section>
  );
}
