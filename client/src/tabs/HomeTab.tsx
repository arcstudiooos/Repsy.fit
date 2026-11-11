import { useQuery } from "@tanstack/react-query";
import { getRecentCheckIns, getTodayTasks, queryKeys } from "../api";
import { ErrorState, LoadingState } from "../components/States";
import type { RecentCheckIn, TodayTask } from "../types";
import { localToday } from "./AiCoachTab";

export type TaskTarget = "planner" | "ai";

type Props = {
  /** Selects that client and switches to the tab where the task is handled. */
  onOpenTask: (clientId: string, target: TaskTarget) => void;
  /** Selects that client and opens the Progress tab. */
  onOpenCheckIn: (clientId: string) => void;
};

// Home tab (Prompt 48): the Today's Tasks card. Every row comes from the server's real records
// (GET /api/tasks/today): plans due today, and clients with no plan in 7+ days.
export function HomeTab({ onOpenTask, onOpenCheckIn }: Props) {
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
      <NewCheckIns onOpenCheckIn={onOpenCheckIn} />
    </>
  );
}

/** "5 hours ago" style label; the card only shows the last 48 hours. */
export function timeAgo(iso: string, now = Date.now()): string {
  const minutes = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} ${minutes === 1 ? "minute" : "minutes"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? "day" : "days"} ago`;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** What was logged, in the order weight, adherence, workouts, note. */
function loggedSummary(c: RecentCheckIn): string {
  const parts: string[] = [];
  if (c.weightKg !== null) parts.push(`${c.weightKg} kg`);
  if (c.adherence !== null) parts.push(`${c.adherence}% adherence`);
  if (c.workoutsDone !== null) parts.push(plural(c.workoutsDone, "workout"));
  if (c.note.trim()) parts.push(c.note.trim());
  return parts.join(" · ") || "Check-in logged";
}

// New check-ins card (Prompt 49): read-only list from GET /api/checkins/recent.
function NewCheckIns({ onOpenCheckIn }: { onOpenCheckIn: Props["onOpenCheckIn"] }) {
  const query = useQuery({ queryKey: queryKeys.recentCheckIns, queryFn: getRecentCheckIns });

  let body;
  if (query.isPending || (query.isError && query.isFetching)) {
    body = <LoadingState />;
  } else if (query.isError) {
    body = <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  } else if (query.data.items.length === 0) {
    body = <p className="text-dim">No new check-ins in the last 2 days</p>;
  } else {
    body = (
      <ul aria-label="New check-ins" className="divide-y divide-border">
        {query.data.items.map((item) => (
          <li key={`${item.kind}:${item.id}`}>
            <button
              type="button"
              aria-label={`Open progress: ${item.clientName}`}
              onClick={() => onOpenCheckIn(item.clientId)}
              className="flex w-full flex-wrap items-center justify-between gap-3 py-3 text-left"
            >
              <span className="min-w-0">
                <span className="block font-semibold text-text">{item.clientName}</span>
                <span className="block text-sm text-dim">{loggedSummary(item)}</span>
              </span>
              <span className="shrink-0 font-mono text-xs text-dim">{timeAgo(item.createdAt)}</span>
            </button>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <section aria-label="New check-ins" className="card mt-4 p-5">
      <h3 className="text-base">New check-ins</h3>
      <div className="mt-3">{body}</div>
    </section>
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
