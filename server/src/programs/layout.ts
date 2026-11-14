// Turning a program template into dated assignments (Inspo W10, Nov 2026).
//
// A LEAF module: the programs router and the clients router both need this, and a shared helper
// living in either one closes an ESM import cycle (see CLAUDE.md).
//
// The whole feature rests on one decision: assigning a program MATERIALISES ordinary assignment
// rows. Template and assignments are independent from that moment on, so every existing reader
// works unchanged and a coach can adjust one client's week without touching the template.
import { addDays } from "../habits.js";

/** 0 = Sunday ... 6 = Saturday, matching habits and `Date.getUTCDay()`. */
export const weekdayOf = (date: string): number => new Date(`${date}T00:00:00Z`).getUTCDay();

export interface PlannedItem {
  week: number;
  weekday: number;
  type: string;
  title: string;
  details: string;
}

export interface PlannedPhase {
  order: number;
  name: string;
  weeks: number;
  items: PlannedItem[];
}

export interface DatedItem {
  date: string;
  type: string;
  title: string;
  details: string;
  /** Which phase it came from, for the "what will this create?" preview. */
  phaseName: string;
}

/** How many weeks the whole program runs for. */
export const programWeeks = (phases: PlannedPhase[]): number =>
  phases.reduce((total, p) => total + Math.max(1, p.weeks), 0);

/**
 * Lays a program out on the calendar from `startDate`.
 *
 * `startDate` anchors WEEK 1 DAY 1 of phase 1, and the week always runs from that date - it is NOT
 * snapped to a Monday. A coach who starts a client on a Wednesday means Wednesday: snapping would
 * silently drop the first few days of their plan, which is the kind of surprise that loses trust.
 * So "weekday 3" means the Wednesday of that program week, counted from the start date's own week.
 *
 * Phases run back to back: phase 2 week 1 begins the week after phase 1's last week.
 */
export function layOutProgram(phases: PlannedPhase[], startDate: string): DatedItem[] {
  const startWeekday = weekdayOf(startDate);
  const out: DatedItem[] = [];
  let weeksBefore = 0;

  for (const phase of [...phases].sort((a, b) => a.order - b.order)) {
    const weeks = Math.max(1, phase.weeks);
    for (const item of phase.items) {
      // An item outside its phase's length would otherwise land in the NEXT phase's dates.
      if (item.week < 1 || item.week > weeks) continue;
      const weekIndex = weeksBefore + item.week - 1;
      // Days from the start date to this item's weekday within the same week-of-program.
      const offsetInWeek = (item.weekday - startWeekday + 7) % 7;
      out.push({
        date: addDays(startDate, weekIndex * 7 + offsetInWeek),
        type: item.type,
        title: item.title,
        details: item.details,
        phaseName: phase.name,
      });
    }
    weeksBefore += weeks;
  }

  // Oldest first, and stable within a day so a preview and the real thing agree.
  return out.sort((a, b) => (a.date === b.date ? a.title.localeCompare(b.title) : a.date.localeCompare(b.date)));
}
