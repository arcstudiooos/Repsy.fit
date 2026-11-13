// The client app (Prompt 79): what a signed-in, approved CLIENT sees. Phone first: a bottom tab bar
// on phones, the same tabs at the top on wider screens (the design rules allow no side menu).
//   /client          Today: today's plans (Mark done), next session, streaks
//   /client/week     This week, Monday to Sunday
//   /client/plan/:id One plan: exercises with a checklist, a rest timer, the coach's "why", Finish
//   /client/me       My plan (membership), my sessions, my streaks, sign out
// Everything comes from the client's OWN /api/client-auth routes; a client can only mark a plan done or
// not done - never change what the coach wrote.
import { lazy, Suspense, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { PlanDetails, inline } from "../components/FormattedText";
import { ThemeSwitch } from "../components/ThemeSwitch";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getMyAssignment, getMyAssignments, getMySessions, getMyStreaks, getMyUnreadCount, markMyAssignment, queryKeys } from "../api";
import { addDays, localDateKey, weekStartOf } from "../lib/schedule";
import { TYPE_CHIP } from "../lib/typeChip";
import { LoadingState, plainErrorMessage } from "../components/States";
import { navigate } from "../route";
import { ASSIGNMENT_TYPES, type ClientAccount, type ClientAssignment } from "../types";
import { fmtDay, fmtTime, MyPlanSection, MySessionsSection } from "./sections";
import { clock, parsePlanLines, type PlanLine } from "./planLines";
import { RestTimer } from "./RestTimer";
import { MeSettings } from "./MeSettings";
import { MessagesView, CLIENT_MESSAGES_POLL_MS } from "./MessagesView";
import { CheckInDaySetting, CheckInPage, CheckInPrompts, NutritionDetails, NutritionExtras, TodayHabits, TodaySummary, WeeklyPage } from "./Tracking";

// Prompt 81: the charts (recharts) load only when the Progress tab opens.
const ProgressView = lazy(() => import("./ProgressView"));

type Page = { tab: "today" | "week" | "progress" | "messages" | "me"; planId?: string; sub?: "checkin" | "weekly" };

function pageOf(pathname: string): Page {
  const plan = /^\/client\/plan\/([^/]+)\/?$/.exec(pathname);
  if (plan) return { tab: "today", planId: decodeURIComponent(plan[1]) };
  if (/^\/client\/week\/?$/.test(pathname)) return { tab: "week" };
  if (/^\/client\/checkin\/?$/.test(pathname)) return { tab: "today", sub: "checkin" };
  if (/^\/client\/weekly\/?$/.test(pathname)) return { tab: "today", sub: "weekly" };
  if (/^\/client\/me\/?$/.test(pathname)) return { tab: "me" };
  if (/^\/client\/progress\/?$/.test(pathname)) return { tab: "progress" };
  if (/^\/client\/messages\/?$/.test(pathname)) return { tab: "messages" };
  return { tab: "today" };
}

/** Follows in-page navigation (navigate() fires popstate) inside /client/... */
function usePage(): Page {
  const [page, setPage] = useState(() => pageOf(window.location.pathname));
  useEffect(() => {
    const on = () => setPage(pageOf(window.location.pathname));
    window.addEventListener("popstate", on);
    return () => window.removeEventListener("popstate", on);
  }, []);
  return page;
}

const TABS: { tab: Page["tab"]; label: string; href: string; icon: ReactNode }[] = [
  { tab: "today", label: "Today", href: "/client", icon: <path d="M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z" /> },
  { tab: "week", label: "Week", href: "/client/week", icon: <path d="M4 6h16M4 6v13h16V6M8 3v4m8-4v4M4 10h16" /> },
  { tab: "progress", label: "Progress", href: "/client/progress", icon: <path d="M4 19h16M6 16l4-5 3 3 5-7" /> },
  { tab: "messages", label: "Messages", href: "/client/messages", icon: <path d="M4 5h16v11H8l-4 4V5z" /> },
  { tab: "me", label: "Me", href: "/client/me", icon: <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7 9a7 7 0 0 1 14 0" /> },
];

function TabLink({ t, current, compact, badge = 0 }: { t: (typeof TABS)[number]; current: boolean; compact: boolean; badge?: number }) {
  return (
    <a
      href={t.href}
      aria-current={current ? "page" : undefined}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        navigate(t.href);
      }}
      className={
        compact
          ? `flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs font-semibold ${current ? "text-accent2" : "text-dim"}`
          : `rounded-lg px-4 py-2 text-sm font-semibold ${current ? "bg-surface2 text-text" : "text-dim hover:text-text"}`
      }
    >
      {compact && (
        <span className="relative">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {t.icon}
        </svg>
          {badge > 0 && <span aria-hidden="true" className="absolute -right-2 -top-1 min-w-4 rounded-full bg-accent px-1 text-center text-[10px] leading-4 text-on-accent">{badge > 9 ? "9+" : badge}</span>}
        </span>
      )}
      {t.label}
      {!compact && badge > 0 && <span aria-hidden="true" className="ml-1.5 rounded-full bg-accent px-1.5 text-xs text-on-accent">{badge > 9 ? "9+" : badge}</span>}
      {badge > 0 && <span className="sr-only">, {badge} unread</span>}
    </a>
  );
}

export default function ClientApp({ account, onSignOut, signingOut }: { account: ClientAccount; onSignOut: () => void; signingOut: boolean }) {
  const page = usePage();
  useEffect(() => {
    document.title = page.sub === "checkin" ? "Daily check-in - Repsy" : page.sub === "weekly" ? "Weekly check-in - Repsy" : page.planId ? "Plan - Repsy" : page.tab === "week" ? "This week - Repsy" : page.tab === "me" ? "Me - Repsy" : page.tab === "progress" ? "Progress - Repsy" : page.tab === "messages" ? "Messages - Repsy" : "Today - Repsy";
    window.scrollTo(0, 0);
  }, [page.tab, page.planId, page.sub]);
  // Prompt 82: unread coach messages on the Messages tab (polled like the thread; the thread itself
  // zeroes it when open).
  const onMessages = page.tab === "messages" && !page.planId && !page.sub;
  const unread = useQuery({
    queryKey: queryKeys.myUnread,
    queryFn: getMyUnreadCount,
    refetchInterval: onMessages ? false : CLIENT_MESSAGES_POLL_MS,
    refetchIntervalInBackground: false,
    enabled: !onMessages,
  });
  const badgeFor = (tab: Page["tab"]) => (tab === "messages" && !onMessages ? (unread.data?.count ?? 0) : 0);
  return (
    <div className="min-h-screen bg-bg pb-[calc(5rem+env(safe-area-inset-bottom))] sm:pb-8">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <img src="/repsy-mark.png" alt="" width={39} height={32} className="h-8 w-auto" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-bold text-text">Hi, {account.name.split(" ")[0]}</p>
            {account.coachName && <p className="truncate text-xs text-dim">Coached by {account.coachName}</p>}
          </div>
          <nav aria-label="Client app" className="hidden gap-1 sm:flex">
            {TABS.map((t) => (
              <TabLink key={t.tab} t={t} current={!page.planId && !page.sub && page.tab === t.tab} compact={false} badge={badgeFor(t.tab)} />
            ))}
          </nav>
          <ThemeSwitch className="text-text" />
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-5">
        {page.planId ? (
          <PlanDetail key={page.planId} id={page.planId} />
        ) : page.sub === "checkin" ? (
          <CheckInPage />
        ) : page.sub === "weekly" ? (
          <WeeklyPage />
        ) : page.tab === "week" ? (
          <WeekView />
        ) : page.tab === "progress" ? (
          <Suspense fallback={<LoadingState />}>
            <ProgressView />
          </Suspense>
        ) : page.tab === "messages" ? (
          <MessagesView coachName={account.coachName ?? null} />
        ) : page.tab === "me" ? (
          <MeView account={account} onSignOut={onSignOut} signingOut={signingOut} />
        ) : (
          <TodayView />
        )}
      </main>
      <nav aria-label="Client app tabs" className="fixed inset-x-0 bottom-0 z-10 flex border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] sm:hidden">
        {TABS.map((t) => (
          <TabLink key={t.tab} t={t} current={!page.planId && !page.sub && page.tab === t.tab} compact badge={badgeFor(t.tab)} />
        ))}
      </nav>
    </div>
  );
}

// ---------- shared pieces ----------

/** Refreshes every view of the client's plans (and their streaks) after a change. */
function useRefreshPlans() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["client-account", "assignments"] }),
      qc.invalidateQueries({ queryKey: ["client-account", "assignment"] }),
      qc.invalidateQueries({ queryKey: ["client-account", "my-streaks"] }),
    ]);
}

function Chip({ type }: { type: ClientAssignment["type"] }) {
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${TYPE_CHIP[type]}`}>{type}</span>;
}

function ErrorBox({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <div className="card p-4">
      <p role="alert" className="text-sm font-semibold text-amber-text">
        {plainErrorMessage(error)}
      </p>
      <button type="button" onClick={onRetry} className="btn btn-secondary mt-2 min-h-11">
        Retry
      </button>
    </div>
  );
}

const planHref = (id: string) => `/client/plan/${encodeURIComponent(id)}`;

/** One line under a plan title: what's inside, before opening it. Nothing for done plans. */
function planPreview(plan: ClientAssignment): string {
  const lines = parsePlanLines(plan.details);
  const exercises = lines.filter((l) => l.kind === "exercise");
  if (plan.type === "Workout" && exercises.length > 0) {
    const first = exercises[0] as Extract<PlanLine, { kind: "exercise" }>;
    const head = `${exercises.length} exercise${exercises.length === 1 ? "" : "s"}`;
    return `${head} · ${first.name}${first.load ? ` ${first.load}` : ""}`;
  }
  const text = plan.details.replace(/\s+/g, " ").trim();
  if (plan.type === "Nutrition") {
    const kcal = /(\d[\d,]*)\s*kcal/i.exec(text);
    const protein = /(\d[\d,]*)\s*g\s*protein/i.exec(text);
    if (kcal || protein) return [kcal && `${kcal[1]} kcal`, protein && `${protein[1]} g protein`].filter(Boolean).join(" · ");
  }
  return text.length > 72 ? `${text.slice(0, 71).trimEnd()}…` : text;
}

function PlanRow({ plan, showMark }: { plan: ClientAssignment; showMark: boolean }) {
  const refresh = useRefreshPlans();
  const mark = useMutation({ mutationFn: (done: boolean) => markMyAssignment(plan.id, { done }), onSuccess: refresh });
  const done = plan.status === "Done";
  const workout = plan.type === "Workout";
  // Undo clears the effort and note sent with it: ask first when there is one.
  const toggle = () => {
    if (done && (plan.clientEffort != null || plan.clientNote) && !window.confirm("Mark as not done? Your effort and note for it will be removed.")) return;
    mark.mutate(!done);
  };
  const open = () => navigate(planHref(plan.id));
  const preview = done ? "" : planPreview(plan);
  return (
    <li
      className="card cursor-pointer p-4 hover:border-dim"
      onClick={(e) => {
        // The whole card opens the plan; its own buttons and links keep working.
        if ((e.target as HTMLElement).closest("a, button")) return;
        open();
      }}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Chip type={plan.type} />
            {done && <span className="text-xs font-bold text-accent2">✓ Done</span>}
          </div>
          <a
            href={planHref(plan.id)}
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
              e.preventDefault();
              open();
            }}
            className={`mt-1 block text-lg font-semibold underline-offset-4 hover:underline ${done ? "text-dim" : "text-text"}`}
          >
            {plan.title}
          </a>
          {preview && <p className="mt-0.5 truncate text-sm text-dim">{preview}</p>}
        </div>
        {/* A workout is finished INSIDE the plan (ticks, timer, effort), so its card starts it instead
            of offering a blind one-tap Mark done (owner, Nov 2026). */}
        {showMark && workout && !done && (
          <a href={planHref(plan.id)} onClick={(e) => { e.preventDefault(); open(); }} className="btn btn-primary min-h-11 shrink-0">
            Start workout
          </a>
        )}
        {showMark && (!workout || done) && (
          <button
            type="button"
            disabled={mark.isPending}
            aria-label={done ? `Mark ${plan.title} as not done` : `Mark ${plan.title} done`}
            onClick={toggle}
            className="btn btn-secondary min-h-11 shrink-0"
          >
            {mark.isPending ? "Saving..." : done ? "Undo" : "Mark done"}
          </button>
        )}
      </div>
      {mark.isError && (
        <p role="alert" className="mt-2 text-sm font-semibold text-amber-text">
          {plainErrorMessage(mark.error)}
        </p>
      )}
    </li>
  );
}

// ---------- Today ----------

/** Today's date key, moving on at midnight and whenever the app comes back to the foreground. */
function useToday(): string {
  const [today, setToday] = useState(() => localDateKey(new Date()));
  useEffect(() => {
    const check = () => setToday(localDateKey(new Date()));
    const id = window.setInterval(check, 60_000);
    document.addEventListener("visibilitychange", check);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", check);
    };
  }, []);
  return today;
}

function TodayView() {
  const today = useToday();
  const plans = useQuery({ queryKey: queryKeys.myAssignments(today, today), queryFn: () => getMyAssignments(today, today) });
  const sessions = useQuery({ queryKey: queryKeys.mySessions, queryFn: getMySessions, retry: false });
  const streaks = useQuery({ queryKey: queryKeys.myStreaks(today), queryFn: () => getMyStreaks(today), retry: false });
  const next = sessions.data?.sessions[0];
  const s = streaks.data;
  const heading = new Date(`${today}T00:00:00`).toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" });

  return (
    <>
      <h1 className="text-3xl">Today</h1>
      <p className="mt-1 text-sm text-dim">{heading}</p>
      <div className="mt-5">
        {plans.isSuccess && (
          <TodaySummary today={today} plansDone={plans.data.filter((p) => p.status === "Done").length} plansTotal={plans.data.length} />
        )}
      </div>
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start lg:gap-5">
      <section aria-label="Today's plans">
        {plans.isPending ? (
          <LoadingState />
        ) : plans.isError ? (
          <ErrorBox error={plans.error} onRetry={() => void plans.refetch()} />
        ) : plans.data.length === 0 ? (
          <div className="card p-5 text-center">
            <p className="text-base font-semibold text-text">Nothing planned for today.</p>
            <p className="mt-1 text-sm text-dim">Enjoy the rest, or look ahead at your week.</p>
          </div>
        ) : (
          <>
            <div className="grid gap-5">
              {ASSIGNMENT_TYPES.filter((type) => plans.data.some((p) => p.type === type)).map((type) => (
                <section key={type} aria-label={type}>
                  <ul className="grid gap-3">
                    {plans.data
                      .filter((p) => p.type === type)
                      .map((p) => (
                        <PlanRow key={p.id} plan={p} showMark />
                      ))}
                  </ul>
                </section>
              ))}
            </div>
          </>
        )}
      </section>
      <div className="mt-5 grid gap-3 lg:mt-0">
        <TodayHabits today={today} />
        <CheckInPrompts today={today} />
      </div>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {/* These cards only show when they have something to say (owner, Nov 2026). */}
        {next && (
          <section aria-label="Next session" className="card p-4">
            <h2 className="card-title">Next session</h2>
            <p className="mt-2 text-sm text-text">
              <span className="font-semibold">{next.title}</span>
              <br />
              {fmtDay(next.startsAt, sessions.data?.timezone ?? undefined)} ·{" "}
              {fmtTime(next.startsAt, sessions.data?.timezone ?? undefined)} - {fmtTime(next.endsAt, sessions.data?.timezone ?? undefined)}
            </p>
          </section>
        )}
        {s?.enoughData && (
          <section aria-label="Streaks" className="card p-4">
            <h2 className="card-title">Streaks</h2>
            <p className="mt-2 text-sm text-text">
              Check-in streak <span className="font-semibold">{s.checkInStreak === 1 ? "1 day" : `${s.checkInStreak} days`}</span>
              <br />
              Workouts this week <span className="font-semibold">{s.workoutsThisWeek}</span>
            </p>
          </section>
        )}
      </div>
    </>
  );
}

// ---------- This week ----------

function WeekView() {
  const [start, setStart] = useState(() => weekStartOf(new Date()));
  const from = localDateKey(start);
  const to = localDateKey(addDays(start, 6));
  const today = localDateKey(new Date());
  const plans = useQuery({ queryKey: queryKeys.myAssignments(from, to), queryFn: () => getMyAssignments(from, to) });
  const label = `${start.toLocaleDateString([], { day: "numeric", month: "short" })} – ${addDays(start, 6).toLocaleDateString([], { day: "numeric", month: "short" })}`;
  const btn = "btn btn-secondary min-h-11";

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-3xl">This week</h1>
        <div className="flex items-center gap-2">
          <button type="button" className={btn} aria-label="Previous week" onClick={() => setStart((d) => addDays(d, -7))}>
            ←
          </button>
          <span className="min-w-28 text-center text-sm font-semibold text-text" aria-live="polite">
            {label}
          </span>
          <button type="button" className={btn} aria-label="Next week" onClick={() => setStart((d) => addDays(d, 7))}>
            →
          </button>
        </div>
      </div>
      <div className="mt-5">
        {plans.isPending ? (
          <LoadingState />
        ) : plans.isError ? (
          <ErrorBox error={plans.error} onRetry={() => void plans.refetch()} />
        ) : (
          <ol className="grid gap-3">
            {Array.from({ length: 7 }, (_, i) => addDays(start, i)).map((day) => {
              const key = localDateKey(day);
              const items = plans.data.filter((p) => p.date === key);
              const done = items.filter((p) => p.status === "Done").length;
              return (
                <li
                  key={key}
                  aria-label={day.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" })}
                  className={`card ${items.length === 0 ? "px-4 py-2.5" : "p-4"} ${key === today ? "border-accent2" : ""}`}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <h2 className="font-body text-base font-bold">
                      {day.toLocaleDateString([], { weekday: "long" })}{" "}
                      <span className="font-normal text-dim">{day.toLocaleDateString([], { day: "numeric", month: "short" })}</span>
                      {key === today && <span className="ml-2 text-xs font-bold text-accent2">Today</span>}
                    </h2>
                    {items.length > 0 ? (
                      <span className="text-xs text-dim">
                        {done}/{items.length} done
                      </span>
                    ) : (
                      <span className="text-sm text-dim">Rest day</span>
                    )}
                  </div>
                  {items.length === 0 ? null : (
                    <ul className="mt-2 grid gap-1">
                      {items.map((p) => (
                        <li key={p.id} className="flex items-center gap-2 text-sm">
                          <span aria-hidden="true" className={p.status === "Done" ? "font-bold text-accent2" : "text-dim"}>
                            {p.status === "Done" ? "✓" : "○"}
                          </span>
                          <Chip type={p.type} />
                          <a
                            href={planHref(p.id)}
                            onClick={(e) => {
                              if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                              e.preventDefault();
                              navigate(planHref(p.id));
                            }}
                            className="min-w-0 truncate font-semibold text-text underline-offset-4 hover:underline"
                          >
                            {p.title}
                          </a>
                          {p.status !== "Done" && key < today && <span className="shrink-0 text-xs text-dim">Missed</span>}
                          <span className="sr-only">{p.status === "Done" ? "(done)" : "(not done yet)"}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </>
  );
}

// ---------- One plan ----------

const checkKey = (id: string) => `repsy:client-checklist:${id}`;
/** Sets done per exercise (seq -> count), kept on this device. Old saves (a list of fully
 *  ticked seqs) still count as "all sets done" for those exercises. */
function useChecklist(id: string) {
  const [setsDone, setSetsDone] = useState<Record<number, number>>(() => {
    try {
      const v = JSON.parse(localStorage.getItem(checkKey(id)) ?? "{}");
      if (Array.isArray(v)) return Object.fromEntries(v.filter((n) => typeof n === "number").map((n) => [n, 99]));
      if (v && typeof v === "object") {
        return Object.fromEntries(
          Object.entries(v as Record<string, unknown>).filter(([, c]) => typeof c === "number") as [string, number][],
        );
      }
      return {};
    } catch {
      return {};
    }
  });
  const setDone = (seq: number, count: number) =>
    setSetsDone((c) => {
      const next = { ...c, [seq]: count };
      if (count <= 0) delete next[seq];
      try {
        localStorage.setItem(checkKey(id), JSON.stringify(next));
      } catch {
        // Private mode / full storage: the checklist just isn't remembered.
      }
      return next;
    });
  return { setsDone, setDone };
}

function PlanDetail({ id }: { id: string }) {
  const plan = useQuery({ queryKey: queryKeys.myAssignment(id), queryFn: () => getMyAssignment(id), retry: false });
  const back = (
    <a
      href="/client"
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        if (window.history.length > 1) window.history.back();
        else navigate("/client");
      }}
      className="text-sm font-semibold text-accent2 underline underline-offset-4"
    >
      ← Back
    </a>
  );
  if (plan.isPending) return <LoadingState />;
  if (plan.isError) {
    return (
      <>
        {back}
        <div className="mt-4">
          <ErrorBox error={plan.error} onRetry={() => void plan.refetch()} />
        </div>
      </>
    );
  }
  return (
    <>
      {back}
      <PlanBody plan={plan.data} />
    </>
  );
}

function PlanBody({ plan }: { plan: ClientAssignment }) {
  const lines = parsePlanLines(plan.details);
  const exercises = lines.filter((l) => l.kind === "exercise");
  const { setsDone, setDone } = useChecklist(plan.id);
  const doneOf = (seq: number, sets: number) => Math.min(setsDone[seq] ?? 0, sets);
  const fullDone = exercises.filter((e) => e.kind === "exercise" && doneOf(e.seq, e.sets) >= e.sets).length;
  const [rest, setRest] = useState<{ sec: number; label: string; nonce: number } | null>(null);
  const date = new Date(`${plan.date}T00:00:00`).toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" });
  const startRest = (sec: number, label: string) => setRest((r) => ({ sec, label, nonce: (r?.nonce ?? 0) + 1 }));

  return (
    <article className="mt-3">
      <div className="flex flex-wrap items-center gap-2">
        <Chip type={plan.type} />
        <span className="text-sm text-dim">{date}</span>
      </div>
      <h1 className="mt-2 text-3xl">{plan.title}</h1>

      {exercises.length > 0 ? (
        <section aria-label="Exercises" className="mt-5">
          <p className="mb-2 text-sm text-dim">
            {fullDone} of {exercises.length} exercises done
          </p>
          <ol className="grid gap-2">
            {lines.map((l, i) =>
              l.kind === "exercise" ? (
                <li key={i} className="card p-3">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <span className={`block font-semibold ${doneOf(l.seq, l.sets) >= l.sets ? "text-dim line-through" : "text-text"}`}>
                        {l.n}. {l.name}
                      </span>
                      <span className="block text-sm text-dim">
                        {l.sets} sets × {l.reps}
                        {l.timed ? "" : " reps"}
                        {l.load ? ` · ${l.load}` : ""}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => startRest(l.restSec, l.name)}
                      aria-label={`Rest ${l.restSec} seconds after ${l.name}`}
                      className="btn btn-secondary min-h-11 shrink-0 px-3 text-sm"
                    >
                      <span aria-hidden="true">▶</span>&nbsp;{clock(l.restSec)}
                    </button>
                  </div>
                  {/* One dot per set: tick sets as you do them. Ticking a set starts that exercise's rest. */}
                  <div role="group" aria-label={`Sets for ${l.name}`} className="mt-2 flex flex-wrap gap-1.5">
                    {Array.from({ length: l.sets }, (_, k) => {
                      const done = doneOf(l.seq, l.sets);
                      const isDone = k < done;
                      return (
                        <button
                          key={k}
                          type="button"
                          aria-pressed={isDone}
                          aria-label={`${l.name} set ${k + 1}`}
                          onClick={() => {
                            const next = k + 1 === done ? k : k + 1;
                            setDone(l.seq, next);
                            if (next > done) startRest(l.restSec, l.name);
                          }}
                          className={`flex h-10 w-10 items-center justify-center rounded-full border text-sm font-bold ${
                            isDone ? "border-accent2 bg-accent2 text-white" : "border-border bg-surface2 text-dim hover:border-dim"
                          }`}
                        >
                          {isDone ? "✓" : k + 1}
                        </button>
                      );
                    })}
                  </div>
                </li>
              ) : (
                <li key={i} className={l.kind === "day" ? "px-1 pt-3 text-base font-semibold text-text" : "px-1 text-sm text-text"}>
                  {l.text.replace(/\*\*/g, "")}
                </li>
              ),
            )}
          </ol>
        </section>
      ) : plan.type === "Nutrition" ? (
        <NutritionDetails details={plan.details} />
      ) : (
        <div className="mt-5 text-base text-text">
          <PlanDetails details={plan.details} />
        </div>
      )}

      {plan.type === "Nutrition" && <NutritionExtras plan={plan} />}

      {rest && (
        <div className="fixed inset-x-0 bottom-[calc(3.9rem+env(safe-area-inset-bottom))] z-20 mx-auto max-w-3xl px-4 sm:sticky sm:bottom-4 sm:mt-5 sm:px-0">
          <RestTimer seconds={rest.sec} label={rest.label} nonce={rest.nonce} autoStart onDismiss={() => setRest(null)} />
        </div>
      )}

      {plan.reasoning.trim() !== "" && (
        <section aria-label="Why this plan" className="mt-5 rounded-lg border border-border bg-surface2 p-4">
          <h2 className="card-title">Why this plan</h2>
          <p className="mt-1 text-sm text-text">{inline(plan.reasoning)}</p>
        </section>
      )}

      <div id="finish-box">
        <FinishBox plan={plan} />
      </div>
      {/* All exercises ticked: one tap to the finish step (sticky above the phone tab bar). */}
      {exercises.length > 0 && plan.status !== "Done" && fullDone >= exercises.length && (
        <div className="fixed inset-x-0 bottom-[calc(3.9rem+env(safe-area-inset-bottom))] z-10 px-4 sm:sticky sm:bottom-4 sm:mt-4 sm:px-0">
          <button
            type="button"
            onClick={() => document.getElementById("finish-box")?.scrollIntoView({ behavior: "smooth", block: "center" })}
            className="btn btn-primary w-full shadow-lg"
          >
            All exercises done - finish workout
          </button>
        </div>
      )}
    </article>
  );
}

function FinishBox({ plan }: { plan: ClientAssignment }) {
  const refresh = useRefreshPlans();
  const qc = useQueryClient();
  const isWorkout = plan.type === "Workout";
  const [open, setOpen] = useState(false);
  const [effort, setEffort] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const mark = useMutation({
    mutationFn: (body: { done: boolean; effort?: number | null; note?: string }) => markMyAssignment(plan.id, body),
    onSuccess: async (updated) => {
      qc.setQueryData(queryKeys.myAssignment(plan.id), updated);
      setOpen(false);
      await refresh();
    },
  });
  const error = mark.isError ? (
    <p role="alert" className="mt-2 text-sm font-semibold text-amber-text">
      {plainErrorMessage(mark.error)}
    </p>
  ) : null;

  if (plan.status === "Done") {
    return (
      <section aria-label="Finished" className="mt-6 card p-4">
        <p role="status" className="text-base font-semibold text-accent2">
          ✓ Done{plan.completedBy === "coach" ? " (marked by your coach)" : ""}
        </p>
        {plan.clientEffort != null && <p className="mt-1 text-sm text-text">Effort {plan.clientEffort}/10</p>}
        {plan.clientNote && <p className="mt-1 whitespace-pre-wrap text-sm text-text">“{plan.clientNote}”</p>}
        <button
          type="button"
          disabled={mark.isPending}
          onClick={() => mark.mutate({ done: false })}
          className="btn btn-secondary mt-3 min-h-11"
        >
          {mark.isPending ? "Saving..." : "Mark as not done"}
        </button>
        {error}
      </section>
    );
  }
  if (!open) {
    return (
      <div className="mt-6">
        <button type="button" onClick={() => setOpen(true)} className="btn btn-primary min-h-12 w-full text-base sm:w-auto">
          {isWorkout ? "Finish workout" : "Mark done"}
        </button>
      </div>
    );
  }
  const submit = (e: FormEvent) => {
    e.preventDefault();
    mark.mutate({ done: true, effort, note: note.trim() || undefined });
  };
  return (
    <form onSubmit={submit} aria-label={isWorkout ? "Finish workout" : "Mark done"} className="mt-6 card p-4">
      <fieldset>
        <legend className="text-base font-semibold text-text">How hard was it? (optional)</legend>
        <p className="text-xs text-dim">1 = very easy, 10 = everything you had</p>
        {/* Native radios: one tab stop, arrow keys move the choice. "No rating" clears it. */}
        <div className="mt-2 grid grid-cols-5 gap-2 sm:grid-cols-10">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <label
              key={n}
              className={`flex min-h-11 cursor-pointer items-center justify-center rounded-lg border font-mono text-sm font-semibold has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 ${
                effort === n ? "border-accent bg-accent text-on-accent" : "border-border bg-surface2 text-text hover:border-dim"
              }`}
            >
              <input type="radio" name="effort" value={n} checked={effort === n} onChange={() => setEffort(n)} className="sr-only" />
              {n}
            </label>
          ))}
        </div>
        {effort !== null && (
          <button type="button" onClick={() => setEffort(null)} className="mt-2 text-sm font-semibold text-accent2 underline underline-offset-4">
            No rating
          </button>
        )}
      </fieldset>
      <label htmlFor="finish-note" className="mt-4 block text-sm font-semibold">
        Note for your coach (optional)
      </label>
      <textarea
        id="finish-note"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={500}
        rows={3}
        className="mt-1 w-full rounded-lg border border-border bg-surface2 px-3 py-2 text-base text-text"
      />
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="submit" disabled={mark.isPending} className="btn btn-primary min-h-11">
          {mark.isPending ? "Saving..." : "Save as done"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="btn btn-secondary min-h-11"
        >
          Cancel
        </button>
      </div>
      {error}
    </form>
  );
}

// ---------- Me ----------

function MeView({ account, onSignOut, signingOut }: { account: ClientAccount; onSignOut: () => void; signingOut: boolean }) {
  return (
    <>
      <h1 className="text-3xl">Me</h1>
      <p className="mt-1 text-sm text-dim">Signed in as {account.loginEmail ?? account.name}.</p>
      {/* The Me tab is a long page: these jump to a section instead of scrolling for it. */}
      <nav aria-label="Jump to a section" className="mt-3 flex flex-wrap gap-2">
        {[
          ["My plan", "me-plan"],
          ["Profile", "me-profile"],
          ["Payments", "me-payments"],
        ].map(([label, id]) => (
          <a
            key={id}
            href={`#${id}`}
            onClick={(e) => {
              e.preventDefault();
              document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
            className="flex min-h-9 items-center rounded-full border border-border bg-surface2 px-3 text-sm font-semibold text-text hover:border-dim"
          >
            {label}
          </a>
        ))}
      </nav>
      <MyPlanSection />
      <MySessionsSection />
      <CheckInDaySetting />
      <MeSettings />
      <div className="mt-6">
        <button
          type="button"
          onClick={onSignOut}
          disabled={signingOut}
          className="btn btn-secondary min-h-11"
        >
          {signingOut ? "Signing out..." : "Sign out"}
        </button>
      </div>
    </>
  );
}
