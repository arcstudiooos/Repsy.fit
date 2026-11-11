// Check-ins tab (Prompt 53): the selected client's daily check-ins.
// Today's form (the coach logs for the client in v2), the last 14 days as a list, and small
// energy / mood bars. One check-in per client per day: saving today again updates today's row.
import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bar, BarChart, Cell, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { sleepSeries, sleepSummary } from "../lib/sleepStats";
import { listDailyCheckIns, queryKeys, saveDailyCheckIn } from "../api";
import { ErrorState, LoadingState, plainErrorMessage } from "../components/States";
import { HabitTracker } from "../components/HabitTracker";
import { Measurements } from "../components/Measurements";
import type { Client, DailyCheckIn, NewDailyCheckIn } from "../types";
import { localToday } from "./AiCoachTab";

const SCALE = [1, 2, 3, 4, 5] as const;
const CHART_HEIGHT = 110;

/** "" when the field is empty; the form keeps every value as text so a cleared box saves as null. */
type FormState = {
  energy: string;
  mood: string;
  sleepHours: string;
  recoveryScore: string;
  waterLiters: string;
  steps: string;
  foodNote: string;
};
const EMPTY: FormState = { energy: "", mood: "", sleepHours: "", recoveryScore: "", waterLiters: "", steps: "", foodNote: "" };

const toForm = (c: DailyCheckIn | undefined): FormState =>
  c
    ? {
        energy: c.energy === null ? "" : String(c.energy),
        mood: c.mood === null ? "" : String(c.mood),
        sleepHours: c.sleepHours === null ? "" : String(c.sleepHours),
        recoveryScore: c.recoveryScore === null ? "" : String(c.recoveryScore),
        waterLiters: c.waterLiters === null ? "" : String(c.waterLiters),
        steps: c.steps === null ? "" : String(c.steps),
        foodNote: c.foodNote,
      }
    : EMPTY;

const numberOrNull = (text: string) => (text.trim() === "" ? null : Number(text));
/** Left out of the body when empty (the server clears any field that is not sent). */
const numberOrUndefined = (text: string) => numberOrNull(text) ?? undefined;

type TabProps = {
  client: Client | null;
  /** Prompt 61: opens the Library's macro calculator pre-filled with this client. */
  onOpenMacroCalculator?: (clientId: string) => void;
};

export function CheckInsTab({ client, onOpenMacroCalculator }: TabProps) {
  if (!client) {
    return (
      <>
        <h2 className="text-2xl">Check-ins</h2>
        <p className="mt-1 text-dim">Pick a client above to log and read their daily check-ins.</p>
      </>
    );
  }
  return <ClientCheckIns key={client.id} client={client} onOpenMacroCalculator={onOpenMacroCalculator} />;
}

function ClientCheckIns({ client, onOpenMacroCalculator }: { client: Client; onOpenMacroCalculator?: (clientId: string) => void }) {
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
      sleepHours: numberOrUndefined(form.sleepHours),
      recoveryScore: numberOrUndefined(form.recoveryScore),
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
      {onOpenMacroCalculator && (
        <button
          type="button"
          onClick={() => onOpenMacroCalculator(client.id)}
          className="mt-2 text-sm font-semibold text-accent2 underline underline-offset-2"
        >
          Macro calculator for {client.name}
        </button>
      )}

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
          <Field label="Sleep (hours)" name="sleepHours" value={form.sleepHours} onChange={set("sleepHours")} step="0.1" min="0" max="16" />
          <Scale label="Recovery" name="recoveryScore" value={form.recoveryScore} onChange={set("recoveryScore")} />
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

      <HabitTracker clientId={client.id} today={today} />
      <Measurements clientId={client.id} today={today} />

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
          <SleepRecoveryCard checkIns={query.data} today={today} />
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

/** Sleep & Recovery: bars = sleep hours, line = recovery score (1-5), last 14 days, plus 7-day averages. */
function SleepRecoveryCard({ checkIns, today }: { checkIns: DailyCheckIn[]; today: string }) {
  const points = sleepSeries(checkIns, today);
  const summary = sleepSummary(points);
  const anyData = points.some((p) => p.sleepHours !== null || p.recoveryScore !== null);
  return (
    <section aria-label="Sleep & Recovery" className="card mt-4 p-5">
      <h3 className="text-base">Sleep &amp; Recovery</h3>
      {!anyData ? (
        <p className="mt-3 text-dim">No sleep or recovery logged in the last 14 days. Add them in today's check-in above.</p>
      ) : (
        <>
          <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-2">
            <div>
              <dt className="text-sm text-dim">Sleep, 7-day average</dt>
              <dd className="font-mono text-lg">
                {summary.sleepAverage === null ? "-" : `${summary.sleepAverage} h`}
                <span className="ml-2 text-xs text-dim">{summary.sleepNights} of 7 nights logged</span>
              </dd>
            </div>
            <div>
              <dt className="text-sm text-dim">Recovery, 7-day average</dt>
              <dd className="font-mono text-lg">
                {summary.recoveryAverage === null ? "-" : `${summary.recoveryAverage}/5`}
                <span className="ml-2 text-xs text-dim">{summary.recoveryDays} of 7 days logged</span>
              </dd>
            </div>
          </dl>
          {summary.ruleLine && <p className="mt-3 text-sm font-semibold text-amber-text">{summary.ruleLine}</p>}
          <div aria-label="Sleep hours and recovery score by day" role="img" className="mt-3">
            <ResponsiveContainer width="100%" height={CHART_HEIGHT + 60}>
              <ComposedChart data={points} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
                <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                <YAxis yAxisId="hours" domain={[0, 12]} ticks={[0, 6, 12]} width={24} tick={{ fontSize: 10 }} />
                <YAxis yAxisId="score" orientation="right" domain={[0, 5]} ticks={[0, 5]} width={18} tick={{ fontSize: 10 }} />
                <Tooltip
                  formatter={(v: number, name: string) => (name === "Sleep (hours)" ? `${v} h` : `${v} / 5`)}
                />
                <Bar yAxisId="hours" dataKey="sleepHours" name="Sleep (hours)" fill="#0e7c6b" radius={[3, 3, 0, 0]} />
                <Line
                  yAxisId="score"
                  dataKey="recoveryScore"
                  name="Recovery (1-5)"
                  stroke="#ff4a1f"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  connectNulls
                  type="monotone"
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-1 text-xs text-dim">Bars: hours slept. Line: recovery score. Every value is typed in by hand.</p>
        </>
      )}
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
                {c.sleepHours !== null && ` · Sleep ${c.sleepHours} h`}
                {c.recoveryScore !== null && ` · Recovery ${c.recoveryScore}/5`}
              </span>
              {c.foodNote && <span className="w-full text-sm text-text">{c.foodNote}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
