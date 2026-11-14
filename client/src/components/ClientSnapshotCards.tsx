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
    <li className="rounded-card border border-border bg-surface2 px-3 py-2">
      <p className="text-xs font-semibold text-dim">{label}</p>
      <p className="font-heading text-2xl text-text">{value}</p>
      {hint && <p className="text-xs text-dim">{hint}</p>}
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

  return (
    <ul aria-label="Client snapshot" className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      <Card
        label="Latest weight"
        value={showWeight(s.latestWeightKg, units)}
        hint={s.latestWeightOn ? shortDay(s.latestWeightOn) : "not logged yet"}
      />
      <Card
        label="Adherence"
        value={s.adherencePercent === null ? "-" : `${s.adherencePercent}%`}
        hint={s.adherencePercent === null ? "no logs yet" : `last ${s.adherenceDays} days`}
      />
      <Card label="Last workout" value={s.lastWorkoutOn ? shortDay(s.lastWorkoutOn) : "-"} hint={agoLabel(s.lastWorkoutOn, today)} />
      <Card
        label="Streak"
        value={s.currentStreak === 0 ? "-" : `${s.currentStreak} ${s.currentStreak === 1 ? "day" : "days"}`}
        hint={s.longestStreak > 0 ? `best ${s.longestStreak}` : "no streak yet"}
      />
      <Card
        label="Workouts done"
        value={String(s.totalWorkoutsDone)}
        hint={s.totalWorkoutsDone === 0 ? "none finished yet" : "all time"}
      />
    </ul>
  );
}
