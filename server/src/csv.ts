// CSV export helpers (Prompt 70). One file per type, UTF-8 (with a BOM so Excel reads names right),
// CRLF line ends, dates as YYYY-MM-DD. The column lists are the export shape: they are listed in
// CLAUDE.md ("CSV exports"), so do not rename them.

export const CSV_COLUMNS = {
  progress: ["date", "weightKg", "adherence", "workoutsDone", "note"],
  measurements: ["date", "waistCm", "chestCm", "armCm", "hipCm", "bodyFatPercent", "note"],
  payments: ["paidOn", "amount", "method", "note"],
  assignments: ["date", "type", "title", "details", "reasoning", "source", "status"],
  roster: ["name", "goal", "level", "planName", "planStatus", "billingCycle", "priceAmount", "nextDueDate"],
} as const;

export type ClientExportType = "progress" | "measurements" | "payments" | "assignments";
export const CLIENT_EXPORT_TYPES: readonly ClientExportType[] = ["progress", "measurements", "payments", "assignments"];

type Cell = string | number | null | undefined;

function cell(value: Cell): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return String(value);
  // A text cell starting with = + - @ would run as a formula in a spreadsheet: a leading ' keeps it text.
  const text = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Header row plus one line per row, in the order of `columns`. */
export function toCsv(columns: readonly string[], rows: readonly object[]): string {
  const lines = [columns.map(cell).join(","), ...rows.map((row) => columns.map((c) => cell((row as Record<string, Cell>)[c])).join(","))];
  return `﻿${lines.join("\r\n")}\r\n`;
}
