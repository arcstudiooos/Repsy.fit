// The client snapshot cards (Inspo C4/C5, Nov 2026).
//
// A row of big numbers above a client's workspace: the questions a coach asks before reading
// anything. One request, five cards, and honest blanks where there is no data yet - never a
// confident-looking zero standing in for "we don't know".
import { useQuery } from "@tanstack/react-query";
import { getClientSnapshot, queryKeys } from "../api";
import { agoLabel, shortDay, showWeight } from "../lib/snapshotFormat";
import type { ClientSnapshot } from "../types";

function Card({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    // Compact (Nov 2026): these were five boxes with 2xl serif numbers, ~280px of a phone screen
    // mostly to say "-". A snapshot is a glance, so it reads as one dense strip; the hint only
    // appears when there is something to say, instead of reserving a line for "none yet".
    <li className="rounded-lg border border-border-strong bg-surface2 px-3 py-1.5">
      <p className="truncate text-[11px] font-semibold tracking-wide text-dim uppercase">{label}</p>
      <p className="text-base leading-tight tabular-nums text-text">{value}</p>
      {hint && <p className="truncate text-[11px] text-muted">{hint}</p>}
    </li>
  );
}

type Props = {
  clientId: string;
  /** The coach's weight unit, so the headline weight reads the way they think. */
  units?: "kg" | "lb";
  /** The client's own today, for "x days ago" wording. */
  today: string;
};

export function ClientSnapshotCards({ clientId, units = "kg", today }: Props) {
  const query = useQuery({
    queryKey: queryKeys.clientSnapshot(clientId),
    queryFn: () => getClientSnapshot(clientId),
  });

  // A snapshot is a nice-to-have, not the point of the page: while it loads, or if it fails, the
  // workspace below must still be usable. So no spinner and no error state - it simply is not there.
  const s: ClientSnapshot | undefined = query.data;
  if (!s) return null;

  // Nov 2026: `=== null` let `undefined` through, and `${undefined}%` renders to a coach as
  // "undefined%" - a number they would reasonably try to act on. The API always sends every field,
  // so this only bites when a field is RENAMED or a response shape drifts, which is exactly when a
  // silent "undefined%" is most misleading. `== null` catches both; `num()` catches a NaN that
  // survived JSON.
  const num = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const adherence = num(s.adherencePercent);
  const streak = num(s.currentStreak);
  const longest = num(s.longestStreak);
  const done = num(s.totalWorkoutsDone);

  return (
    <ul aria-label="Client snapshot" className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      <Card
        label="Latest weight"
        value={showWeight(s.latestWeightKg, units)}
        hint={s.latestWeightOn ? shortDay(s.latestWeightOn) : "not logged yet"}
      />
      <Card
        label="Adherence"
        value={adherence === null ? "-" : `${adherence}%`}
        hint={adherence === null ? "no logs yet" : `last ${s.adherenceDays} days`}
      />
      <Card label="Last workout" value={s.lastWorkoutOn ? shortDay(s.lastWorkoutOn) : "-"} hint={agoLabel(s.lastWorkoutOn, today)} />
      <Card
        label="Streak"
        value={streak === null || streak === 0 ? "-" : `${streak} ${streak === 1 ? "day" : "days"}`}
        hint={longest !== null && longest > 0 ? `best ${longest}` : "no streak yet"}
      />
      <Card
        label="Workouts done"
        value={done === null ? "-" : String(done)}
        hint={done === 0 ? "none finished yet" : "all time"}
      />
    </ul>
  );
}
