import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { getHabitWeek, listAssignments, listProgress, queryKeys } from "../api";
import { localToday } from "./AiCoachTab";
import { ErrorState, LoadingState } from "../components/States";
import { CheckInForm } from "../components/CheckInForm";
import { CheckInList } from "../components/CheckInList";
import { ProgressCharts } from "../components/ProgressCharts";
import { formatWeightChange, progressStats } from "../lib/progressStats";
import type { Client } from "../types";

type Props = {
  client: Client | null;
  /** Prompt 61: opens the Library's macro calculator pre-filled with this client. */
  onOpenMacroCalculator?: (clientId: string) => void;
};

// Progress tab: the selected client's stat cards from ALL their progress logs
// (GET /api/clients/:clientId/progress, oldest first) and assignments.
export function ProgressTab({ client, onOpenMacroCalculator }: Props) {
  const progressQuery = useQuery({
    queryKey: queryKeys.progress(client?.id ?? "none"),
    queryFn: () => listProgress(client!.id),
    enabled: !!client,
  });
  const assignmentsQuery = useQuery({
    queryKey: queryKeys.assignments(client?.id ?? "none"),
    queryFn: () => listAssignments(client!.id),
    enabled: !!client,
  });

  // Habits feed Plan completion (Prompt 54). They only refine that one number, so a failed habit
  // load must not break the tab: it falls back to assignments alone.
  const habitsQuery = useQuery({
    queryKey: queryKeys.habits(client?.id ?? "none"),
    queryFn: () => getHabitWeek(client!.id, localToday()),
    enabled: !!client,
    retry: false,
  });

  const failed = progressQuery.isError ? progressQuery : assignmentsQuery.isError ? assignmentsQuery : null;
  const loading =
    progressQuery.isPending ||
    assignmentsQuery.isPending ||
    (progressQuery.isError && progressQuery.isFetching) ||
    (assignmentsQuery.isError && assignmentsQuery.isFetching);

  let body: ReactNode = null;
  if (!client) {
    body = null;
  } else if (loading) {
    body = <LoadingState />;
  } else if (failed) {
    body = (
      <ErrorState
        error={failed.error}
        onRetry={() => {
          void progressQuery.refetch();
          void assignmentsQuery.refetch();
        }}
      />
    );
  } else {
    const logs = progressQuery.data ?? [];
    const stats = progressStats(logs, assignmentsQuery.data ?? [], habitsQuery.data?.habits ?? []);
    body = (
      <>
        {logs.length === 0 && (
          <div className="card mt-4 p-6 text-center text-dim">
            No progress logged yet. Add the first weekly check-in below.
          </div>
        )}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            label="Current weight"
            value={stats.currentWeight === null ? null : `${stats.currentWeight} kg`}
            detail={stats.weightChange === null ? null : formatWeightChange(stats.weightChange)}
          />
          <StatCard
            label="Average adherence"
            value={stats.averageAdherence === null ? null : `${stats.averageAdherence}%`}
          />
          <StatCard label="Total workouts" value={stats.totalWorkouts === null ? null : String(stats.totalWorkouts)} />
          <StatCard
            label="Plan completion"
            value={stats.planCompletion === null ? null : `${stats.planCompletion}%`}
          />
        </div>
        <ProgressCharts logs={logs} assignments={assignmentsQuery.data ?? []} />
        <CheckInForm clientId={client.id} />
        <CheckInList clientId={client.id} logs={logs} />
      </>
    );
  }

  return (
    <>
      <h2 className="text-2xl">Progress</h2>
      <p className="mt-1 text-sm text-dim">Selected: {client ? client.name : "none"}</p>
      {client && onOpenMacroCalculator && (
        <button
          type="button"
          onClick={() => onOpenMacroCalculator(client.id)}
          className="mt-2 text-sm font-semibold text-accent2 underline underline-offset-2"
        >
          Macro calculator for {client.name}
        </button>
      )}
      {body}
    </>
  );
}

/** Big number in the serif heading font with a small uppercase label under it; "-" when missing. */
function StatCard({ label, value, detail = null }: { label: string; value: string | null; detail?: string | null }) {
  return (
    <div role="group" aria-label={label} className="card flex flex-col p-4">
      <span className="font-heading text-[2.6rem] leading-none tracking-tight text-text">{value ?? "-"}</span>
      <span className="mt-2 text-xs font-semibold uppercase tracking-wide text-dim">{label}</span>
      {detail && <span className="mt-1 text-sm text-text">{detail}</span>}
    </div>
  );
}
