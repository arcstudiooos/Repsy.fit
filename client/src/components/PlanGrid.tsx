// The week x day plan grid (Inspo W11/N9, Nov 2026).
//
// Spur.fit's best screen: weeks as rows, days as columns, each day holding colour-coded chips. It is
// the only view where a coach sees a whole block of training at once - gaps included, which is the
// real value. "Nothing on Thursday for three weeks" is invisible in a list and obvious here.
//
// DELIBERATE CHOICES
//  * It is a VIEW, not new data. Assignments already carry a date, so nothing was added to the model.
//  * Chips reuse TYPE_CHIP, the same colours the list and AI Coach already use. CLAUDE.md forbids new
//    colours, and reusing them means a Workout is the same colour everywhere in Repsy.
//  * Every day has a real "add" button rather than a click-anywhere target: 40px, keyboard reachable,
//    and it says what it does.
//  * Horizontally scrollable on a phone rather than reflowed - a week that wraps is not a week.
import { TYPE_CHIP } from "../tabs/AiCoachTab";
import { groupByWeek, weekLabel, weekdayLabel, type WeekRow } from "../lib/weekGrid";
import type { Assignment, AssignmentType } from "../types";

type Props = {
  assignments: Assignment[];
  /** The client's today, so "this week" is always on screen and today's column is marked. */
  today: string;
  /** Open a plan (the list below scrolls to it and expands). */
  onOpen: (assignmentId: string) => void;
  /** Start a new plan on this date. */
  onAdd: (date: string) => void;
};

const DONE = "Done";

function DayCell({
  day,
  today,
  onOpen,
  onAdd,
}: {
  day: WeekRow<Assignment>["days"][number];
  today: string;
  onOpen: (id: string) => void;
  onAdd: (date: string) => void;
}) {
  const isToday = day.date === today;
  return (
    <td className="align-top">
      <div
        className={
          "flex h-full min-h-28 w-36 flex-col gap-1 rounded-lg border p-1.5 " +
          (isToday ? "border-accent bg-surface2" : "border-border")
        }
      >
        <ul className="flex flex-1 flex-col gap-1">
          {day.items.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => onOpen(a.id)}
                title={`${a.type}: ${a.title}`}
                className={
                  "w-full rounded-md px-1.5 py-1 text-left text-xs font-semibold " +
                  TYPE_CHIP[a.type as AssignmentType] +
                  (a.status === DONE ? " line-through opacity-70" : "")
                }
              >
                <span className="block truncate">{a.title}</span>
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => onAdd(day.date)}
          aria-label={`Add a plan on ${day.date}`}
          className="min-h-8 rounded-md border border-dashed border-border text-sm font-bold text-dim hover:border-dim hover:text-text"
        >
          +
        </button>
      </div>
    </td>
  );
}

export function PlanGrid({ assignments, today, onOpen, onAdd }: Props) {
  const weeks = groupByWeek(assignments, today);
  const workouts = assignments.filter((a) => a.type === "Workout").length;
  const done = assignments.filter((a) => a.status === DONE).length;

  if (weeks.length === 0) {
    return <p className="mt-4 rounded-card bg-surface2 px-4 py-6 text-center text-dim">Nothing assigned yet.</p>;
  }

  return (
    <div className="mt-4">
      {/* Inspo W11: the totals Spur.fit puts above the grid. Cheap to compute, and they answer the
          first question a coach has about a block. */}
      <ul aria-label="Plan totals" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: "Weeks", value: String(weeks.length) },
          { label: "Plans", value: String(assignments.length) },
          { label: "Workouts", value: String(workouts) },
          { label: "Finished", value: String(done) },
        ].map((s) => (
          <li key={s.label} className="rounded-card border border-border bg-surface2 px-3 py-2">
            <p className="text-xs font-semibold text-dim">{s.label}</p>
            <p className="font-heading text-2xl text-text">{s.value}</p>
          </li>
        ))}
      </ul>

      {/* A week must stay a week, so this scrolls sideways on a narrow screen instead of wrapping. */}
      <div className="mt-3 overflow-x-auto">
        <table className="w-full border-separate border-spacing-1">
          <caption className="sr-only">Plans by week and day</caption>
          <thead>
            <tr>
              <th scope="col" className="w-24 text-left text-xs font-semibold text-dim">
                Week
              </th>
              {weeks[0].days.map((d) => (
                <th key={d.date} scope="col" className="w-36 text-left text-xs font-semibold text-dim">
                  {weekdayLabel(d.date)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weeks.map((week) => (
              <tr key={week.monday}>
                <th scope="row" className="w-24 align-top text-left">
                  <span className="block text-sm font-semibold text-text">{weekLabel(week.monday)}</span>
                  <span className="block text-xs text-dim">
                    {week.count === 0 ? "nothing" : `${week.count} ${week.count === 1 ? "plan" : "plans"}`}
                  </span>
                </th>
                {week.days.map((day) => (
                  <DayCell key={day.date} day={day} today={today} onOpen={onOpen} onAdd={onAdd} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
