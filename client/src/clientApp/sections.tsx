// The client's own plan, sessions and streaks (Prompts 68, 69, 71) - shown on the Me tab of the
// client app (Prompt 79) and the next session / streak also on Today.
import { useQuery } from "@tanstack/react-query";
import { getMyPlan, getMySessions, getMyStreaks, queryKeys } from "../api";
import { localDateKey, viewerTimeZone } from "../lib/schedule";
import { plainErrorMessage } from "../components/States";

const dayText = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString([], { dateStyle: "medium" });

/**
 * "My plan" (Prompt 68): the client's OWN plan name, status and next due date, and the date of their
 * own last payment. No amounts, no payment history, nothing about any other client.
 */
export function MyPlanSection() {
  const plan = useQuery({ queryKey: queryKeys.myPlan, queryFn: getMyPlan, retry: false });
  return (
    <section aria-label="My plan" className="mt-6 rounded-lg border border-border bg-surface2 p-4 text-left">
      <h2 className="text-base">My plan</h2>
      {plan.isPending ? (
        <p className="mt-2 text-sm text-dim">Loading...</p>
      ) : plan.isError ? (
        <p role="alert" className="mt-2 text-sm font-semibold text-amber-text">
          {plainErrorMessage(plan.error)}
        </p>
      ) : !plan.data.plan ? (
        <p className="mt-2 text-sm text-dim">Your coach has not set up a plan for you yet.</p>
      ) : (
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-dim">Plan</dt>
          <dd className="font-semibold text-text">{plan.data.plan.planName}</dd>
          <dt className="text-dim">Status</dt>
          <dd className="text-text">{plan.data.plan.status}</dd>
          {plan.data.plan.status !== "Ended" && (
            <>
              <dt className="text-dim">Next due</dt>
              <dd className="text-text">{dayText(plan.data.plan.nextDueDate)}</dd>
            </>
          )}
          <dt className="text-dim">Last payment</dt>
          <dd className="text-text">{plan.data.lastPaymentDate ? dayText(plan.data.lastPaymentDate) : "None recorded yet"}</dd>
        </dl>
      )}
    </section>
  );
}

/**
 * "My sessions" (Prompt 69): the client's OWN upcoming booked sessions, read-only (no booking, no
 * calendar sync, no coach notes). Times arrive as UTC and are shown in this browser's timezone.
 */
/** Session day / time in the client's timezone override (Prompt 83), else this browser's timezone. */
export const fmtDay = (iso: string, timeZone?: string) => new Date(iso).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric", timeZone });
export const fmtTime = (iso: string, timeZone?: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", timeZone });

export function MySessionsSection() {
  const sessions = useQuery({ queryKey: queryKeys.mySessions, queryFn: getMySessions, retry: false });
  // Prompt 83: the client's timezone override, else the device's.
  const tz = sessions.data?.timezone ?? undefined;
  return (
    <section aria-label="My sessions" className="mt-4 rounded-lg border border-border bg-surface2 p-4 text-left">
      <h2 className="text-base">My sessions</h2>
      {sessions.isPending ? (
        <p className="mt-2 text-sm text-dim">Loading...</p>
      ) : sessions.isError ? (
        <p role="alert" className="mt-2 text-sm font-semibold text-amber-text">
          {plainErrorMessage(sessions.error)}
        </p>
      ) : sessions.data.sessions.length === 0 ? (
        <p className="mt-2 text-sm text-dim">No upcoming sessions.</p>
      ) : (
        <>
          <ul className="mt-2 divide-y divide-border">
            {sessions.data.sessions.map((s) => (
              <li key={s.id} className="py-2 text-sm">
                <p className="font-semibold text-text">{s.title}</p>
                <p className="text-dim">
                  {fmtDay(s.startsAt, tz)} · <span className="font-mono text-text">{fmtTime(s.startsAt, tz)} - {fmtTime(s.endsAt, tz)}</span> · {s.type}
                </p>
                {s.location && <p className="break-words text-dim">{s.location}</p>}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-dim">Times are shown in your timezone ({tz ?? viewerTimeZone()}).</p>
        </>
      )}
    </section>
  );
}

/**
 * "My streaks" (Prompt 71): a small line with the client's OWN numbers only. No rank, no other
 * clients, no points. Nothing logged yet reads "Not enough data yet".
 */
export function MyStreaksSection() {
  const date = localDateKey(new Date());
  const streaks = useQuery({ queryKey: queryKeys.myStreaks(date), queryFn: () => getMyStreaks(date), retry: false });
  const d = streaks.data;
  return (
    <section aria-label="My streaks" className="mt-4 rounded-lg border border-border bg-surface2 p-4 text-left">
      <h2 className="text-base">My streaks</h2>
      {streaks.isPending ? (
        <p className="mt-2 text-sm text-dim">Loading...</p>
      ) : streaks.isError ? (
        <p role="alert" className="mt-2 text-sm font-semibold text-amber-text">
          {plainErrorMessage(streaks.error)}
        </p>
      ) : !d || !d.enoughData ? (
        <p className="mt-2 text-sm text-dim">Not enough data yet</p>
      ) : (
        <p className="mt-2 text-sm text-text">
          Check-in streak <span className="font-mono">{d.checkInStreak === 1 ? "1 day" : `${d.checkInStreak} days`}</span> · Habits, last 7 days{" "}
          <span className="font-mono">{d.habitPercent === null ? "none yet" : `${d.habitPercent}%`}</span> · Workouts this week{" "}
          <span className="font-mono">{d.workoutsThisWeek}</span>
        </p>
      )}
    </section>
  );
}

