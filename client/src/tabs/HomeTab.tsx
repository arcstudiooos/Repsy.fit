import { useQuery } from "@tanstack/react-query";
import { getTodayTasks, queryKeys } from "../api";
import { ErrorState, LoadingState } from "../components/States";
import type { TodayTask } from "../types";
import { localToday } from "./AiCoachTab";

export type TaskTarget = "planner" | "ai";

type Props = {
  /** Selects that client and switches to the tab where the task is handled. */
  onOpenTask: (clientId: string, target: TaskTarget) => void;
};

// Home tab (Prompt 48): the Today's Tasks card. Every row comes from the server's real records
// (GET /api/tasks/today): plans due today, and clients with no plan in 7+ days.
export function HomeTab({ onOpenTask }: Props) {
  const date = localToday();
  const query = useQuery({ queryKey: queryKeys.todayTasks(date), queryFn: () => getTodayTasks(date) });

  let body;
  if (query.isPending || (query.isError && query.isFetching)) {
    body = <LoadingState />;
  } else if (query.isError) {
    body = <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  } else if (query.data.tasks.length === 0) {
    body = <p className="text-dim">Nothing due today. Pick a client to plan ahead.</p>;
  } else {
    body = (
      <ul aria-label="Today's tasks" className="divide-y divide-border">
        {query.data.tasks.map((task) => (
          <TaskRow key={taskKey(task)} task={task} onOpen={onOpenTask} />
        ))}
      </ul>
    );
  }

  return (
    <>
      <h2 className="text-2xl">Home</h2>
      <section aria-label="Today's Tasks" className="card mt-4 p-5">
        <h3 className="text-base">Today's Tasks</h3>
        <div className="mt-3">{body}</div>
      </section>
    </>
  );
}

const taskKey = (task: TodayTask) => (task.kind === "due" ? `due:${task.assignmentId}` : `idle:${task.clientId}`);

function TaskRow({ task, onOpen }: { task: TodayTask; onOpen: Props["onOpenTask"] }) {
  const target: TaskTarget = task.kind === "due" ? "planner" : "ai";
  const label = target === "planner" ? "Open in Manual Planner" : "Plan with AI Coach";
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="font-semibold text-text">{task.clientName}</p>
        <p className="text-sm text-dim">{task.text}</p>
      </div>
      <button
        type="button"
        aria-label={`${label}: ${task.clientName}`}
        onClick={() => onOpen(task.clientId, target)}
        className="btn-primary shrink-0 rounded-lg px-4 py-2 text-sm"
      >
        {label}
      </button>
    </li>
  );
}
