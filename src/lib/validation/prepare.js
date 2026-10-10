import { isEmpty, normalizeCode, normalizeDate, normalizeQuantity, normalizeUnit } from "./normalize.js";
import { maskNationalId, normalizeNationalId } from "./nationalId.js";
import { ruleValue } from "./rules.js";

/** Contexto interno derivado del contexto público de validateBatch. */
export function buildInternalContext(context = {}) {
  const country = context.country || {};
  const validator = country.nationalIdValidator || "rut_mod11";
  const countryCode = country.code ?? null;
  const period = context.period || null;
  const periodStart = period ? `${period}-01` : context.today || null;

  const byNationalId = new Map();
  const byCode = new Map();
  for (const e of context.employees || []) {
    const nid = normalizeNationalId(e.nationalId, validator);
    if (nid) byNationalId.set(nid, e);
    if (e.employeeCode) byCode.set(String(e.employeeCode).trim().toUpperCase(), e);
  }

  const ownConcepts = new Map();
  const otherConcepts = new Map();
  for (const c of context.concepts || []) {
    const code = normalizeCode(c.code);
    if (!code) continue;
    if (c.countryCode === countryCode) {
      if (c.active !== false) ownConcepts.set(code, c);
    } else if (c.active !== false) {
      if (!otherConcepts.has(code)) otherConcepts.set(code, new Set());
      otherConcepts.get(code).add(c.countryCode);
    }
  }

  const rules = context.rules || [];
  return {
    today: context.today || new Date().toISOString().slice(0, 10),
    period,
    periodStart,
    countryCode,
    validator,
    idRegex: country.nationalIdRegex || null,
    idLabel: country.nationalIdLabel || "identificador",
    siteCode: context.site?.code ?? null,
    validationRules: context.validationRules || [],
    rules,
    rule: (key, date = periodStart) => ruleValue(rules, key, date),
    byNationalId,
    byCode,
    ownConcepts,
    otherConcepts,
    closedPeriods: new Set(context.closedPeriods || []),
    priorFingerprints: new Set(context.priorFingerprints || []),
    priorRowKeys: new Set(context.priorRowKeys || []),
    history: context.history || { employees: {}, sites: {} },
  };
}

/** Normaliza cada fila cruda sin emitir hallazgos; las verificaciones marcan `flags`. */
export function prepareRows(rows, ctx) {
  return (rows || []).map((raw, i) => {
    const conceptCode = normalizeCode(raw.concept_code);
    const concept = conceptCode ? ctx.ownConcepts.get(conceptCode) || null : null;
    const nationalId = normalizeNationalId(raw.national_id, ctx.validator);
    return {
      rowNumber: raw.rowNumber ?? i + 2,
      raw,
      conceptCode,
      concept,
      category: concept?.category ?? null,
      date: normalizeDate(raw.date),
      quantity: normalizeQuantity(raw.quantity),
      unit: normalizeUnit(raw.unit),
      nationalId,
      nationalIdMasked: maskNationalId(raw.national_id, ctx.validator),
      employeeCodeRaw: isEmpty(raw.employee_code) ? null : String(raw.employee_code).trim().toUpperCase(),
      supportRef: isEmpty(raw.support_ref) ? null : String(raw.support_ref).trim(),
      employee: null,
      flags: new Set(),
    };
  });
}

export function employeeKey(r) {
  if (r.employee) return `emp:${r.employee.employeeCode}`;
  if (r.nationalId) return `nid:${r.nationalId}`;
  if (r.employeeCodeRaw) return `code:${r.employeeCodeRaw}`;
  return `row:${r.rowNumber}`;
}

/** Código visible del trabajador (nunca el identificador completo). */
export function employeeLabel(r) {
  return r.employee?.employeeCode || r.employeeCodeRaw || r.nationalIdMasked || "—";
}

// Elegibilidad según la precedencia de design.md §4.2.
const hasAny = (r, codes) => codes.some((c) => r.flags.has(c));

export function eligibleCoherence(r) {
  return !hasAny(r, ["STR-004", "CON-001", "CON-002"]) && Boolean(r.concept && r.date) && r.quantity > 0;
}

export function eligibleLegal(r) {
  return eligibleCoherence(r) && !hasAny(r, ["IDN-001", "IDN-002"]);
}

/** Agrupa en un Map conservando el orden de inserción. */
export function groupBy(items, keyFn) {
  const map = new Map();
  for (const item of items) {
    const key = keyFn(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return map;
}

export const byDateThenRow = (a, b) => a.date.localeCompare(b.date) || a.rowNumber - b.rowNumber;

export const round2 = (n) => Math.round(n * 100) / 100;
