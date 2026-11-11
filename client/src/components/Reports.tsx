// Business > Reports (Prompt 70): a printable progress report for one client and a date range, plus
// CSV exports. v2 makes the PDF with the browser's print dialog ("Save as PDF"): there is no PDF library.
// Nothing is emailed or scheduled, and the report never shows coach notes or AI chat.
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { downloadClientCsv, getProgressReport } from "../api";
import { ProgressCharts } from "./ProgressCharts";
import { plainErrorMessage } from "./States";
import type { Client, ClientExportType, ProgressReport, ReportRange } from "../types";

const inputClass = "min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-base text-text";
const labelClass = "mb-1 block text-sm font-bold";
const buttonClass = "min-h-10 rounded-lg border border-border bg-surface2 px-3 text-sm font-semibold text-text hover:border-dim";

const EXPORTS: { type: ClientExportType; label: string }[] = [
  { type: "progress", label: "Progress logs" },
  { type: "measurements", label: "Measurements" },
  { type: "payments", label: "Payments" },
  { type: "assignments", label: "Assignments" },
];

const MEASURES = [
  { key: "waistCm", label: "Waist", unit: "cm" },
  { key: "chestCm", label: "Chest", unit: "cm" },
  { key: "armCm", label: "Arm", unit: "cm" },
  { key: "hipCm", label: "Hip", unit: "cm" },
  { key: "bodyFatPercent", label: "Body fat", unit: "%" },
] as const;

const round1 = (n: number) => String(Math.round(n * 10) / 10);
const show = (n: number | null, unit = "") => (n === null ? "-" : `${round1(n)}${unit ? ` ${unit}` : ""}`);

function rangeText({ from, to }: ProgressReport["range"]) {
  if (from && to) return `${from} to ${to}`;
  if (from) return `From ${from}`;
  if (to) return `Up to ${to}`;
  return "All dates";
}

export function Reports({ clients }: { clients: Client[] }) {
  const [picked, setClientId] = useState(clients[0]?.id ?? "");
  // If the picked client is deleted, fall back to the first one rather than a stale id.
  const clientId = clients.some((c) => c.id === picked) ? picked : (clients[0]?.id ?? "");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [rangeError, setRangeError] = useState<string | null>(null);

  const range: ReportRange = { ...(from ? { from } : {}), ...(to ? { to } : {}) };
  const checkRange = () => {
    if (from && to && from > to) {
      setRangeError("The start date can't be after the end date.");
      return false;
    }
    setRangeError(null);
    return true;
  };

  const report = useMutation({ mutationFn: () => getProgressReport(clientId, range) });
  const csv = useMutation({ mutationFn: (type: ClientExportType) => downloadClientCsv(clientId, type, range) });

  if (clients.length === 0) {
    return <div className="card mt-4 p-6 text-center text-dim">Add a client to create a report.</div>;
  }

  return (
    <section aria-label="Reports" className="mt-4">
      <div className="no-print">
        <p className="text-sm text-dim">
          Make a progress report for one client and print it or save it as a PDF from your browser's print window (that is how
          PDFs work in this version). The CSV files are one per type. Reports are never emailed or sent automatically.
        </p>
        <div className="mt-3 grid gap-3 rounded-lg bg-surface2 p-3 sm:grid-cols-3">
          <div>
            <label htmlFor="report-client" className={labelClass}>
              Client
            </label>
            <select
              id="report-client"
              value={clientId}
              onChange={(e) => {
                setClientId(e.target.value);
                report.reset();
              }}
              className={inputClass}
            >
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="report-from" className={labelClass}>
              From (optional)
            </label>
            <input id="report-from" type="date" value={from} onChange={(e) => (setFrom(e.target.value), setRangeError(null))} className={inputClass} />
          </div>
          <div>
            <label htmlFor="report-to" className={labelClass}>
              To (optional)
            </label>
            <input id="report-to" type="date" value={to} onChange={(e) => (setTo(e.target.value), setRangeError(null))} className={inputClass} />
          </div>
          {rangeError && (
            <p role="alert" className="text-sm font-semibold text-amber-text sm:col-span-3">
              {rangeError}
            </p>
          )}
          <div className="flex flex-wrap gap-2 sm:col-span-3">
            <button
              type="button"
              disabled={!clientId || report.isPending}
              onClick={() => checkRange() && report.mutate()}
              className="btn-primary min-h-11 rounded-lg px-5 text-sm disabled:opacity-60"
            >
              {report.isPending ? "Making report..." : "Generate progress report"}
            </button>
          </div>
        </div>

        <div role="group" aria-label="CSV exports" className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-sm font-bold">Download CSV:</span>
          {EXPORTS.map((e) => (
            <button
              key={e.type}
              type="button"
              disabled={!clientId || csv.isPending}
              onClick={() => checkRange() && csv.mutate(e.type)}
              className={buttonClass + " disabled:opacity-60"}
            >
              {e.label}
            </button>
          ))}
        </div>
        <p className="mt-1 text-xs text-dim">Dates are YYYY-MM-DD. Photos are not included in exports.</p>
        {(csv.isError || report.isError) && (
          <p role="alert" className="mt-2 text-sm font-semibold text-amber-text">
            {plainErrorMessage(csv.isError ? csv.error : report.error)}
          </p>
        )}
      </div>

      {report.data && <ReportView report={report.data} />}
    </section>
  );
}

function ReportView({ report }: { report: ProgressReport }) {
  const { client, logs, measurements, assignments, checkIns } = report;
  const chartAssignments = assignments.byType.flatMap(({ type, count }) => Array.from({ length: count }, () => ({ type })));
  const measureRows = MEASURES.map((m) => {
    const values = measurements.map((x) => x[m.key]).filter((v): v is number => v !== null);
    return { ...m, first: values[0] ?? null, latest: values[values.length - 1] ?? null, count: values.length };
  }).filter((m) => m.count > 0);
  const checkInRows: [string, string][] = [
    ["Energy (1-5)", show(checkIns.energy)],
    ["Mood (1-5)", show(checkIns.mood)],
    ["Sleep", show(checkIns.sleepHours, "h")],
    ["Recovery (1-5)", show(checkIns.recoveryScore)],
    ["Water", show(checkIns.waterLiters, "L")],
    ["Steps", checkIns.steps === null ? "-" : Math.round(checkIns.steps).toLocaleString("en")],
  ];

  return (
    <article aria-label="Progress report" className="report mt-6">
      <div className="no-print mb-3 flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => window.print()} className="btn-primary min-h-11 rounded-lg px-5 text-sm">
          Print or save as PDF
        </button>
        <span className="text-xs text-dim">In the print window, choose "Save as PDF" as the printer.</span>
      </div>

      <header className="border-b border-border pb-3">
        <h3 className="text-2xl">Progress report: {client.name}</h3>
        <p className="mt-1 text-sm text-dim">{rangeText(report.range)}</p>
      </header>

      <h4 className="mt-4 text-lg">Client details</h4>
      <dl className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
        {[
          ["Goal", client.goal],
          ["Level", client.level],
          ["Age", client.age === null ? "-" : String(client.age)],
          ["Starting weight", show(client.weightKg, "kg")],
          ["Height", show(client.heightCm, "cm")],
        ].map(([k, v]) => (
          <div key={k}>
            <dt className="text-dim">{k}</dt>
            <dd className="font-semibold">{v}</dd>
          </div>
        ))}
      </dl>

      <h4 className="mt-5 text-lg">Measurements summary</h4>
      {measureRows.length === 0 ? (
        <p className="mt-1 text-sm text-dim">No measurements in this range.</p>
      ) : (
        <table className="mt-1 w-full text-left text-sm">
          <thead>
            <tr className="text-dim">
              <th className="py-1 font-semibold">Measure</th>
              <th className="py-1 font-semibold">First</th>
              <th className="py-1 font-semibold">Latest</th>
              <th className="py-1 font-semibold">Change</th>
            </tr>
          </thead>
          <tbody>
            {measureRows.map((m) => (
              <tr key={m.key} className="border-t border-border">
                <td className="py-1">{m.label}</td>
                <td className="py-1 font-mono">{show(m.first, m.unit)}</td>
                <td className="py-1 font-mono">{show(m.latest, m.unit)}</td>
                <td className="py-1 font-mono">
                  {m.count < 2 ? "-" : `${(m.latest as number) - (m.first as number) > 0 ? "+" : ""}${round1((m.latest as number) - (m.first as number))} ${m.unit}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h4 className="mt-5 text-lg">Weight and adherence</h4>
      <ProgressCharts logs={logs} assignments={chartAssignments} />

      <h4 className="mt-5 text-lg">Assignments completed</h4>
      <p className="mt-1 text-sm">
        <span className="font-mono text-lg font-semibold">{assignments.done}</span> of{" "}
        <span className="font-mono">{assignments.total}</span> assignments marked Done
      </p>

      <h4 className="mt-5 text-lg">Check-in averages</h4>
      {checkIns.count === 0 ? (
        <p className="mt-1 text-sm text-dim">No daily check-ins in this range.</p>
      ) : (
        <>
          <p className="mt-1 text-xs text-dim">Average of {checkIns.count} daily check-in{checkIns.count === 1 ? "" : "s"}.</p>
          <dl className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
            {checkInRows.map(([k, v]) => (
              <div key={k}>
                <dt className="text-dim">{k}</dt>
                <dd className="font-mono font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </article>
  );
}
