// Formato canónico de salida (CLAUDE.md §7.4): mismo esquema para todos los países.
export const CANONICAL_COLUMNS = [
  "country_code",
  "site_code",
  "period",
  "employee_id",
  "national_id",
  "concept_code",
  "date",
  "quantity",
  "unit",
  "source_batch_id",
  "approved_by",
  "approved_at",
];

function cell(value) {
  if (value === null || value === undefined) return "";
  const s = String(value);
  // Evita inyección de fórmulas al abrir el CSV en Excel.
  const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) ? `'${s}` : s;
  return /[",;\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(columns, rows) {
  const lines = [columns.join(",")];
  for (const r of rows) lines.push(columns.map((c) => cell(r[c])).join(","));
  return `${lines.join("\r\n")}\r\n`;
}

export const toCanonicalCsv = (rows) => toCsv(CANONICAL_COLUMNS, rows);

export function downloadText(fileName, text, type = "text/csv;charset=utf-8") {
  const blob = new Blob(["﻿", text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
