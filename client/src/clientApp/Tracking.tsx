// The client's own tracking (Prompt 80): today's habits, the daily check-in, the weekly check-in, the
// Nutrition plan's targets and meals, and the weekly check-in day. Today and yesterday only - the server
// refuses anything older.
import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addMyProgress,
  getMyCheckIn,
  getMyHabits,
  getMyProgress,
  getMyProfile,
  getMyTargets,
  queryKeys,
  saveMyCheckIn,
  saveMyProfile,
  tickMyHabit,
} from "../api";
import { addDays, localDateKey } from "../lib/schedule";
import { LoadingState, plainErrorMessage } from "../components/States";
import { navigate } from "../route";
import type { ClientAssignment, MyCheckIn, MyProgressLog } from "../types";

const LB_PER_KG = 2.20462262;
const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;
export const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const inputClass =
  "min-h-11 w-full rounded-lg border border-border bg-surface2 px-3 text-base text-text";
const linkTo = (href: string) => (e: React.MouseEvent<HTMLAnchorElement>) => {
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
  e.preventDefault();
  navigate(href);
};

// ---------- Today: habits + check-in prompts ----------

export function TodayHabits({ today }: { today: string }) {
  const qc = useQueryClient();
  const habits = useQuery({
    queryKey: queryKeys.myHabits(today),
    queryFn: () => getMyHabits(today),
  });
  // A tick shows at once: React applies state set in the click handler before the event ends. The server
  // copy then refreshes; a failed save drops the local tick and shows the error.
  const [local, setLocal] = useState<Record<string, boolean>>({});
  const tick = useMutation({
    mutationFn: (v: { id: string; done: boolean }) =>
      tickMyHabit(v.id, today, v.done),
    onError: (_e, v) => setLocal(({ [v.id]: _drop, ...rest }) => rest),
    // The local tick stays until the next one for that habit; the refreshed server copy agrees with it.
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: ["client-account", "habits"] }),
        qc.invalidateQueries({ queryKey: ["client-account", "my-streaks"] }),
      ]),
  });
  if (habits.isPending) return null;
  if (habits.isError) {
    return (
      <section aria-label="Today's habits" className="card p-4">
        <h2 className="font-body text-base font-bold">Habits</h2>
        <p role="alert" className="mt-2 text-sm font-semibold text-amber-text">
          {plainErrorMessage(habits.error)}
        </p>
      </section>
    );
  }
  if (habits.data.habits.length === 0) return null;
  return (
    <section aria-label="Today's habits" className="card p-4">
      <h2 className="font-body text-base font-bold">Habits</h2>
      <ul className="mt-2 grid gap-1">
        {habits.data.habits.map((h) => {
          const done = local[h.id] ?? h.week[h.week.length - 1] === true;
          return (
            <li key={h.id}>
              <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded px-1 hover:bg-surface2">
                <input
                  type="checkbox"
                  checked={done}
                  onChange={() => {
                    setLocal((l) => ({ ...l, [h.id]: !done }));
                    tick.mutate({ id: h.id, done: !done });
                  }}
                  className="h-6 w-6 shrink-0 accent-[var(--accent2)]"
                />
                <span
                  className={`flex-1 text-sm font-semibold ${done ? "text-dim line-through" : "text-text"}`}
                >
                  {h.name}
                </span>
                {h.currentStreak > 0 && (
                  <span className="font-mono text-xs text-dim">
                    {h.currentStreak}-day streak
                  </span>
                )}
              </label>
            </li>
          );
        })}
      </ul>
      {tick.isError && (
        <p role="alert" className="mt-2 text-sm font-semibold text-amber-text">
          {plainErrorMessage(tick.error)}
        </p>
      )}
    </section>
  );
}

export function CheckInPrompts({ today }: { today: string }) {
  const checkIn = useQuery({
    queryKey: queryKeys.myCheckIn(today),
    queryFn: () => getMyCheckIn(today),
  });
  const targets = useQuery({
    queryKey: queryKeys.myTargets,
    queryFn: getMyTargets,
  });
  const weekday = new Date(`${today}T00:00:00`).getDay();
  const isWeeklyDay = targets.data?.weeklyCheckInDay === weekday;
  const doneToday = !!checkIn.data?.checkIn;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <a
        href="/client/checkin"
        onClick={linkTo("/client/checkin")}
        className="card block p-4 hover:border-dim"
      >
        <p className="font-body text-base font-bold text-text">
          How was today?
        </p>
        <p className="mt-1 text-sm text-dim">
          {doneToday
            ? "Checked in ✓ - tap to change it."
            : "Energy, mood, sleep - 30 seconds."}
        </p>
      </a>
      <a
        href="/client/weekly"
        onClick={linkTo("/client/weekly")}
        className={`card block p-4 hover:border-dim ${isWeeklyDay ? "border-accent2" : ""}`}
      >
        <p className="font-body text-base font-bold text-text">
          {isWeeklyDay ? "It's weekly check-in day" : "Weekly check-in"}
        </p>
        <p className="mt-1 text-sm text-dim">
          Weight, how the week went, workouts done. Your coach reviews it.
        </p>
      </a>
    </div>
  );
}

// ---------- Daily check-in page ----------

function Scale({
  name,
  label,
  value,
  onChange,
}: {
  name: string;
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  return (
    <fieldset>
      <legend className="text-sm font-semibold text-text">{label}</legend>
      <div className="mt-1 grid grid-cols-5 gap-2">
        {[1, 2, 3, 4, 5].map((n) => (
          <label
            key={n}
            className={`flex min-h-11 cursor-pointer items-center justify-center rounded-lg border font-mono text-sm font-semibold has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 ${
              value === n
                ? "border-accent bg-accent text-on-accent"
                : "border-border bg-surface2 text-text hover:border-dim"
            }`}
          >
            <input
              type="radio"
              name={name}
              value={n}
              checked={value === n}
              onChange={() => onChange(n)}
              aria-label={`${n} of 5${n === 1 ? ", low" : n === 5 ? ", high" : ""}`}
              className="sr-only"
            />
            {n}
          </label>
        ))}
      </div>
      <p className="mt-0.5 flex items-center justify-between text-xs text-dim">
        <span aria-hidden="true">Low</span>
        {value !== null && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="min-h-8 px-2 font-semibold text-accent2 underline underline-offset-4"
          >
            Clear {label.split(" ")[0].toLowerCase()}
          </button>
        )}
        <span aria-hidden="true">High</span>
      </p>
    </fieldset>
  );
}

const numOrNull = (s: string) => (s.trim() === "" ? null : Number(s));

export function CheckInPage() {
  const today = localDateKey(new Date());
  const yesterday = localDateKey(addDays(new Date(), -1));
  const [day, setDay] = useState(today);
  const existing = useQuery({
    queryKey: queryKeys.myCheckIn(day),
    queryFn: () => getMyCheckIn(day),
  });
  return (
    <>
      <BackLink />
      <h1 className="mt-3 text-3xl">Daily check-in</h1>
      <fieldset className="mt-4">
        <legend className="sr-only">Which day</legend>
        <div className="inline-flex overflow-hidden rounded-lg border border-border">
          {[
            [today, "Today"],
            [yesterday, "Yesterday"],
          ].map(([d, label]) => (
            <label
              key={d}
              className={`flex min-h-11 cursor-pointer items-center px-4 text-sm font-semibold has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-2 ${
                day === d ? "bg-accent text-on-accent" : "bg-surface2 text-text"
              }`}
            >
              <input
                type="radio"
                name="checkin-day-choice"
                value={d}
                checked={day === d}
                onChange={() => setDay(d)}
                className="sr-only"
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      {existing.isPending ? (
        <LoadingState />
      ) : existing.isError ? (
        <p role="alert" className="mt-4 text-sm font-semibold text-amber-text">
          {plainErrorMessage(existing.error)}
        </p>
      ) : (
        <CheckInForm key={day} day={day} initial={existing.data.checkIn} />
      )}
    </>
  );
}

function CheckInForm({
  day,
  initial,
}: {
  day: string;
  initial: MyCheckIn | null;
}) {
  const qc = useQueryClient();
  const [energy, setEnergy] = useState<number | null>(initial?.energy ?? null);
  const [mood, setMood] = useState<number | null>(initial?.mood ?? null);
  const [recovery, setRecovery] = useState<number | null>(
    initial?.recoveryScore ?? null,
  );
  const [sleep, setSleep] = useState(initial?.sleepHours?.toString() ?? "");
  const [water, setWater] = useState(initial?.waterLiters?.toString() ?? "");
  const [steps, setSteps] = useState(initial?.steps?.toString() ?? "");
  const [food, setFood] = useState(initial?.foodNote ?? "");
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () =>
      saveMyCheckIn(day, {
        energy,
        mood,
        recoveryScore: recovery,
        sleepHours: numOrNull(sleep),
        waterLiters: numOrNull(water),
        steps: numOrNull(steps),
        foodNote: food.trim(),
      }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["client-account", "checkin"] }),
  });
  function submit(e: FormEvent) {
    e.preventDefault();
    const s = numOrNull(sleep);
    if (
      s !== null &&
      (!Number.isFinite(s) || s < 0 || s > 16 || Math.round(s * 10) !== s * 10)
    )
      return setError("Sleep: hours from 0 to 16, with at most one decimal.");
    const w = numOrNull(water);
    if (w !== null && (!Number.isFinite(w) || w < 0 || w > 20))
      return setError("Water: litres from 0 to 20.");
    const st = numOrNull(steps);
    if (st !== null && (!Number.isInteger(st) || st < 0 || st > 100000))
      return setError("Steps: a whole number up to 100000.");
    setError(null);
    save.mutate();
  }
  return (
    <form
      onSubmit={submit}
      noValidate
      aria-label="Daily check-in"
      className="card mt-4 grid gap-4 p-4"
    >
      <Scale name="energy" label="Energy" value={energy} onChange={setEnergy} />
      <Scale name="mood" label="Mood" value={mood} onChange={setMood} />
      <Scale
        name="recovery"
        label="Recovery (how your body feels)"
        value={recovery}
        onChange={setRecovery}
      />
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label
            htmlFor="ci-sleep"
            className="mb-1 block text-sm font-semibold"
          >
            Sleep (h)
          </label>
          <input
            id="ci-sleep"
            inputMode="decimal"
            value={sleep}
            onChange={(e) => setSleep(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label
            htmlFor="ci-water"
            className="mb-1 block text-sm font-semibold"
          >
            Water (L)
          </label>
          <input
            id="ci-water"
            inputMode="decimal"
            value={water}
            onChange={(e) => setWater(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label
            htmlFor="ci-steps"
            className="mb-1 block text-sm font-semibold"
          >
            Steps
          </label>
          <input
            id="ci-steps"
            inputMode="numeric"
            value={steps}
            onChange={(e) => setSteps(e.target.value)}
            className={inputClass}
          />
        </div>
      </div>
      <div>
        <label htmlFor="ci-food" className="mb-1 block text-sm font-semibold">
          What did you eat? (optional)
        </label>
        <textarea
          id="ci-food"
          value={food}
          onChange={(e) => setFood(e.target.value)}
          maxLength={1000}
          rows={3}
          className="w-full rounded-lg border border-border bg-surface2 px-3 py-2 text-base text-text"
        />
      </div>
      {(error || save.isError) && (
        <p role="alert" className="text-sm font-semibold text-amber-text">
          {error ?? plainErrorMessage(save.error)}
        </p>
      )}
      {save.isSuccess && (
        <p role="status" className="text-sm font-semibold text-accent2">
          Saved. Your coach can see it.
        </p>
      )}
      <button
        type="submit"
        disabled={save.isPending}
        className="btn-primary min-h-11 rounded-lg px-5 text-sm disabled:opacity-60"
      >
        {save.isPending ? "Saving..." : "Save check-in"}
      </button>
    </form>
  );
}

// ---------- Weekly check-in page ----------

export function WeeklyPage() {
  const qc = useQueryClient();
  const profile = useQuery({
    queryKey: queryKeys.myProfile,
    queryFn: getMyProfile,
  });
  const past = useQuery({
    queryKey: queryKeys.myProgress,
    queryFn: getMyProgress,
  });
  const units = profile.data?.units ?? "kg";
  const [weight, setWeight] = useState("");
  const [adherence, setAdherence] = useState("");
  const [workouts, setWorkouts] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const send = useMutation({
    mutationFn: (body: Parameters<typeof addMyProgress>[0]) =>
      addMyProgress(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.myProgress }),
  });
  function submit(e: FormEvent) {
    e.preventDefault();
    const w = numOrNull(weight);
    const kg = w === null ? null : units === "lb" ? round2(w / LB_PER_KG) : w;
    if (
      w !== null &&
      (!Number.isFinite(w) || kg === null || kg <= 0 || kg > 500)
    )
      return setError(`Weight: a number in ${units}.`);
    const a = numOrNull(adherence);
    if (a !== null && (!Number.isInteger(a) || a < 0 || a > 100))
      return setError(
        "How closely you followed the plan: a whole number from 0 to 100.",
      );
    const wo = numOrNull(workouts);
    if (wo !== null && (!Number.isInteger(wo) || wo < 0 || wo > 14))
      return setError("Workouts done: a whole number from 0 to 14.");
    if (kg === null && a === null && wo === null && note.trim() === "")
      return setError("Fill in at least one thing.");
    setError(null);
    send.mutate({
      date: localDateKey(new Date()),
      weightKg: kg,
      adherence: a,
      workoutsDone: wo,
      note: note.trim(),
    });
  }
  if (send.isSuccess) {
    return (
      <>
        <BackLink />
        <h1 className="mt-3 text-3xl">Weekly check-in</h1>
        <p
          role="status"
          className="mt-4 card p-4 text-base font-semibold text-accent2"
        >
          Sent to your coach. Thanks!
        </p>
      </>
    );
  }
  return (
    <>
      <BackLink />
      <h1 className="mt-3 text-3xl">Weekly check-in</h1>
      <p className="mt-1 text-sm text-dim">
        Your coach reviews this and may adjust your plan.
      </p>
      {profile.isPending ? (
        <LoadingState />
      ) : profile.isError ? (
        <p role="alert" className="mt-4 text-sm font-semibold text-amber-text">
          {plainErrorMessage(profile.error)}
        </p>
      ) : (
        <form
          onSubmit={submit}
          noValidate
          aria-label="Weekly check-in"
          className="card mt-4 grid gap-4 p-4"
        >
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label
                htmlFor="wk-weight"
                className="mb-1 block text-sm font-semibold"
              >
                Weight ({units})
              </label>
              <input
                id="wk-weight"
                inputMode="decimal"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label
                htmlFor="wk-adherence"
                className="mb-1 block text-sm font-semibold"
              >
                Plan followed (%)
              </label>
              <input
                id="wk-adherence"
                inputMode="numeric"
                value={adherence}
                onChange={(e) => setAdherence(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label
                htmlFor="wk-workouts"
                className="mb-1 block text-sm font-semibold"
              >
                Workouts done
              </label>
              <input
                id="wk-workouts"
                inputMode="numeric"
                value={workouts}
                onChange={(e) => setWorkouts(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>
          <div>
            <label
              htmlFor="wk-note"
              className="mb-1 block text-sm font-semibold"
            >
              How did the week go? (optional)
            </label>
            <textarea
              id="wk-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              rows={3}
              className="w-full rounded-lg border border-border bg-surface2 px-3 py-2 text-base text-text"
            />
          </div>
          {(error || send.isError) && (
            <p role="alert" className="text-sm font-semibold text-amber-text">
              {error ?? plainErrorMessage(send.error)}
            </p>
          )}
          <button
            type="submit"
            disabled={send.isPending}
            className="btn-primary min-h-11 rounded-lg px-5 text-sm disabled:opacity-60"
          >
            {send.isPending ? "Sending..." : "Send to my coach"}
          </button>
        </form>
      )}
      <PastCheckIns logs={past.data ?? []} units={units} />
    </>
  );
}

function PastCheckIns({
  logs,
  units,
}: {
  logs: MyProgressLog[];
  units: "kg" | "lb";
}) {
  if (logs.length === 0) return null;
  const shown = [...logs].reverse().slice(0, 8);
  return (
    <section aria-label="Past check-ins" className="card mt-4 p-4">
      <h2 className="font-body text-base font-bold">Past check-ins</h2>
      <ul className="mt-2 divide-y divide-border text-sm">
        {shown.map((l) => (
          <li key={l.id} className="flex flex-wrap gap-x-4 py-2">
            <span className="font-mono text-dim">{l.date}</span>
            {l.weightKg != null && (
              <span className="font-mono text-text">
                {units === "lb"
                  ? round1(l.weightKg * LB_PER_KG)
                  : round1(l.weightKg)}{" "}
                {units}
              </span>
            )}
            {l.adherence != null && (
              <span className="text-dim">{l.adherence}% of plan</span>
            )}
            {l.workoutsDone != null && (
              <span className="text-dim">{l.workoutsDone} workouts</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------- Nutrition plan: targets + meals ----------

export function NutritionExtras({ plan }: { plan: ClientAssignment }) {
  const targets = useQuery({
    queryKey: queryKeys.myTargets,
    queryFn: getMyTargets,
  });
  const t = targets.data;
  const meals = plan.meals ?? [];
  const hasTargets =
    !!t && (t.calorieTarget != null || t.proteinTargetG != null);
  if (!hasTargets && meals.length === 0) return null;
  const total = meals.reduce(
    (s, m) => ({ kcal: s.kcal + m.calories, p: s.p + m.proteinG }),
    { kcal: 0, p: 0 },
  );
  return (
    <div className="mt-5 grid gap-3">
      {hasTargets && (
        <section aria-label="Daily targets" className="card p-4">
          <h2 className="font-body text-base font-bold">Your daily targets</h2>
          <p className="mt-1 font-mono text-lg text-text">
            {t!.calorieTarget != null && <span>{t!.calorieTarget} kcal</span>}
            {t!.calorieTarget != null && t!.proteinTargetG != null && " · "}
            {t!.proteinTargetG != null && (
              <span>{t!.proteinTargetG} g protein</span>
            )}
          </p>
        </section>
      )}
      {meals.length > 0 && (
        <section aria-label="Meals" className="card p-4">
          <h2 className="font-body text-base font-bold">
            Meals your coach picked
          </h2>
          <ul className="mt-2 divide-y divide-border">
            {meals.map((m) => (
              <li key={m.id} className="py-2">
                <p className="text-sm font-semibold text-text">
                  {m.name}{" "}
                  <span className="font-normal text-dim">· {m.mealType}</span>
                </p>
                <p className="font-mono text-xs text-dim">
                  {m.calories} kcal · P {m.proteinG}g · C {m.carbsG}g · F{" "}
                  {m.fatG}g
                </p>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-dim">
            Together:{" "}
            <span className="font-mono">
              {total.kcal} kcal · {round1(total.p)} g protein
            </span>
          </p>
        </section>
      )}
    </div>
  );
}

// ---------- Me: weekly check-in day ----------

export function CheckInDaySetting() {
  const qc = useQueryClient();
  const targets = useQuery({
    queryKey: queryKeys.myTargets,
    queryFn: getMyTargets,
  });
  const save = useMutation({
    mutationFn: (d: number) => saveMyProfile({ weeklyCheckInDay: d }),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: queryKeys.myTargets }),
        qc.invalidateQueries({ queryKey: queryKeys.myProfile }),
      ]),
  });
  if (!targets.data) return null;
  return (
    <section
      aria-label="Weekly check-in day"
      className="mt-4 rounded-lg border border-border bg-surface2 p-4"
    >
      <label
        htmlFor="checkin-day"
        className="block font-body text-base font-bold"
      >
        Weekly check-in day
      </label>
      <select
        id="checkin-day"
        value={targets.data.weeklyCheckInDay}
        disabled={save.isPending}
        onChange={(e) => save.mutate(Number(e.target.value))}
        className={`${inputClass} mt-2 sm:w-60`}
      >
        {WEEKDAYS.map((d, i) => (
          <option key={d} value={i}>
            {d}
          </option>
        ))}
      </select>
      {save.isSuccess && (
        <p role="status" className="mt-1 text-sm text-accent2">
          Saved.
        </p>
      )}
      {save.isError && (
        <p role="alert" className="mt-1 text-sm font-semibold text-amber-text">
          {plainErrorMessage(save.error)}
        </p>
      )}
    </section>
  );
}

function BackLink() {
  return (
    <a
      href="/client"
      onClick={linkTo("/client")}
      className="text-sm font-semibold text-accent2 underline underline-offset-4"
    >
      ← Today
    </a>
  );
}
