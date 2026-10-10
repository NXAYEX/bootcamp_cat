import { weekday } from "./normalize.js";
import { eligibleCoherence, employeeKey, groupBy } from "./prepare.js";

/**
 * COH-001…004. Se cruzan categorías de concepto (nunca códigos fijos) de un mismo trabajador
 * en la misma fecha. El hallazgo se reporta en la fila de horas extra (COH-001/002) o de licencia (COH-003).
 */
export function checkCoherence(rows, ctx, out) {
  const eligible = rows.filter(eligibleCoherence);
  const groups = groupBy(eligible, (r) => `${employeeKey(r)}|${r.date}`);

  for (const dayRows of groups.values()) {
    const cats = new Set(dayRows.map((r) => r.category));
    for (const r of dayRows) {
      const params = { date: r.date, conceptCode: r.conceptCode };
      if (r.category === "overtime" && cats.has("vacation")) {
        out.add("COH-001", { rowNumber: r.rowNumber, field: "concept_code", value: r.conceptCode, params });
      }
      if (r.category === "overtime" && cats.has("absence")) {
        out.add("COH-002", { rowNumber: r.rowNumber, field: "concept_code", value: r.conceptCode, params });
      }
      if (r.category === "medical_leave" && cats.has("vacation")) {
        out.add("COH-003", { rowNumber: r.rowNumber, field: "concept_code", value: r.conceptCode, params });
      }
    }
  }

  for (const r of eligible) {
    if (r.category !== "vacation") continue;
    if (Number(ctx.rule("vacation_business_days_only", r.date)) !== 1) continue;
    const dow = weekday(r.date);
    if (dow === 0 || dow === 6) {
      out.add("COH-004", { rowNumber: r.rowNumber, field: "date", value: r.date, params: { date: r.date } });
    }
  }
}
