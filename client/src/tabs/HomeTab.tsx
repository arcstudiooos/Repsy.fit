import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, approveReviewItem, dismissReviewItem, generateWeeklySummary, getAlerts, getAtRiskClients, getRecentCheckIns, getReviewQueue, getTodayTasks, getWeeklySummary, queryKeys } from "../api";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { ErrorState, LoadingState } from "../components/States";
import type { RecentCheckIn, ReviewItem, TodayTask } from "../types";
import { timeRangeText } from "../lib/schedule";
import { localToday } from "./AiCoachTab";

export type TaskTarget = "planner" | "ai";

type Props = {
  /** Selects that client and switches to the tab where the task is handled. */
  onOpenTask: (clientId: string, target: TaskTarget) => void;
  /** Selects that client and opens the Progress tab. */
  onOpenCheckIn: (clientId: string) => void;
  /** Prompt 84: selects that client and opens their Messages thread. */
  onOpenThread: (clientId: string) => void;
  /** Prompt 84: opens the Clients tab (where the waiting list is). */
  onOpenClients: () => void;
};

// Home tab (Prompt 48): the Today's Tasks card. Every row comes from the server's real records
// (GET /api/tasks/today): today's appointments first (Prompt 69), then plans due today, then clients
// with no plan in 7+ days.
export function HomeTab({ onOpenTask, onOpenCheckIn, onOpenThread, onOpenClients }: Props) {
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
      <ClientActivity
        onOpenThread={onOpenThread}
        onOpenPlans={(clientId) => onOpenTask(clientId, "planner")}
        onOpenClients={onOpenClients}
      />
      <NewCheckIns onOpenCheckIn={onOpenCheckIn} />
      <NeedsAttention date={date} onOpenClient={onOpenCheckIn} />
      <ReviewQueueCard date={date} />
      <WeeklySummaryCard date={date} />
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

/** What was logged: a progress log, or a daily check-in (Prompt 53). */
function loggedSummary(c: RecentCheckIn): string {
  const parts: string[] = [];
  if (c.kind === "daily") {
    if (c.energy !== null) parts.push(`energy ${c.energy}/5`);
    if (c.mood !== null) parts.push(`mood ${c.mood}/5`);
    if (c.sleepHours !== null) parts.push(`${c.sleepHours} h sleep`);
    if (c.waterLiters !== null) parts.push(`${c.waterLiters} L`);
    if (c.steps !== null) parts.push(`${c.steps} steps`);
    if (c.foodNote.trim()) parts.push(c.foodNote.trim());
    return parts.join(" · ") || "Daily check-in";
  }
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

// Needs attention card (Prompt 50): clients any of the server's 3 rules picked, worst first, each with
// its exact reasons. Rules only, no AI. Clicking a row selects the client and opens Progress.
function NeedsAttention({ date, onOpenClient }: { date: string; onOpenClient: Props["onOpenCheckIn"] }) {
  const query = useQuery({ queryKey: queryKeys.atRisk(date), queryFn: () => getAtRiskClients(date) });

  let body;
  if (query.isPending || (query.isError && query.isFetching)) {
    body = <LoadingState />;
  } else if (query.isError) {
    body = <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  } else if (query.data.clients.length === 0) {
    body = <p className="text-dim">Everyone is on track right now.</p>;
  } else {
    body = (
      <ul aria-label="Needs attention" className="divide-y divide-border">
        {query.data.clients.map((item) => (
          <li key={item.clientId}>
            <button
              type="button"
              aria-label={`Open progress: ${item.clientName}`}
              onClick={() => onOpenClient(item.clientId)}
              className="block w-full py-3 text-left"
            >
              <span className="block font-semibold text-text">{item.clientName}</span>
              {item.reasons.map((reason) => (
                <span key={reason.rule} className="block text-sm text-dim">
                  {reason.text}
                </span>
              ))}
            </button>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <section aria-label="Needs attention" className="card mt-4 p-5">
      <h3 className="text-base">Needs attention</h3>
      <div className="mt-3">{body}</div>
    </section>
  );
}

const taskKey = (task: TodayTask) =>
  task.kind === "appointment" ? `appointment:${task.appointmentId}` : task.kind === "due" ? `due:${task.assignmentId}` : `idle:${task.clientId}`;

function TaskRow({ task, onOpen }: { task: TodayTask; onOpen: Props["onOpenTask"] }) {
  if (task.kind === "appointment") {
    // Prompt 69: times arrive as UTC instants and are shown in this browser's timezone.
    return (
      <li className="flex flex-wrap items-center justify-between gap-3 py-3">
        <div className="min-w-0">
          <p className="font-semibold text-text">{task.clientName}</p>
          <p className="text-sm text-dim">{task.text}</p>
        </div>
        <p className="shrink-0 font-mono text-sm text-text">{timeRangeText(task.startsAt, task.endsAt)}</p>
      </li>
    );
  }
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

// AI weekly summary card (Prompt 51). The coach presses the button; nothing runs on a schedule.
// The saved summary survives a refresh, and replacing it needs a confirm. When the AI is
// unavailable the server saves the plain fact list instead, so this card never shows an error page.
function WeeklySummaryCard({ date }: { date: string }) {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [failed, setFailed] = useState(false);
  const query = useQuery({ queryKey: queryKeys.weeklySummary(date), queryFn: () => getWeeklySummary(date) });

  const generate = useMutation({
    mutationFn: (replace: boolean) => generateWeeklySummary(date, replace),
    onSuccess: (data) => {
      setFailed(false);
      setConfirming(false);
      queryClient.setQueryData(queryKeys.weeklySummary(date), data);
    },
    onError: (error) => {
      // 409 = one already exists: ask before replacing it.
      if (error instanceof ApiError && error.status === 409) setConfirming(true);
      else setFailed(true);
    },
  });

  const summary = query.data?.summary ?? null;
  const busy = generate.isPending;

  let body;
  if (query.isPending || (query.isError && query.isFetching)) {
    body = <LoadingState />;
  } else if (query.isError) {
    body = <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  } else if (!summary) {
    body = <p className="text-dim">No summary yet for this week. Generate one from your own records.</p>;
  } else {
    body = (
      <>
        {summary.source === "facts" && (
          <p className="mb-2 text-sm font-semibold text-amber-text">
            The AI was unavailable, so here are this week's facts.
          </p>
        )}
        <p className="whitespace-pre-line text-text">{summary.text}</p>
        <p className="mt-3 font-mono text-xs text-dim">
          Week of {summary.weekStart} · saved {new Date(summary.createdAt).toLocaleString()}
        </p>
      </>
    );
  }

  return (
    <section aria-label="AI weekly summary" className="card mt-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-base">AI weekly summary</h3>
        <button
          type="button"
          onClick={() => generate.mutate(false)}
          disabled={busy}
          className="btn-primary rounded-lg px-4 py-2 text-sm disabled:opacity-60"
        >
          {busy ? "Generating..." : "Generate this week's summary"}
        </button>
      </div>
      {failed && (
        <p role="alert" className="mt-3 text-sm font-semibold text-amber-text">
          We couldn't generate the summary just now. Please try again in a moment.
        </p>
      )}
      <div className="mt-3">{body}</div>
      {confirming && (
        <ConfirmDialog
          title="Replace this week's summary?"
          confirmLabel="Replace summary"
          pendingLabel="Replacing..."
          pending={busy}
          onConfirm={() => generate.mutate(true)}
          onCancel={() => setConfirming(false)}
        >
          <p>This week's summary is already saved. Generating again replaces it.</p>
        </ConfirmDialog>
      )}
    </section>
  );
}

/** Count of items waiting for the coach; the Home tab badge uses the same query. */
export function useReviewQueueCount() {
  const query = useQuery({ queryKey: queryKeys.reviewQueue("pending"), queryFn: () => getReviewQueue("pending") });
  return query.data?.pendingCount ?? 0;
}

// Review queue card (Prompt 52): AI suggestions the coach parked and new check-ins to look at.
// Approve or Dismiss decides one item; nothing is ever decided automatically, and dismissed
// items stay in the client's history (the "Decided" view below).
function ReviewQueueCard({ date }: { date: string }) {
  const queryClient = useQueryClient();
  const [showDecided, setShowDecided] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const pending = useQuery({ queryKey: queryKeys.reviewQueue("pending"), queryFn: () => getReviewQueue("pending") });
  const decided = useQuery({
    queryKey: queryKeys.reviewQueue("decided"),
    queryFn: () => getReviewQueue("decided"),
    enabled: showDecided,
  });

  const refresh = async (clientId: string) => {
    setFailed(null);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.reviewQueue("pending") }),
      queryClient.invalidateQueries({ queryKey: queryKeys.reviewQueue("decided") }),
      queryClient.invalidateQueries({ queryKey: queryKeys.assignments(clientId) }),
    ]);
  };
  const decide = useMutation({
    mutationFn: ({ item, approve }: { item: ReviewItem; approve: boolean }) =>
      approve ? approveReviewItem(item.id, date) : dismissReviewItem(item.id),
    onSuccess: (_data, { item }) => void refresh(item.clientId),
    onError: () => setFailed("We couldn't save that decision just now. Please try again."),
  });

  let body;
  if (pending.isPending || (pending.isError && pending.isFetching)) {
    body = <LoadingState />;
  } else if (pending.isError) {
    body = <ErrorState error={pending.error} onRetry={() => void pending.refetch()} />;
  } else if (pending.data.items.length === 0) {
    body = <p className="text-dim">Queue clear. Nothing waiting for you.</p>;
  } else {
    body = (
      <ul aria-label="Review queue" className="divide-y divide-border">
        {pending.data.items.map((item) => (
          <li key={item.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="font-semibold text-text">
                {item.clientName}
                <span className="ml-2 font-mono text-xs font-normal uppercase tracking-wide text-dim">
                  {item.kind === "suggestion" ? item.type ?? "Suggestion" : "Check-in"}
                </span>
              </p>
              <p className="text-sm text-text">{item.title}</p>
              {item.summary && <p className="text-sm text-dim">{item.summary}</p>}
              <p className="font-mono text-xs text-dim">{new Date(item.createdAt).toLocaleDateString()}</p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                aria-label={`Approve: ${item.clientName} ${item.title}`}
                disabled={decide.isPending}
                onClick={() => decide.mutate({ item, approve: true })}
                className="btn-primary rounded-lg px-3 py-2 text-sm disabled:opacity-60"
              >
                Approve
              </button>
              <button
                type="button"
                aria-label={`Dismiss: ${item.clientName} ${item.title}`}
                disabled={decide.isPending}
                onClick={() => decide.mutate({ item, approve: false })}
                className="rounded-lg border border-border px-3 py-2 text-sm font-semibold text-text disabled:opacity-60"
              >
                Dismiss
              </button>
            </div>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <section aria-label="Review queue" className="card mt-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-base">
          Review queue
          {(pending.data?.pendingCount ?? 0) > 0 && (
            <span className="ml-2 rounded-full bg-accent px-2 py-0.5 text-xs font-bold text-on-accent">
              {pending.data?.pendingCount}
            </span>
          )}
        </h3>
        <button
          type="button"
          onClick={() => setShowDecided((v) => !v)}
          className="text-sm font-semibold text-text underline decoration-2 underline-offset-4"
        >
          {showDecided ? "Hide decided" : "Show decided"}
        </button>
      </div>
      {failed && (
        <p role="alert" className="mt-3 text-sm font-semibold text-amber-text">
          {failed}
        </p>
      )}
      <div className="mt-3">{body}</div>
      {showDecided && (
        <div className="mt-4 border-t border-border pt-3">
          <h4 className="text-sm font-bold text-text">Decided (kept in the client's history)</h4>
          {decided.isPending ? (
            <LoadingState />
          ) : decided.isError ? (
            <ErrorState error={decided.error} onRetry={() => void decided.refetch()} />
          ) : decided.data.items.length === 0 ? (
            <p className="mt-2 text-dim">Nothing decided yet.</p>
          ) : (
            <ul aria-label="Decided review items" className="mt-2 divide-y divide-border">
              {decided.data.items.map((item) => (
                <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                  <span className="min-w-0 text-sm">
                    <span className="font-semibold text-text">{item.clientName}</span>{" "}
                    <span className="text-dim">{item.title}</span>
                  </span>
                  <span className={`shrink-0 font-mono text-xs font-bold ${item.status === "Approved" ? "text-accent2" : "text-dim"}`}>
                    {item.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * Client activity (Prompt 84): people waiting for approval, who joined with the code (7 days), plans a
 * client finished (24 hours, with effort and note) and unread client messages - each row opens the place
 * to act. Polled every minute while Home is open; no email or push.
 */
function ClientActivity({
  onOpenThread,
  onOpenPlans,
  onOpenClients,
}: {
  onOpenThread: (clientId: string) => void;
  onOpenPlans: (clientId: string) => void;
  onOpenClients: () => void;
}) {
  const query = useQuery({ queryKey: queryKeys.alerts, queryFn: getAlerts, refetchInterval: 60_000, refetchIntervalInBackground: false });
  if (query.isPending) return null;
  if (query.isError) {
    return (
      <section aria-label="Client activity" className="card mt-4 p-5">
        <h3 className="text-base">Client activity</h3>
        <p role="alert" className="mt-2 text-sm font-semibold text-amber-text">
          Couldn't load client activity.{" "}
          <button type="button" onClick={() => void query.refetch()} className="min-h-11 px-1 text-accent2 underline underline-offset-4">
            Try again
          </button>
        </p>
      </section>
    );
  }
  const a = query.data;
  if (!a || !Array.isArray(a.joined) || !Array.isArray(a.finished) || !Array.isArray(a.unread)) return null;
  const empty = a.waiting === 0 && a.joined.length === 0 && a.finished.length === 0 && a.unread.length === 0;
  if (empty) return null;
  const rowButton = "w-full rounded-lg px-2 py-2 text-left text-sm hover:bg-surface2 min-h-11";
  return (
    <section aria-label="Client activity" className="card mt-4 p-5">
      <h3 className="text-base">Client activity</h3>
      <ul aria-label="Client alerts" className="mt-2 divide-y divide-border">
        {a.waiting > 0 && (
          <li>
            <button type="button" onClick={onOpenClients} className={rowButton}>
              <span className="font-semibold text-accent">{plural(a.waiting, "client")} waiting for approval</span>
              <span className="text-dim"> - approve or decline in Clients</span>
            </button>
          </li>
        )}
        {a.unread.map((u) => (
          <li key={`m:${u.clientId}`}>
            <button type="button" onClick={() => onOpenThread(u.clientId)} className={rowButton}>
              <span className="font-semibold text-text">{u.name}</span>
              <span className="text-dim"> sent {plural(u.count, "new message")}</span>
            </button>
          </li>
        ))}
        {a.finished.map((f) => (
          <li key={`f:${f.assignmentId}`}>
            <button type="button" onClick={() => onOpenPlans(f.clientId)} className={rowButton}>
              <span className="font-semibold text-text">{f.clientName}</span>
              <span className="text-text"> finished {f.title}</span>
              {f.effort !== null && <span className="text-dim"> · effort {f.effort}/10</span>}
              <span className="text-dim"> · {timeAgo(f.at)}</span>
              {f.note && <span className="block break-words text-xs text-dim">"{f.note}"</span>}
            </button>
          </li>
        ))}
        {a.joined.map((j) => (
          <li key={`j:${j.clientId}`}>
            <button type="button" onClick={() => onOpenPlans(j.clientId)} className={rowButton}>
              <span className="font-semibold text-text">{j.name}</span>
              <span className="text-text"> joined</span>
              <span className="text-dim"> with your code · {timeAgo(j.at)}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
