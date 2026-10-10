// Normalización de valores crudos (tal como vienen de Excel/CSV) a tipos del motor.

const DAY_MS = 86400000;
// Excel cuenta días desde 1899-12-30 (incluye el falso 29-02-1900; irrelevante para fechas actuales).
const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

export function isEmpty(value) {
  return value === null || value === undefined || String(value).trim() === "";
}

export function normalizeText(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[\s_]+/g, " ")
    .trim();
}

function isoFromParts(y, m, d) {
  if (!(y >= 1900 && y <= 9999 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date.toISOString().slice(0, 10);
}

export function excelSerialToIso(serial) {
  if (!Number.isFinite(serial) || serial < 1 || serial > 2958465) return null;
  return new Date(EXCEL_EPOCH + Math.floor(serial) * DAY_MS).toISOString().slice(0, 10);
}

/** Devuelve "YYYY-MM-DD" o null si la fecha es ilegible. */
export function normalizeDate(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return isoFromParts(value.getFullYear(), value.getMonth() + 1, value.getDate());
  }
  if (typeof value === "number") return excelSerialToIso(value);
  const s = String(value).trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T ].*)?$/);
  if (m) return isoFromParts(Number(m[1]), Number(m[2]), Number(m[3]));
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (m) return isoFromParts(Number(m[3]), Number(m[2]), Number(m[1]));
  // Serial de Excel exportado como texto (por ejemplo, desde un CSV).
  if (/^\d{5}(\.\d+)?$/.test(s)) return excelSerialToIso(Number(s));
  return null;
}

/** Devuelve un número o null si no es numérico. Acepta coma decimal ("1,5"). */
export function normalizeQuantity(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  let s = String(value).trim().replace(/\s+/g, "");
  if (!s) return null;
  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
  else s = s.replace(",", ".");
  if (!/^[-+]?\d+(\.\d+)?$/.test(s)) return null;
  return Number(s);
}

const UNIT_SYNONYMS = {
  hours: ["hours", "hour", "horas", "hora", "hrs", "hr", "h", "hh"],
  days: ["days", "day", "dias", "dia", "d"],
};
const UNIT_LOOKUP = Object.fromEntries(
  Object.entries(UNIT_SYNONYMS).flatMap(([unit, list]) => list.map((s) => [s, unit])),
);

/** "horas" → "hours", "días" → "days"; vacío → null; desconocido → texto normalizado. */
export function normalizeUnit(value) {
  if (isEmpty(value)) return null;
  const key = normalizeText(value).replace(/\./g, "");
  return UNIT_LOOKUP[key] ?? key;
}

export function normalizeCode(value) {
  if (isEmpty(value)) return null;
  return String(value).trim().toUpperCase();
}

// ---------- utilidades de fechas ISO ----------

const toUtc = (iso) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));

export function addDays(iso, days) {
  return new Date(toUtc(iso) + days * DAY_MS).toISOString().slice(0, 10);
}

/** 0 = domingo … 6 = sábado. */
export function weekday(iso) {
  return new Date(toUtc(iso)).getUTCDay();
}

/** Semana ISO 8601, por ejemplo "2026-W38". */
export function isoWeek(iso) {
  const d = new Date(toUtc(iso));
  const dow = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dow);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart) / DAY_MS + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
