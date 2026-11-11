// Check-ins tab (Prompt 53): the selected client's daily check-ins.
// Today's form (the coach logs for the client in v2), the last 14 days as a list, and small
// energy / mood bars. One check-in per client per day: saving today again updates today's row.
import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { listDailyCheckIns, queryKeys, saveDailyCheckIn } from "../api";
import { ErrorState, LoadingState, plainErrorMessage } from "../components/States";
import type { Client, DailyCheckIn, NewDailyCheckIn } from "../types";
import { localToday } from "./AiCoachTab";

const SCALE = [1, 2, 3, 4, 5] as const;
const CHART_HEIGHT = 110;

/** "" when the field is empty; the form keeps every value as text so a cleared box saves as null. */
type FormState = { energy: string; mood: string; waterLiters: string; steps: string; foodNote: string };
const EMPTY: FormState = { energy: "", mood: "", waterLiters: "", steps: "", foodNote: "" };

const toForm = (c: DailyCheckIn | undefined): FormState =>
  c
    ? {
        energy: c.energy === null ? "" : String(c.energy),
        mood: c.mood === null ? "" : String(c.mood),
        waterLiters: c.waterLiters === null ? "" : String(c.waterLiters),
        steps: c.steps === null ? "" : String(c.steps),
        foodNote: c.foodNote,
      }
    : EMPTY;

const numberOrNull = (text: string) => (text.trim() === "" ? null : Number(text));

export function CheckInsTab({ client }: { client: Client | null }) {
  if (!client) {
    return (
      <>
        <h2 className="text-2xl">Check-ins</h2>
        <p className="mt-1 text-dim">Pick a client above to log and read their daily check-ins.</p>
      </>
    );
  }
  return <ClientCheckIns key={client.id} client={client} />;
}

function ClientCheckIns({ client }: { client: Client }) {
  const queryClient = useQueryClient();
  const today = localToday();
  const query = useQuery({ queryKey: queryKeys.dailyCheckIns(client.id), queryFn: () => listDailyCheckIns(client.id) });
  const todays = query.data?.find((c) => c.date === today);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  // Fill the form from today's saved check-in once it has loaded (editing it keeps your typing).
  useEffect(() => {
    if (query.data && loadedFor !== today) {
      setForm(toForm(todays));
      setLoadedFor(today);
    }
  }, [query.data, todays, today, loadedFor]);

  const save = useMutation({
    mutationFn: (input: NewDailyCheckIn) => saveDailyCheckIn(client.id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.dailyCheckIns(client.id) }),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    save.mutate({
      date: today,
      energy: numberOrNull(form.energy),
      mood: numberOrNull(form.mood),
      waterLiters: numberOrNull(form.waterLiters),
      steps: numberOrNull(form.steps),
      foodNote: form.foodNote.trim(),
    });
  }

  const set = (key: keyof FormState) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  return (
    <>
      <h2 className="text-2xl">Check-ins</h2>
      <p className="mt-1 text-dim">Selected: {client.name}</p>

      <form onSubmit={submit} noValidate aria-label="Today's check-in" className="card mt-4 p-5">
        <h3 className="text-base">
          Today's check-in <span className="font-mono text-xs font-normal text-dim">{today}</span>
        </h3>
        <p className="mt-1 text-sm text-dim">
          {todays ? "Saved for today. Changing a value updates it." : "Nothing logged for today yet."}
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Scale label="Energy" name="energy" value={form.energy} onChange={set("energy")} />
          <Scale label="Mood" name="mood" value={form.mood} onChange={set("mood")} />
          <Field label="Water (litres)" name="waterLiters" value={form.waterLiters} onChange={set("waterLiters")} step="0.1" min="0" max="20" />
          <Field label="Steps" name="steps" value={form.steps} onChange={set("steps")} step="1" min="0" max="100000" />
        </div>
        <div className="mt-4">
          <label htmlFor="foodNote" className="mb-1 block text-sm font-bold">
            Food note
          </label>
          <textarea
            id="foodNote"
            rows={2}
            value={form.foodNote}
            onChange={(e) => set("foodNote")(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-base text-text"
          />
        </div>
        {save.isError && (
          <p role="alert" className="mt-3 text-sm font-semibold text-amber-text">
            {plainErrorMessage(save.error)}
          </p>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="submit" disabled={save.isPending} className="btn-primary rounded-lg px-5 py-2 text-sm disabled:opacity-60">
            {save.isPending ? "Saving..." : todays ? "Update today" : "Save check-in"}
          </button>
          {save.isSuccess && !save.isPending && (
            <span role="status" className="text-sm font-bold text-accent2">
              ✓ Saved
            </span>
          )}
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
          <Sparklines checkIns={query.data} />
          <History checkIns={query.data} />
        </>
      )}
    </>
  );
}

/** 1-5 picker: five buttons, so a value is one tap and the scale is obvious. */
function Scale({ label, name, value, onChange }: { label: string; name: string; value: string; onChange: (v: string) => void }) {
  return (
    <div role="group" aria-label={label}>
      <span className="mb-1 block text-sm font-bold">{label}</span>
      <div className="flex gap-2">
        {SCALE.map((n) => {
          const selected = value === String(n);
          return (
            <button
              key={n}
              type="button"
              aria-pressed={selected}
              aria-label={`${label} ${n}`}
              onClick={() => onChange(selected ? "" : String(n))}
              className={
                "h-10 w-10 rounded-lg border text-sm font-bold " +
                (selected ? "btn-primary border-accent" : "border-border bg-surface2 text-text hover:border-dim")
              }
            >
              {n}
            </button>
          );
        })}
      </div>
      <input type="hidden" name={name} value={value} readOnly />
    </div>
  );
}

function Field({
  label,
  name,
  value,
  onChange,
  step,
  min,
  max,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (v: string) => void;
  step: string;
  min: string;
  max: string;
}) {
  return (
    <div>
      <label htmlFor={name} className="mb-1 block text-sm font-bold">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type="number"
        inputMode="decimal"
        step={step}
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-base text-text"
      />
    </div>
  );
}

/** Small energy / mood bars over the loaded days, oldest to newest (reads left to right). */
function Sparklines({ checkIns }: { checkIns: DailyCheckIn[] }) {
  const points = [...checkIns].reverse().map((c) => ({ date: c.date.slice(5), energy: c.energy ?? 0, mood: c.mood ?? 0 }));
  if (points.length === 0) return null;
  return (
    <section aria-label="Energy and mood" className="card mt-4 p-5">
      <h3 className="text-base">Energy and mood</h3>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        {([
          ["Energy", "energy", "#ff4a1f"],
          ["Mood", "mood", "#0e7c6b"],
        ] as const).map(([title, key, colour]) => (
          <div key={key}>
            <p className="text-sm font-bold">{title}</p>
            <div aria-label={`${title} by day`} role="img">
              <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
                <BarChart data={points} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis domain={[0, 5]} ticks={[0, 5]} width={18} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: number) => (v === 0 ? "not logged" : `${v} / 5`)} />
                  <Bar dataKey={key} fill={colour} radius={[3, 3, 0, 0]}>
                    {points.map((p) => (
                      <Cell key={p.date} fillOpacity={p[key] === 0 ? 0.25 : 1} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

const scaleText = (n: number | null) => (n === null ? "-" : `${n}/5`);

/** The last 14 days, newest first. */
function History({ checkIns }: { checkIns: DailyCheckIn[] }) {
  return (
    <section aria-label="Last 14 days" className="card mt-4 p-5">
      <h3 className="text-base">Last 14 days</h3>
      {checkIns.length === 0 ? (
        <p className="mt-3 text-dim">No check-ins logged yet. Use the form above to log today.</p>
      ) : (
        <ul aria-label="Daily check-ins" className="mt-3 divide-y divide-border">
          {checkIns.map((c) => (
            <li key={c.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3">
              <span className="font-mono text-sm text-text">{c.date}</span>
              <span className="font-mono text-sm text-dim">
                Energy {scaleText(c.energy)} · Mood {scaleText(c.mood)}
                {c.waterLiters !== null && ` · ${c.waterLiters} L`}
                {c.steps !== null && ` · ${c.steps} steps`}
              </span>
              {c.foodNote && <span className="w-full text-sm text-text">{c.foodNote}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
