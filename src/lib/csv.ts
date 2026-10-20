/**
 * CSV for spreadsheets (RFC 4180, CRLF line ends). Starts with a byte order mark so
 * Excel opens UTF-8 correctly (names like "田中" or "Dvořák"), and defuses cells that
 * a spreadsheet would run as a formula: a customer named "=HYPERLINK(…)" must stay text.
 */
export function toCsv(rows: readonly (readonly (string | number | null)[])[]): string {
  return "﻿" + rows.map((row) => row.map(cell).join(",")).join("\r\n") + "\r\n";
}

function cell(value: string | number | null): string {
  if (value === null) return "";
  if (typeof value === "number") return String(value);
  // A leading apostrophe makes spreadsheets treat the cell as text (OWASP: CSV injection).
  const text = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
