import { UNIT_LABELS } from "./catalog.js";

/** CON-001 (desconocido), CON-002 (solo existe en otro país), CON-003 (unidad distinta). */
export function checkConcepts(rows, ctx, out) {
  for (const r of rows) {
    if (!r.conceptCode) continue;
    if (!r.concept) {
      const others = ctx.otherConcepts.get(r.conceptCode);
      if (others && others.size) {
        r.flags.add("CON-002");
        out.add("CON-002", {
          rowNumber: r.rowNumber,
          field: "concept_code",
          value: r.conceptCode,
          params: { otherCountries: [...others].sort().join(", ") },
        });
      } else {
        r.flags.add("CON-001");
        out.add("CON-001", { rowNumber: r.rowNumber, field: "concept_code", value: r.conceptCode });
      }
      continue;
    }
    if (r.unit && r.concept.unit && r.unit !== r.concept.unit) {
      r.flags.add("CON-003");
      out.add("CON-003", {
        rowNumber: r.rowNumber,
        field: "unit",
        value: String(r.raw.unit).trim(),
        params: { conceptCode: r.conceptCode, expectedUnit: UNIT_LABELS[r.concept.unit] || r.concept.unit },
      });
    }
  }
}
