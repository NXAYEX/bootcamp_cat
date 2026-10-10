import { catalogOrder } from "./catalog.js";
import { buildMessage } from "./messages.js";
import { resolveValidationRule } from "./rules.js";

/** Acumula hallazgos aplicando severidad, responsable, activación y plantilla de cada código. */
export function createCollector(ctx) {
  const findings = [];
  const seen = new Set();
  const resolved = {};

  const config = (code) => {
    if (!resolved[code]) resolved[code] = resolveValidationRule(ctx.validationRules, code, ctx.countryCode);
    return resolved[code];
  };

  return {
    findings,
    add(code, { rowNumber = null, field = null, value = null, params = {} } = {}) {
      const rule = config(code);
      if (!rule.active) return;
      // Un hallazgo de fila se reporta una sola vez por fila y código.
      if (rowNumber !== null) {
        const key = `${code}|${rowNumber}`;
        if (seen.has(key)) return;
        seen.add(key);
      }
      const fullParams = { idLabel: ctx.idLabel, period: ctx.period, site: ctx.siteCode, value, ...params };
      findings.push({
        code,
        severity: rule.severity,
        owner: rule.owner,
        rowNumber,
        field,
        value: value === null || value === undefined ? null : String(value),
        message: buildMessage(code, rule.messageTemplate, fullParams),
        params: fullParams,
      });
    },
    sorted() {
      return [...findings].sort((a, b) => {
        const ra = a.rowNumber === null ? -1 : a.rowNumber;
        const rb = b.rowNumber === null ? -1 : b.rowNumber;
        return ra - rb || catalogOrder(a.code) - catalogOrder(b.code);
      });
    },
  };
}

/** block si hay bloqueantes; load_with_warnings si hay advertencias; load en otro caso. */
export function computeDisposition(findings = []) {
  if (findings.some((f) => f.severity === "blocking")) return "block";
  if (findings.some((f) => f.severity === "warning")) return "load_with_warnings";
  return "load";
}

export function countFindings(findings = []) {
  const counts = { blocking: 0, warning: 0, info: 0 };
  for (const f of findings) if (f.severity in counts) counts[f.severity]++;
  return counts;
}
