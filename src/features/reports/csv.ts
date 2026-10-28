import type { ReportColumn, ReportRow } from "./definitions"

// Text a spreadsheet would run as a formula (OWASP "CSV Injection").
const FORMULA_START = /^[=+\-@\t\r]/

function cell(value: ReportRow[string] | undefined) {
  if (value == null) return ""
  let text = String(value)
  // Only text is guarded: amounts are numbers, so a negative amount stays a number.
  if (typeof value === "string" && FORMULA_START.test(text)) text = `'${text}`
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/**
 * CSV with the given columns only, so masked cost columns never reach the file
 * (spec 0015 AC-4). Starts with a UTF-8 byte order mark so Excel reads names
 * outside ASCII correctly.
 */
export function toCsv(rows: ReportRow[], columns: Pick<ReportColumn, "key" | "label">[]) {
  return "﻿" + [columns.map((column) => cell(column.label)).join(","), ...rows.map((row) => columns.map((column) => cell(row[column.key])).join(","))].join("\n")
}
