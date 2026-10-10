import { CATALOG_BY_CODE } from "./catalog.js";

/**
 * Valor de una regla del país vigente en `date` ("YYYY-MM-DD").
 * Si hay más de una fila vigente, gana la de validFrom más reciente.
 * Devuelve number (valueNumeric), string (valueText) o null.
 */
export function ruleValue(rules, key, date) {
  const candidates = (rules || []).filter(
    (r) =>
      r.ruleKey === key &&
      (!date || ((!r.validFrom || r.validFrom <= date) && (!r.validTo || r.validTo >= date))),
  );
  if (!candidates.length) return null;
  candidates.sort((a, b) => String(b.validFrom || "").localeCompare(String(a.validFrom || "")));
  const r = candidates[0];
  if (r.valueNumeric !== null && r.valueNumeric !== undefined && r.valueNumeric !== "") {
    const n = Number(r.valueNumeric);
    return Number.isFinite(n) ? n : null;
  }
  return r.valueText ?? null;
}

/**
 * Configuración efectiva de un código: la fila del país gana a la global (countryCode null).
 * Sin fila configurada se usa el valor por defecto del catálogo.
 */
export function resolveValidationRule(validationRules, code, countryCode) {
  let global = null;
  let country = null;
  for (const r of validationRules || []) {
    if (r.code !== code) continue;
    if (r.countryCode === null || r.countryCode === undefined) global = r;
    else if (r.countryCode === countryCode) country = r;
  }
  const row = country || global;
  const fallback = CATALOG_BY_CODE[code] || { severity: "warning", owner: "central" };
  if (!row) return { code, severity: fallback.severity, owner: fallback.owner, active: true, messageTemplate: null };
  return {
    code,
    severity: row.severity || fallback.severity,
    owner: row.owner || fallback.owner,
    active: row.active !== false,
    messageTemplate: row.messageTemplate || null,
  };
}
