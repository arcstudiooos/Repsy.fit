import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteProgressLog, queryKeys } from "../api";
import { plainErrorMessage } from "./States";
import type { ProgressLog } from "../types";

type Props = { clientId: string; logs: ProgressLog[] };

const show = (value: string | number | null, suffix = "") => (value === null ? "-" : `${value}${suffix}`);

/** The client's check-ins, newest first, each with a Delete button. logs: oldest first. */
export function CheckInList({ clientId, logs }: Props) {
  const queryClient = useQueryClient();
  const remove = useMutation({
    mutationFn: (logId: string) => deleteProgressLog(clientId, logId),
    // Logs feed the list, the stat cards and the charts - one refresh updates all of them.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.progress(clientId) }),
  });

  if (logs.length === 0) return null;
  const newestFirst = [...logs].reverse();

  return (
    <section className="mt-6">
      <h3 className="text-lg">Check-ins</h3>
      {remove.isError && (
        <p role="alert" className="mt-2 text-sm font-semibold text-accent">
          Couldn't delete: {plainErrorMessage(remove.error)}
        </p>
      )}
      <ol aria-label="Check-ins" className="mt-2 flex flex-col gap-2">
        {newestFirst.map((log) => (
          <li key={log.id} className="card flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm">
            <span className="font-semibold text-text">{log.date}</span>
            <span className="text-text">{show(log.weightKg, " kg")}</span>
            <span className="text-text">{show(log.adherence, "%")}</span>
            <span className="text-text">{log.workoutsDone === null ? "-" : `${log.workoutsDone} workouts`}</span>
            {log.note && <span className="min-w-0 flex-1 break-words text-dim">{log.note}</span>}
            <button
              type="button"
              aria-label={`Delete check-in ${log.date}`}
              disabled={remove.isPending}
              onClick={() => remove.mutate(log.id)}
              className="ml-auto rounded px-1 text-sm text-dim underline-offset-2 hover:text-text hover:underline disabled:opacity-60"
            >
              {remove.isPending && remove.variables === log.id ? "Deleting..." : "Delete"}
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}
