// Weekly summary facts and fallback text (Prompt 51).
// Pure functions: no database, no network, so the numbers can be checked by hand and in tests.
// Rule: every number the AI may write must exist in this facts object (see factNumbers).
import { findAtRiskClients, type AtRiskClientInput, type AtRiskLogInput } from "./atRisk.js";

/** The week the summary covers: 7 days ending on `date` (inclusive), starting on Monday. */
export const WEEK_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;
const dayNumber = (date: string) => Math.round(new Date(`${date}T00:00:00.000Z`).getTime() / DAY_MS);
const dateOf = (day: number) => new Date(day * DAY_MS).toISOString().slice(0, 10);

/** Monday (UTC) of the week `date` falls in. */
export function weekStartOf(date: string): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  const weekday = (d.getUTCDay() + 6) % 7; // 0 = Monday
  return dateOf(dayNumber(date) - weekday);
}

export type WeeklyFactsInput = {
  weekStart: string;
  clients: (AtRiskClientInput & { logs: AtRiskLogInput[] })[];
  /** Every progress log of the coach, with its date, for counting this week's check-ins. */
  logs: { clientId: string; date: string; adherence: number | null }[];
  /** Assignments marked Done, with the date they are for. */
  assignmentsDone: { date: string }[];
  /** Clients with at least one Active assignment dated in the week. */
  activeClientIds: string[];
};

export type WeeklyFacts = {
  weekStart: string;
  weekEnd: string;
  activeClients: number;
  checkIns: number;
  avgAdherence: number | null;
  avgAdherenceChange: number | null;
  assignmentsCompleted: number;
  atRiskClients: number;
};

const inRange = (date: string, from: string, to: string) => date >= from && date <= to;
const mean = (ns: number[]) => (ns.length ? ns.reduce((a, b) => a + b, 0) / ns.length : null);

/** The coach's last-7-days numbers. Nothing here is invented: each value is counted from records. */
export function buildWeeklyFacts(input: WeeklyFactsInput): WeeklyFacts {
  const { weekStart } = input;
  const weekEnd = dateOf(dayNumber(weekStart) + WEEK_DAYS - 1);
  const prevStart = dateOf(dayNumber(weekStart) - WEEK_DAYS);
  const prevEnd = dateOf(dayNumber(weekStart) - 1);

  const thisWeek = input.logs.filter((l) => inRange(l.date, weekStart, weekEnd));
  const lastWeek = input.logs.filter((l) => inRange(l.date, prevStart, prevEnd));
  const avgNow = mean(thisWeek.filter((l) => l.adherence !== null).map((l) => l.adherence as number));
  const avgBefore = mean(lastWeek.filter((l) => l.adherence !== null).map((l) => l.adherence as number));

  const atRisk = findAtRiskClients(
    input.clients.map((c) => ({ client: { id: c.id, name: c.name, goal: c.goal, createdAt: c.createdAt }, logs: c.logs })),
    weekEnd,
  );

  return {
    weekStart,
    weekEnd,
    activeClients: new Set(input.activeClientIds).size,
    checkIns: thisWeek.length,
    avgAdherence: avgNow === null ? null : Math.round(avgNow),
    avgAdherenceChange: avgNow === null || avgBefore === null ? null : Math.round(avgNow - avgBefore),
    assignmentsCompleted: input.assignmentsDone.filter((a) => inRange(a.date, weekStart, weekEnd)).length,
    atRiskClients: atRisk.length,
  };
}

/** Every number a summary is allowed to contain (as written: "86", "-3", "0"). */
export function factNumbers(facts: WeeklyFacts): Set<string> {
  const out = new Set<string>();
  for (const v of [facts.activeClients, facts.checkIns, facts.avgAdherence, facts.avgAdherenceChange, facts.assignmentsCompleted, facts.atRiskClients]) {
    if (v === null) continue;
    out.add(String(v));
    out.add(String(Math.abs(v)));
  }
  for (const d of [facts.weekStart, facts.weekEnd]) {
    out.add(d);
    for (const part of d.split("-")) out.add(part), out.add(String(Number(part)));
  }
  return out;
}

/**
 * True when every number in `text` appears in the facts. Guards the "no inventing numbers" rule:
 * a summary that cites a number we did not give it is thrown away and the facts list is shown.
 */
export function numbersAreGrounded(text: string, facts: WeeklyFacts): boolean {
  const allowed = factNumbers(facts);
  return (text.match(/\d+(?:\.\d+)?/g) ?? []).every((n) => allowed.has(n) || allowed.has(String(Number(n))));
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** The plain fact list shown instead of a summary when the AI is unavailable or unusable. */
export function factsFallbackText(facts: WeeklyFacts): string {
  const change =
    facts.avgAdherenceChange === null
      ? "no week-on-week comparison yet"
      : `${facts.avgAdherenceChange > 0 ? "up" : facts.avgAdherenceChange < 0 ? "down" : "level at"} ${Math.abs(facts.avgAdherenceChange)} points on last week`;
  return [
    `- Active clients this week: ${facts.activeClients}`,
    `- Check-ins logged: ${facts.checkIns}`,
    `- Average adherence: ${facts.avgAdherence === null ? "not logged" : `${facts.avgAdherence}%`} (${change})`,
    `- Plans completed: ${facts.assignmentsCompleted}`,
    `- Clients needing attention: ${plural(facts.atRiskClients, "client")}`,
  ].join("\n");
}
