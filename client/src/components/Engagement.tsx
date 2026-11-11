// Engagement leaderboard (Prompt 71): a view of the Business tab, coach-only. The ranking is shown
// with the three numbers behind it, so it can always be explained. No points, no prizes, no sharing.
import { useQuery } from "@tanstack/react-query";
import { getEngagement, queryKeys } from "../api";
import { localToday } from "../tabs/AiCoachTab";
import { ErrorState, LoadingState } from "./States";
import type { EngagementRow } from "../types";

const days = (n: number) => (n === 1 ? "1 day" : `${n} days`);

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-dim">{label}</dt>
      <dd className="font-mono text-sm text-text">{value}</dd>
    </div>
  );
}

function Row({ row }: { row: EngagementRow }) {
  return (
    <li className="card flex flex-wrap items-center gap-x-5 gap-y-2 p-4">
      <span aria-label={row.rank === null ? "Not ranked" : `Rank ${row.rank}`} className="w-10 shrink-0 font-heading text-3xl text-text">
        {row.rank === null ? "-" : row.rank}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-text">{row.clientName}</p>
        {!row.enoughData && <p className="text-sm text-dim">Not enough data yet</p>}
      </div>
      {row.enoughData && (
        <dl className="flex flex-wrap gap-x-6 gap-y-1">
          <Stat label="Check-in streak" value={days(row.checkInStreak)} />
          <Stat label="Habits, last 7 days" value={row.habitPercent === null ? "No habits" : `${row.habitPercent}%`} />
          <Stat label="Workouts this week" value={String(row.workoutsThisWeek)} />
        </dl>
      )}
    </li>
  );
}

export function Engagement() {
  const date = localToday();
  const query = useQuery({ queryKey: queryKeys.engagement(date), queryFn: () => getEngagement(date) });
  return (
    <section aria-label="Engagement" className="mt-4">
      <p className="text-sm text-dim">
        Clients are ranked by their check-in streak, then by habit completion over the last 7 days. Workouts done this
        week are shown but do not change the order. Only you see this; clients see just their own numbers.
      </p>
      {query.isPending || (query.isError && query.isFetching) ? (
        <div className="mt-4">
          <LoadingState />
        </div>
      ) : query.isError ? (
        <div className="mt-4">
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        </div>
      ) : query.data.clients.length === 0 ? (
        <div className="card mt-4 p-6 text-center text-dim">Add a client to see engagement.</div>
      ) : (
        <ol aria-label="Engagement leaderboard" className="mt-4 space-y-3">
          {query.data.clients.map((row) => (
            <Row key={row.clientId} row={row} />
          ))}
        </ol>
      )}
    </section>
  );
}
