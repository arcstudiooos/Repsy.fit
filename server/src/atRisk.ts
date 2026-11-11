// "Needs attention" rules for the Home tab (Prompt 50) - see "API contract" in CLAUDE.md.
// ALL the rules live here, as one pure function with named thresholds. No AI: every reason is a
// plain-words sentence built from the client's own progress logs, so the coach can check it by hand.

/** Rule 1: average adherence below this percent... */
export const ADHERENCE_MIN_PERCENT = 60;
/** ...over the logs dated within this many days up to the client's latest adherence log ("2 weeks"). */
export const ADHERENCE_WINDOW_DAYS = 14;
/** Rule 2: no progress log for this many days (or more). */
export const INACTIVE_DAYS = 10;
/** Rule 3: weight moved opposite to the goal, log after log, this many times in a row. */
export const WEIGHT_STREAK_LOGS = 3;

const DAY_MS = 24 * 60 * 60 * 1000;
const dayNumber = (date: string) => Math.round(new Date(`${date}T00:00:00.000Z`).getTime() / DAY_MS);

export type AtRiskClientInput = { id: string; name: string; goal: string; createdAt: Date };
export type AtRiskLogInput = { date: string; weightKg: number | null; adherence: number | null };
export type AtRiskReason = { rule: "adherence" | "inactive" | "weight"; text: string };
export type AtRiskClient = { clientId: string; clientName: string; reasons: AtRiskReason[] };

/** Which way weight should move for a goal; null when the goal has no weight direction. */
function goalDirection(goal: string): { direction: "down" | "up"; label: string } | null {
  const g = goal.toLowerCase();
  if (g.includes("fat loss")) return { direction: "down", label: "fat loss" };
  if (g.includes("muscle gain")) return { direction: "up", label: "muscle gain" };
  return null;
}

const num = (n: number) => String(Math.round(n * 10) / 10);

type Hit = AtRiskReason & { severity: number };

function adherenceHit(logs: AtRiskLogInput[]): Hit | null {
  const withAdherence = logs.filter((l) => l.adherence !== null);
  if (withAdherence.length === 0) return null;
  const latest = withAdherence[withAdherence.length - 1].date;
  const recent = withAdherence.filter((l) => dayNumber(latest) - dayNumber(l.date) < ADHERENCE_WINDOW_DAYS);
  const average = Math.round(recent.reduce((sum, l) => sum + (l.adherence as number), 0) / recent.length);
  if (average >= ADHERENCE_MIN_PERCENT) return null;
  return {
    rule: "adherence",
    text: `Adherence ${average}% over the last ${ADHERENCE_WINDOW_DAYS / 7} weeks`,
    severity: (ADHERENCE_MIN_PERCENT - average) / ADHERENCE_MIN_PERCENT,
  };
}

function inactiveHit(client: AtRiskClientInput, logs: AtRiskLogInput[], today: string): Hit | null {
  if (logs.length === 0) {
    const age = dayNumber(today) - dayNumber(client.createdAt.toISOString().slice(0, 10));
    if (age < INACTIVE_DAYS) return null; // a brand-new client has had no time to check in
    return { rule: "inactive", text: "No check-in logged yet", severity: Math.min(age, 60) / 60 };
  }
  const days = dayNumber(today) - dayNumber(logs[logs.length - 1].date);
  if (days < INACTIVE_DAYS) return null;
  return { rule: "inactive", text: `No check-in for ${days} days`, severity: Math.min(days, 60) / 60 };
}

function weightHit(client: AtRiskClientInput, logs: AtRiskLogInput[]): Hit | null {
  const goal = goalDirection(client.goal);
  if (!goal) return null;
  const weights = logs.filter((l) => l.weightKg !== null).map((l) => l.weightKg as number);
  const needed = WEIGHT_STREAK_LOGS + 1; // N moves are measured between N + 1 weights
  if (weights.length < needed) return null;
  const last = weights.slice(-needed);
  for (let i = 1; i < last.length; i++) {
    const wrongWay = goal.direction === "down" ? last[i] > last[i - 1] : last[i] < last[i - 1];
    if (!wrongWay) return null;
  }
  return {
    rule: "weight",
    text: `Weight went ${goal.direction === "down" ? "up" : "down"} ${WEIGHT_STREAK_LOGS} logs in a row (${num(last[0])} → ${num(last[last.length - 1])} kg) while the goal is ${goal.label}`,
    severity: Math.abs(last[last.length - 1] - last[0]) / 10,
  };
}

/**
 * Clients that need the coach's attention on `today` ("YYYY-MM-DD"), worst first: more rules firing
 * first, then the bigger gaps, then name. `logs` may come in any order.
 */
export function findAtRiskClients(
  entries: { client: AtRiskClientInput; logs: AtRiskLogInput[] }[],
  today: string,
): AtRiskClient[] {
  const found: { result: AtRiskClient; score: number }[] = [];
  for (const { client, logs: unsorted } of entries) {
    const logs = [...unsorted].sort((a, b) => a.date.localeCompare(b.date));
    const hits = [adherenceHit(logs), inactiveHit(client, logs, today), weightHit(client, logs)].filter(
      (h): h is Hit => h !== null,
    );
    if (hits.length === 0) continue;
    found.push({
      result: { clientId: client.id, clientName: client.name, reasons: hits.map(({ rule, text }) => ({ rule, text })) },
      score: hits.length + hits.reduce((sum, h) => sum + Math.min(h.severity, 1) * 0.3, 0),
    });
  }
  found.sort((a, b) => b.score - a.score || a.result.clientName.localeCompare(b.result.clientName));
  return found.map((f) => f.result);
}
