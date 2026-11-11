import type { ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ASSIGNMENT_TYPES, type Assignment, type AssignmentType, type ProgressLog } from "../types";

// Recharts needs colour values, not CSS classes. These are the design-system values from
// CLAUDE.md (accent, accent2 and the assignment type colours) - no new colours.
const ACCENT = "#FF4A1F";
const TEAL = "#0E7C6B";
const TYPE_HEX: Record<AssignmentType, string> = {
  Workout: "#FF4A1F",
  Nutrition: "#0E7C6B",
  Habit: "#D97706",
  Recovery: "#7C5CFC",
};

const NOT_ENOUGH = "Add one more check-in to see the trend.";
const CHART_HEIGHT = 220;
const shortDate = (date: string) => date.slice(5); // "2026-11-02" -> "11-02"

type Props = { logs: Pick<ProgressLog, "date" | "weightKg" | "adherence">[]; assignments: Pick<Assignment, "type">[] };

/** Weight, adherence and assignments-by-type charts, fed only by real data. logs: oldest first. */
export function ProgressCharts({ logs, assignments }: Props) {
  const weightPoints = logs
    .filter((l) => l.weightKg !== null)
    .map((l) => ({ date: l.date, weightKg: l.weightKg as number }));
  const adherencePoints = logs
    .filter((l) => l.adherence !== null)
    .map((l) => ({ date: l.date, adherence: l.adherence as number }));
  const byType = ASSIGNMENT_TYPES.map((type) => ({ type, count: assignments.filter((a) => a.type === type).length }));

  return (
    <div className="mt-6 grid gap-4 md:grid-cols-2">
      <ChartCard title="Weight">
        {weightPoints.length < 2 ? (
          <NotEnough />
        ) : (
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <LineChart data={weightPoints} margin={{ top: 8, right: 12, bottom: 16, left: 4 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                tickFormatter={shortDate}
                stroke="var(--dim)"
                label={{ value: "Date", position: "insideBottom", offset: -8, fill: "var(--dim)" }}
              />
              <YAxis
                domain={["dataMin - 1", "dataMax + 1"]}
                allowDecimals={false}
                width={44}
                stroke="var(--dim)"
                label={{ value: "kg", angle: -90, position: "insideLeft", fill: "var(--dim)" }}
              />
              <Tooltip labelFormatter={(date) => String(date)} formatter={(value) => [`${value} kg`, "Weight"]} />
              <Line type="monotone" dataKey="weightKg" stroke={ACCENT} strokeWidth={2} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      <ChartCard title="Adherence">
        {adherencePoints.length < 2 ? (
          <NotEnough />
        ) : (
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <LineChart data={adherencePoints} margin={{ top: 8, right: 12, bottom: 16, left: 4 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                tickFormatter={shortDate}
                stroke="var(--dim)"
                label={{ value: "Date", position: "insideBottom", offset: -8, fill: "var(--dim)" }}
              />
              <YAxis
                domain={[0, 100]}
                ticks={[0, 25, 50, 75, 100]}
                width={44}
                stroke="var(--dim)"
                label={{ value: "%", angle: -90, position: "insideLeft", fill: "var(--dim)" }}
              />
              <Tooltip labelFormatter={(date) => String(date)} formatter={(value) => [`${value}%`, "Adherence"]} />
              <Line type="monotone" dataKey="adherence" stroke={TEAL} strokeWidth={2} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      <ChartCard title="Assignments by type">
        <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
          <BarChart data={byType} margin={{ top: 20, right: 12, bottom: 4, left: 4 }}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
            {/* Smaller ticks so all 4 type names fit side by side on a 375px phone. */}
            <XAxis dataKey="type" stroke="var(--dim)" interval={0} tick={{ fontSize: 11 }} />
            <YAxis allowDecimals={false} width={32} stroke="var(--dim)" />
            <Bar dataKey="count" isAnimationActive={false}>
              {byType.map((d) => (
                <Cell key={d.type} fill={TYPE_HEX[d.type]} />
              ))}
              <LabelList dataKey="count" position="top" fill="var(--text)" />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <figure aria-label={title} className="card m-0 min-w-0 p-4">
      <h3 className="mb-2 text-lg">{title}</h3>
      {children}
    </figure>
  );
}

function NotEnough() {
  return (
    <div
      className="flex items-center justify-center rounded-card bg-surface2 px-4 text-center text-sm text-dim"
      style={{ height: CHART_HEIGHT }}
    >
      {NOT_ENOUGH}
    </div>
  );
}
