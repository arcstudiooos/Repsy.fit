import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ApiError,
  approveReviewItem,
  dismissReviewItem,
  generateWeeklySummary,
  getAlerts,
  getRecentCheckIns,
  getAtRiskClients,
  getReviewQueue,
  getTodayTasks,
  getWeeklySummary,
  listClients,
  queryKeys,
} from "../api";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Modal } from "../components/Modal";
import { NewPlanDialog } from "../components/NewPlanDialog";
import { ErrorState, LoadingState } from "../components/States";
import type { Client, RecentCheckIn, ReviewItem, TodayTask, WeeklyFacts } from "../types";
import { TYPE_CHIP } from "../lib/typeChip";
import { timeRangeText } from "../lib/schedule";
import { formatDay } from "../lib/dates";
import { localToday } from "./AiCoachTab";

export type TaskTarget = "planner" | "ai";

type Props = {
  /** Selects that client and switches to the tab where the task is handled. */
  onOpenTask: (clientId: string, target: TaskTarget) => void;
  /** Selects that client and opens their Messages thread. */
  onOpenThread: (clientId: string) => void;
  /** Selects that client and opens their workspace on Progress or Check-ins. */
  onOpenClient: (clientId: string, sub: "progress" | "checkins") => void;
  /** Opens the Clients tab (the directory / where the waiting list is). */
  onOpenClients: () => void;
  /** Opens the Calendar tab (the "task planner" for scheduling client work). */
  onOpenCalendar: () => void;
};

// Home dashboard (Nov 2026 redesign to the coach-command-centre spec). A coach opens Repsy and in
// one glance sees: who needs attention, what is pending, and what to do next. Every number here comes
// from the SAME source the rest of the app uses - the "At risk" count is the live at-risk endpoint,
// which the weekly report now agrees with, so the dashboard and the AI report never contradict.
export function HomeTab({ onOpenTask, onOpenThread, onOpenClient, onOpenClients, onOpenCalendar }: Props) {
  const date = localToday();
  const actionCentreRef = useRef<HTMLDivElement>(null);
  const [planFor, setPlanFor] = useState<{ id: string; name: string } | null>(null);

  const clientsQ = useQuery({ queryKey: queryKeys.clients, queryFn: listClients });
  const atRiskQ = useQuery({ queryKey: queryKeys.atRisk(date), queryFn: () => getAtRiskClients(date) });
  const reviewQ = useQuery({ queryKey: queryKeys.reviewQueue("pending"), queryFn: () => getReviewQueue("pending") });

  const clients = clientsQ.data ?? null;
  const atRiskIds = new Set((atRiskQ.data?.clients ?? []).map((c) => c.clientId));

  return (
    <>
      {planFor && <NewPlanDialog client={planFor} onClose={() => setPlanFor(null)} />}

      <header>
        <h1 className="text-[1.9rem] font-bold leading-tight tracking-tight text-text">{greeting()}, Coach.</h1>
        <p className="mt-1 text-dim">Here's what needs your attention today.</p>
      </header>

      {/* Three KPIs. The whole card is one button with a hover state and a chevron, so it is obvious
          they go somewhere - the old rail was five flat numbers nobody knew were clickable. */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard label="Total clients" value={clients?.length ?? null} icon={<IconPeople />} onClick={onOpenClients} goTo="the client directory" />
        <KpiCard
          label="At risk"
          value={atRiskQ.data?.clients.length ?? null}
          icon={<IconPulse />}
          tone="warn"
          onClick={onOpenClients}
          goTo="clients that need attention"
        />
        <KpiCard
          label="Pending reviews"
          value={reviewQ.data?.pendingCount ?? null}
          icon={<IconDoc />}
          tone="warn"
          onClick={() => actionCentreRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
          goTo="the action centre"
        />
      </div>

      <div className="mt-4 grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <ActionCentre date={date} containerRef={actionCentreRef} />
        <ClientHealth clients={clients} atRiskIds={atRiskIds} loading={clientsQ.isPending} onOpenClients={onOpenClients} />
      </div>

      <div className="mt-4 grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <TodaysTasks date={date} onOpenTask={onOpenTask} onNewPlan={(id, name) => setPlanFor({ id, name })} onOpenCalendar={onOpenCalendar} />
        <RecentActivity onOpenThread={onOpenThread} onOpenPlans={(id) => onOpenTask(id, "planner")} onOpenClient={onOpenClient} onOpenClients={onOpenClients} />
      </div>

      <WeeklyReport date={date} totalClients={clients?.length ?? null} />
    </>
  );
}

/** Morning / afternoon / evening from the coach's own clock. */
function greeting(now = new Date()): string {
  const h = now.getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

// ---------- KPI card ----------

function KpiCard({
  label,
  value,
  icon,
  tone = "neutral",
  onClick,
  goTo,
}: {
  label: string;
  value: number | null;
  icon: React.ReactNode;
  tone?: "neutral" | "warn";
  onClick: () => void;
  goTo: string;
}) {
  // A zero is quiet; a warn metric above zero takes the accent so the eye lands on it.
  const valueClass = value === null ? "text-dim" : tone === "warn" && value > 0 ? "text-accent-text" : "text-text";
  const iconClass = tone === "warn" && (value ?? 0) > 0 ? "text-accent-text" : "text-dim";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${label}: ${value ?? "unknown"}. Open ${goTo}.`}
      className="group flex items-center gap-4 rounded-card border border-border bg-surface p-4 text-left transition-colors hover:border-dim hover:bg-surface2"
    >
      <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-surface2 ${iconClass}`}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-dim">{label}</span>
        <span className={`block text-3xl font-bold leading-none tabular-nums ${valueClass}`}>{value ?? "–"}</span>
      </span>
      <span aria-hidden="true" className="shrink-0 text-xl text-dim transition-transform group-hover:translate-x-0.5">
        ›
      </span>
    </button>
  );
}

// ---------- Action centre (the review queue, with inspect-before-approve) ----------

function ActionCentre({ date, containerRef }: { date: string; containerRef: React.RefObject<HTMLDivElement | null> }) {
  const queryClient = useQueryClient();
  const [reviewing, setReviewing] = useState<ReviewItem | null>(null); // the drawer
  const [showHistory, setShowHistory] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // Undo: a dismiss is held for a few seconds before it is sent, so a mis-click is recoverable
  // without needing a server-side "un-dismiss". The item is hidden meanwhile.
  const [pendingDismiss, setPendingDismiss] = useState<ReviewItem | null>(null);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pending = useQuery({ queryKey: queryKeys.reviewQueue("pending"), queryFn: () => getReviewQueue("pending") });
  const decided = useQuery({
    queryKey: queryKeys.reviewQueue("decided"),
    queryFn: () => getReviewQueue("decided"),
    enabled: showHistory,
  });

  const refresh = (clientId: string) =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.reviewQueue("pending") }),
      queryClient.invalidateQueries({ queryKey: queryKeys.reviewQueue("decided") }),
      queryClient.invalidateQueries({ queryKey: queryKeys.assignments(clientId) }),
    ]);

  const approve = useMutation({
    mutationFn: (item: ReviewItem) => approveReviewItem(item.id, date),
    onSuccess: (_d, item) => {
      setReviewing(null);
      void refresh(item.clientId);
    },
    onError: () => setProblem("We couldn't approve that just now. Please try again."),
  });
  const dismiss = useMutation({
    mutationFn: (item: ReviewItem) => dismissReviewItem(item.id),
    onSuccess: (_d, item) => void refresh(item.clientId),
    onError: () => setProblem("We couldn't dismiss that just now. Please try again."),
  });

  function startDismiss(item: ReviewItem) {
    setReviewing(null);
    setProblem(null);
    // If another dismiss is already waiting, send it now before starting the new one.
    if (dismissTimer.current) {
      clearTimeout(dismissTimer.current);
      if (pendingDismiss) dismiss.mutate(pendingDismiss);
    }
    setPendingDismiss(item);
    dismissTimer.current = setTimeout(() => {
      dismiss.mutate(item);
      setPendingDismiss(null);
      dismissTimer.current = null;
    }, 5000);
  }
  function undoDismiss() {
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    dismissTimer.current = null;
    setPendingDismiss(null);
  }
  useEffect(() => () => void (dismissTimer.current && clearTimeout(dismissTimer.current)), []);

  const items = (pending.data?.items ?? []).filter((i) => i.id !== pendingDismiss?.id);
  const count = items.length;

  let body: React.ReactNode;
  if (pending.isPending || (pending.isError && pending.isFetching)) {
    body = <LoadingState />;
  } else if (pending.isError) {
    body = <ErrorState error={pending.error} onRetry={() => void pending.refetch()} />;
  } else if (count === 0) {
    body = <p className="empty-state py-6 text-center">Nothing waiting for your review right now.</p>;
  } else {
    body = (
      <ul aria-label="Action centre" className="flex flex-col gap-3">
        {items.map((item) => (
          <li key={item.id} className="rounded-card border border-border bg-surface2 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-text">{item.clientName}</span>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${item.type ? TYPE_CHIP[item.type] : "bg-surface text-dim"}`}>
                {item.kind === "suggestion" ? item.type ?? "Suggestion" : "Check-in"}
              </span>
              <span className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-accent-text">
                <IconClock /> Pending review
              </span>
            </div>
            <p className="mt-1 font-semibold text-text">{item.title}</p>
            {item.summary && <p className="text-sm text-dim">{item.summary}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setProblem(null);
                  setReviewing(item);
                }}
                className="btn btn-primary"
                aria-label={`Review ${item.title} for ${item.clientName}`}
              >
                Review {item.kind === "suggestion" ? "workout" : "check-in"} <span aria-hidden="true">→</span>
              </button>
              <button type="button" onClick={() => startDismiss(item)} className="btn btn-secondary" aria-label={`Dismiss ${item.title}`}>
                Dismiss
              </button>
            </div>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <section ref={containerRef} aria-label="Action centre" className="card dense scroll-mt-4 p-5">
      <div className="flex flex-wrap items-center gap-3">
        <CardHead icon={<IconTarget />} title="Action centre" sub="Items that need your review or action." />
        {count > 0 && <span className="ml-auto rounded-full bg-surface2 px-2.5 py-0.5 text-xs font-bold text-accent-text">{count} pending</span>}
      </div>

      {problem && (
        <p role="alert" className="mt-3 text-sm font-semibold text-amber-text">
          {problem}
        </p>
      )}

      {pendingDismiss && (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-lg bg-surface2 px-3 py-2 text-sm">
          <span className="text-dim">
            Dismissed <span className="font-semibold text-text">{pendingDismiss.title}</span>.
          </span>
          <button type="button" onClick={undoDismiss} className="font-bold text-accent-text underline underline-offset-4">
            Undo
          </button>
        </div>
      )}

      <div className="mt-3">{body}</div>

      <div className="mt-3 border-t border-border pt-3">
        <button
          type="button"
          onClick={() => setShowHistory((v) => !v)}
          aria-expanded={showHistory}
          className="text-sm font-semibold text-text underline decoration-2 underline-offset-4"
        >
          {showHistory ? "Hide review history" : "View review history"}
        </button>
        {showHistory && (
          <div className="mt-3">
            {decided.isPending ? (
              <LoadingState />
            ) : decided.isError ? (
              <ErrorState error={decided.error} onRetry={() => void decided.refetch()} />
            ) : decided.data.items.length === 0 ? (
              <p className="text-sm text-dim">Nothing decided yet.</p>
            ) : (
              <ul aria-label="Review history" className="divide-y divide-border">
                {decided.data.items.map((item) => (
                  <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <span className="min-w-0">
                      <span className="font-semibold text-text">{item.clientName}</span> <span className="text-dim">{item.title}</span>
                    </span>
                    <span className={`shrink-0 font-mono text-xs font-bold ${item.status === "Approved" ? "text-accent2" : "text-dim"}`}>{item.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* The review drawer: the coach inspects the actual plan BEFORE approving - approving must never
          happen on one accidental click from the dashboard. */}
      {reviewing && (
        <Modal
          title={reviewing.title}
          description={`${reviewing.clientName} · ${reviewing.kind === "suggestion" ? reviewing.type ?? "Suggestion" : "Check-in"}`}
          size="lg"
          onRequestClose={() => setReviewing(null)}
          footer={
            <>
              <button type="button" onClick={() => approve.mutate(reviewing)} disabled={approve.isPending} className="btn btn-primary">
                {approve.isPending ? "Sending…" : "Approve & send"}
              </button>
              <button type="button" onClick={() => startDismiss(reviewing)} disabled={approve.isPending} className="btn btn-secondary">
                Dismiss
              </button>
            </>
          }
        >
          {reviewing.reasoning && (
            <p className="mb-3 rounded-lg bg-surface2 px-3 py-2 text-sm text-dim">
              <span className="font-semibold text-text">Why: </span>
              {reviewing.reasoning}
            </p>
          )}
          <pre className="max-h-[50vh] overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-surface2 p-3 font-sans text-sm text-text">
            {reviewing.details || reviewing.summary || "No further detail."}
          </pre>
          {approve.isError && (
            <p role="alert" className="mt-3 text-sm font-semibold text-amber-text">
              We couldn't approve that just now. Please try again.
            </p>
          )}
        </Modal>
      )}
    </section>
  );
}

// ---------- Client health ----------

const INACTIVE_DAYS = 7;

function daysSince(iso: string, today = new Date()): number {
  return Math.floor((today.getTime() - new Date(iso).getTime()) / 86_400_000);
}

/** Splits the roster into on-track / needs-attention / inactive, each client counted once. */
export function clientHealth(clients: Client[], atRiskIds: Set<string>) {
  let inactive = 0;
  let attention = 0;
  for (const c of clients) {
    const idle = !c.lastCheckIn || daysSince(c.lastCheckIn) >= INACTIVE_DAYS;
    if (idle) inactive += 1;
    else if (atRiskIds.has(c.id)) attention += 1;
  }
  const total = clients.length;
  return { total, inactive, attention, onTrack: total - inactive - attention };
}

function ClientHealth({
  clients,
  atRiskIds,
  loading,
  onOpenClients,
}: {
  clients: Client[] | null;
  atRiskIds: Set<string>;
  loading: boolean;
  onOpenClients: () => void;
}) {
  if (loading || clients === null) {
    return (
      <section aria-label="Client health" className="card dense p-5">
        <CardHead icon={<IconChart />} title="Client health" sub="Overall status of your clients." />
        <div className="mt-3">
          <LoadingState />
        </div>
      </section>
    );
  }
  const { total, inactive, attention, onTrack } = clientHealth(clients, atRiskIds);
  const allGood = attention === 0 && inactive === 0;
  const pct = total === 0 ? 0 : Math.round((onTrack / total) * 100);

  return (
    <section aria-label="Client health" className="card dense p-5">
      <div className="flex flex-wrap items-start gap-3">
        <CardHead icon={<IconChart />} title="Client health" sub="Overall status of your clients." />
        <span className={`ml-auto inline-flex items-center gap-1 rounded-full bg-surface2 px-2.5 py-0.5 text-xs font-bold ${allGood ? "text-accent2" : "text-accent-text"}`}>
          {allGood ? (
            <>
              <IconCheck /> All {total} on track
            </>
          ) : (
            `${attention + inactive} off track`
          )}
        </span>
      </div>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-surface2" role="img" aria-label={`${onTrack} of ${total} clients on track`}>
        <div className="h-full rounded-full bg-accent2" style={{ width: `${pct}%` }} />
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-2">
        <HealthStat dot="bg-accent2" value={onTrack} label="On track" alwaysOn />
        <HealthStat dot="bg-amber" value={attention} label="Needs attention" />
        <HealthStat dot="bg-border-strong" value={inactive} label={`Inactive (${INACTIVE_DAYS}+ days)`} />
      </dl>

      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 border-t border-border pt-3 text-sm font-semibold">
        <button type="button" onClick={onOpenClients} className="text-accent-text underline-offset-4 hover:underline">
          View all clients <span aria-hidden="true">→</span>
        </button>
        <button type="button" onClick={onOpenClients} className="text-accent-text underline-offset-4 hover:underline">
          Inactive clients <span aria-hidden="true">→</span>
        </button>
      </div>
    </section>
  );
}

function HealthStat({ dot, value, label, alwaysOn = false }: { dot: string; value: number; label: string; alwaysOn?: boolean }) {
  return (
    <div>
      <dt className="sr-only">{label}</dt>
      <dd>
        <span className="flex items-center gap-1.5 text-2xl font-bold tabular-nums text-text">
          <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${value > 0 || alwaysOn ? dot : "bg-border-strong"}`} />
          {value}
        </span>
        <span className="mt-0.5 block text-xs text-dim">{label}</span>
      </dd>
    </div>
  );
}

// ---------- Today's tasks ----------

function TodaysTasks({
  date,
  onOpenTask,
  onNewPlan,
  onOpenCalendar,
}: {
  date: string;
  onOpenTask: Props["onOpenTask"];
  onNewPlan: (clientId: string, clientName: string) => void;
  onOpenCalendar: () => void;
}) {
  const query = useQuery({ queryKey: queryKeys.todayTasks(date), queryFn: () => getTodayTasks(date) });

  let body: React.ReactNode;
  if (query.isPending || (query.isError && query.isFetching)) {
    body = <LoadingState />;
  } else if (query.isError) {
    body = <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  } else if (query.data.tasks.length === 0) {
    body = (
      <div className="flex flex-col items-center gap-2 py-6 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface2 text-accent-text">
          <IconCalendar />
        </span>
        <p className="font-semibold text-text">You're all caught up.</p>
        <p className="text-sm text-dim">Plan your next client interactions.</p>
        <button type="button" onClick={onOpenCalendar} className="mt-1 text-sm font-bold text-accent-text underline underline-offset-4">
          View task planner <span aria-hidden="true">→</span>
        </button>
      </div>
    );
  } else {
    body = (
      <ul aria-label="Today's tasks" className="divide-y divide-border">
        {query.data.tasks.map((task) => (
          <TaskRow key={taskKey(task)} task={task} onOpen={onOpenTask} onNewPlan={onNewPlan} />
        ))}
      </ul>
    );
  }

  return (
    <section aria-label="Today's tasks" className="card dense p-5">
      <CardHead icon={<IconCheckCircle />} title="Today's tasks" sub="Your scheduled tasks for today." count={query.data?.tasks.length} />
      <div className="mt-3">{body}</div>
    </section>
  );
}

const taskKey = (task: TodayTask) =>
  task.kind === "appointment" ? `appointment:${task.appointmentId}` : task.kind === "due" ? `due:${task.assignmentId}` : `idle:${task.clientId}`;

function TaskRow({ task, onOpen, onNewPlan }: { task: TodayTask; onOpen: Props["onOpenTask"]; onNewPlan: (id: string, name: string) => void }) {
  if (task.kind === "appointment") {
    return (
      <li className="flex flex-wrap items-center justify-between gap-3 py-3">
        <div className="min-w-0">
          <p className="font-semibold text-text">{task.clientName}</p>
          <p className="text-sm text-dim">{task.text}</p>
        </div>
        <p className="shrink-0 whitespace-nowrap tabular-nums text-sm text-text">{timeRangeText(task.startsAt, task.endsAt)}</p>
      </li>
    );
  }
  const target: TaskTarget = task.kind === "due" ? "planner" : "ai";
  const label = target === "planner" ? "Open in Plans" : "Plan with AI Coach";
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="font-semibold text-text">{task.clientName}</p>
        <p className="text-sm text-dim">{task.text}</p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-1">
        {task.kind === "idle" && (
          <button type="button" aria-label={`New plan: ${task.clientName}`} onClick={() => onNewPlan(task.clientId, task.clientName)} className="btn btn-ghost">
            New plan
          </button>
        )}
        <button type="button" aria-label={`${label}: ${task.clientName}`} onClick={() => onOpen(task.clientId, target)} className="btn btn-ghost">
          {task.kind === "idle" ? "AI Coach" : label}
        </button>
      </div>
    </li>
  );
}

// ---------- Recent activity (compact rows) ----------

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** A one-line summary of what a client logged, for the Recent activity row. */
function loggedSummary(c: RecentCheckIn): string {
  const parts: string[] = [];
  if (c.kind === "daily") {
    if (c.energy !== null) parts.push(`energy ${c.energy}/5`);
    if (c.mood !== null) parts.push(`mood ${c.mood}/5`);
    if (c.sleepHours !== null) parts.push(`${c.sleepHours} h sleep`);
    if (c.steps !== null) parts.push(`${c.steps} steps`);
    return parts.length ? `a check-in (${parts.join(", ")})` : "a daily check-in";
  }
  if (c.weightKg !== null) parts.push(`${c.weightKg} kg`);
  if (c.adherence !== null) parts.push(`${c.adherence}% adherence`);
  if (c.workoutsDone !== null) parts.push(plural(c.workoutsDone, "workout"));
  return parts.length ? `progress (${parts.join(", ")})` : "a progress log";
}

/** "5 hours ago" style label. */
export function timeAgo(iso: string, now = Date.now()): string {
  const minutes = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} ${minutes === 1 ? "minute" : "minutes"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? "day" : "days"} ago`;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

function RecentActivity({
  onOpenThread,
  onOpenPlans,
  onOpenClient,
  onOpenClients,
}: {
  onOpenThread: (clientId: string) => void;
  onOpenPlans: (clientId: string) => void;
  onOpenClient: (clientId: string, sub: "progress" | "checkins") => void;
  onOpenClients: () => void;
}) {
  const query = useQuery({ queryKey: queryKeys.alerts, queryFn: getAlerts, refetchInterval: 60_000, refetchIntervalInBackground: false });
  const checkIns = useQuery({ queryKey: queryKeys.recentCheckIns, queryFn: getRecentCheckIns });

  let body: React.ReactNode;
  if (query.isPending) {
    body = <LoadingState />;
  } else if (query.isError) {
    body = <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  } else {
    const a = query.data;
    const rows: { key: string; name: string; what: React.ReactNode; action: () => void; actionLabel: string }[] = [];
    if (a.waiting > 0) rows.push({ key: "waiting", name: `${plural(a.waiting, "client")}`, what: <span className="text-dim">waiting for approval</span>, action: onOpenClients, actionLabel: "Review" });
    for (const u of a.unread)
      rows.push({ key: `m:${u.clientId}`, name: u.name, what: <span className="text-dim">sent {plural(u.count, "new message")}</span>, action: () => onOpenThread(u.clientId), actionLabel: "Open chat" });
    for (const f of a.finished)
      rows.push({
        key: `f:${f.assignmentId}`,
        name: f.clientName,
        what: (
          <span className="text-dim">
            finished {f.title}
            {f.effort !== null && <> · effort {f.effort}/10</>} · {timeAgo(f.at)}
          </span>
        ),
        action: () => onOpenPlans(f.clientId),
        actionLabel: "View plan",
      });
    for (const j of a.joined)
      rows.push({ key: `j:${j.clientId}`, name: j.name, what: <span className="text-dim">joined with your code · {timeAgo(j.at)}</span>, action: () => onOpenPlans(j.clientId), actionLabel: "View profile" });
    for (const c of checkIns.data?.items ?? [])
      rows.push({
        key: `ci:${c.id}`,
        name: c.clientName,
        what: <span className="text-dim">logged {loggedSummary(c)} · {timeAgo(c.createdAt)}</span>,
        action: () => onOpenClient(c.clientId, c.kind === "daily" ? "checkins" : "progress"),
        actionLabel: "View check-in",
      });

    body =
      rows.length === 0 ? (
        <p className="empty-state py-6 text-center">No recent updates from your clients.</p>
      ) : (
        <ul aria-label="Recent activity" className="divide-y divide-border">
          {rows.map((r) => (
            <li key={r.key} className="flex items-center gap-3 py-2.5">
              <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface2 text-xs font-bold text-text">
                {initials(r.name)}
              </span>
              <span className="min-w-0 flex-1 text-sm">
                <span className="font-semibold text-text">{r.name}</span> {r.what}
              </span>
              <button type="button" onClick={r.action} className="shrink-0 text-sm font-bold text-accent-text underline-offset-4 hover:underline">
                {r.actionLabel} <span aria-hidden="true">→</span>
              </button>
            </li>
          ))}
        </ul>
      );
  }

  return (
    <section aria-label="Recent activity" className="card dense p-5">
      <CardHead icon={<IconBolt />} title="Recent activity" sub="Latest updates from your clients." />
      <div className="mt-3">{body}</div>
    </section>
  );
}

// ---------- Weekly coaching report ----------

/** Pulls the "Suggested actions:" lines out of a saved summary into a scannable list. */
export function parseActions(text: string): string[] {
  const i = text.indexOf("Suggested actions:");
  if (i === -1) return [];
  return text
    .slice(i)
    .split("\n")
    .filter((l) => l.trim().startsWith("- "))
    .map((l) => l.trim().slice(2).trim())
    .filter(Boolean);
}

/** The narrative lines (everything before "Suggested actions:"). */
function narrativeLines(text: string): string[] {
  const i = text.indexOf("Suggested actions:");
  return (i === -1 ? text : text.slice(0, i)).split("\n").map((l) => l.trim()).filter(Boolean);
}

/** Count of items waiting for the coach; the Home tab badge uses the same query. */
export function useReviewQueueCount() {
  const query = useQuery({ queryKey: queryKeys.reviewQueue("pending"), queryFn: () => getReviewQueue("pending") });
  return query.data?.pendingCount ?? 0;
}

function WeeklyReport({ date, totalClients }: { date: string; totalClients: number | null }) {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [failed, setFailed] = useState(false);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const query = useQuery({ queryKey: queryKeys.weeklySummary(date), queryFn: () => getWeeklySummary(date) });

  const generate = useMutation({
    mutationFn: (replace: boolean) => generateWeeklySummary(date, replace),
    onSuccess: (data) => {
      setFailed(false);
      setConfirming(false);
      setChecked(new Set());
      queryClient.setQueryData(queryKeys.weeklySummary(date), data);
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 409) setConfirming(true);
      else setFailed(true);
    },
  });

  const summary = query.data?.summary ?? null;
  const facts = (summary?.facts ?? null) as WeeklyFacts | null;
  const busy = generate.isPending;
  const actions = summary ? parseActions(summary.text) : [];
  const lines = summary ? narrativeLines(summary.text) : [];

  return (
    <section aria-label="Weekly coaching report" className="card dense mt-4 p-5">
      <div className="flex flex-wrap items-start gap-3">
        <div>
          <h2 className="card-title flex flex-wrap items-center gap-2">
            <IconSparkle /> Weekly coaching report
            <span className="rounded-full bg-type-recovery px-2 py-0.5 text-[11px] font-bold text-white">AI insights</span>
          </h2>
          <p className="text-sm text-dim">A quick summary of your clients and recommended next steps.</p>
        </div>
        <button type="button" onClick={() => generate.mutate(false)} disabled={busy} className="btn btn-primary ml-auto">
          <IconSparkle /> {busy ? "Generating…" : summary ? "Regenerate report" : "Generate weekly report"}
        </button>
      </div>

      {failed && (
        <p role="alert" className="mt-3 text-sm font-semibold text-amber-text">
          We couldn't generate the report just now. Please try again in a moment.
        </p>
      )}

      {query.isPending ? (
        <div className="mt-4">
          <LoadingState />
        </div>
      ) : query.isError ? (
        <div className="mt-4">
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        </div>
      ) : !summary ? (
        <p className="empty-state mt-4 py-6 text-center">No report yet for this week. Generate one from your own records.</p>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,22rem)_1fr]">
            <div className="grid grid-cols-3 gap-2">
              <ReportStat value={facts?.activeClients ?? 0} label={totalClients != null ? `of ${totalClients} active this week` : "active this week"} icon={<IconPeople />} tint="text-type-recovery-text" />
              <ReportStat value={facts?.checkIns ?? 0} label="Check-ins recorded" icon={<IconCalendar />} tint="text-accent-text" />
              <ReportStat value={facts?.assignmentsCompleted ?? 0} label="Assignments completed" icon={<IconCheck />} tint="text-accent2" />
            </div>
            <div>
              {summary.source === "facts" && <p className="mb-2 text-sm font-semibold text-amber-text">The AI was unavailable, so here are this week's facts.</p>}
              {actions.length > 0 ? (
                <>
                  <h3 className="text-sm font-bold text-text">Recommended next actions</h3>
                  <ul className="mt-2 flex flex-col gap-1.5">
                    {actions.map((a, i) => (
                      <li key={i}>
                        <label className="flex cursor-pointer items-start gap-2.5 text-sm">
                          <input
                            type="checkbox"
                            checked={checked.has(i)}
                            onChange={() =>
                              setChecked((prev) => {
                                const next = new Set(prev);
                                if (next.has(i)) next.delete(i);
                                else next.add(i);
                                return next;
                              })
                            }
                            className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent)]"
                          />
                          <span className={checked.has(i) ? "text-dim line-through" : "text-text"}>{a}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <ul className="flex flex-col gap-1 text-sm text-text">
                  {lines.map((l, i) => (
                    <li key={i}>{l}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <p className="mt-4 flex items-center gap-1.5 font-mono text-xs text-dim">
            <IconCalendar /> Week of {formatDay(summary.weekStart)}
          </p>
        </>
      )}

      {confirming && (
        <ConfirmDialog
          title="Replace this week's report?"
          confirmLabel="Replace report"
          pendingLabel="Replacing…"
          pending={busy}
          onConfirm={() => generate.mutate(true)}
          onCancel={() => setConfirming(false)}
        >
          <p>This week's report is already saved. Generating again replaces it.</p>
        </ConfirmDialog>
      )}
    </section>
  );
}

function ReportStat({ value, label, icon, tint }: { value: number; label: string; icon: React.ReactNode; tint: string }) {
  return (
    <div className="rounded-card border border-border bg-surface2 p-3">
      <span className={`flex h-8 w-8 items-center justify-center rounded-lg bg-surface ${tint}`}>{icon}</span>
      <p className="mt-2 text-2xl font-bold tabular-nums text-text">{value}</p>
      <p className="text-xs text-dim">{label}</p>
    </div>
  );
}

// ---------- small shared bits ----------

function CardHead({ icon, title, sub, count }: { icon: React.ReactNode; title: string; sub: string; count?: number }) {
  return (
    <div>
      <h2 className="card-title flex items-center gap-2">
        {icon} {title}
        {count ? <span className="font-normal text-dim"> · {count}</span> : null}
      </h2>
      <p className="text-sm text-dim">{sub}</p>
    </div>
  );
}

// Icons: simple 20px strokes, currentColor. Kept inline so Home adds no icon dependency.
const sv = "h-5 w-5";
const IconPeople = () => (
  <svg className={sv} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);
const IconPulse = () => (
  <svg className={sv} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
  </svg>
);
const IconDoc = () => (
  <svg className={sv} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
  </svg>
);
const IconTarget = () => (
  <svg className={sv} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10" />
    <circle cx="12" cy="12" r="6" />
    <circle cx="12" cy="12" r="2" />
  </svg>
);
const IconChart = () => (
  <svg className={sv} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M18 20V10M12 20V4M6 20v-6" />
  </svg>
);
const IconCheckCircle = () => (
  <svg className={sv} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <path d="m22 4-10 10.01-3-3" />
  </svg>
);
const IconBolt = () => (
  <svg className={sv} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M13 2 3 14h9l-1 8 10-12h-9z" />
  </svg>
);
const IconCalendar = () => (
  <svg className={sv} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <path d="M16 2v4M8 2v4M3 10h18" />
  </svg>
);
const IconSparkle = () => (
  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8" />
  </svg>
);
const IconCheck = () => (
  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);
const IconClock = () => (
  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10" />
    <path d="M12 6v6l4 2" />
  </svg>
);
