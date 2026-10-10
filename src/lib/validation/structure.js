import { FIELD_LABELS } from "./catalog.js";
import { isEmpty } from "./normalize.js";

const fieldLabel = (field, ctx) => (field === "national_id" ? ctx.idLabel : FIELD_LABELS[field] || field);

/** STR-001, STR-002, STR-005 (nivel lote). Devuelve true si falta alguna columna obligatoria. */
export function checkStructure(structure, ctx, out) {
  if (!structure) return false;
  const missing = structure.missingFields || [];
  for (const field of missing) {
    out.add("STR-001", { field, params: { fieldLabel: fieldLabel(field, ctx) } });
  }
  for (const { header, field } of structure.renamed || []) {
    out.add("STR-002", { field, value: header, params: { header, fieldLabel: fieldLabel(field, ctx) } });
  }
  const pattern = ctx.rule("file_name_pattern");
  if (structure.fileName && typeof pattern === "string") {
    let ok = true;
    try {
      ok = new RegExp(pattern).test(structure.fileName);
    } catch {
      ok = true;
    }
    if (!ok) out.add("STR-005", { field: "fileName", value: structure.fileName, params: { fileName: structure.fileName } });
  }
  return missing.length > 0;
}

/** STR-003: lote sin filas. */
export function checkEmpty(rows, out) {
  if (!rows.length) {
    out.add("STR-003", {});
    return true;
  }
  return false;
}

/** STR-004: tipo de dato inválido o campo obligatorio vacío (un hallazgo por fila). */
export function checkRowTypes(rows, ctx, out) {
  for (const r of rows) {
    const raw = r.raw;
    let problem = null;
    if (isEmpty(raw.national_id) && isEmpty(raw.employee_code)) {
      problem = { field: "national_id", value: "", detail: `Falta el ${ctx.idLabel} o el código de empleado.` };
    } else if (!r.conceptCode) {
      problem = { field: "concept_code", value: "", detail: "El concepto es obligatorio." };
    } else if (isEmpty(raw.date)) {
      problem = { field: "date", value: "", detail: "La fecha es obligatoria." };
    } else if (!r.date) {
      problem = { field: "date", value: String(raw.date), detail: "Use el formato AAAA-MM-DD o DD-MM-AAAA." };
    } else if (isEmpty(raw.quantity)) {
      problem = { field: "quantity", value: "", detail: "La cantidad es obligatoria." };
    } else if (r.quantity === null) {
      problem = { field: "quantity", value: String(raw.quantity), detail: "La cantidad debe ser numérica." };
    } else if (r.quantity <= 0) {
      problem = { field: "quantity", value: String(raw.quantity), detail: "La cantidad debe ser mayor que cero." };
    }
    if (!problem) continue;
    r.flags.add("STR-004");
    out.add("STR-004", {
      rowNumber: r.rowNumber,
      field: problem.field,
      value: problem.value,
      params: { fieldLabel: fieldLabel(problem.field, ctx), detail: problem.detail },
    });
  }
}
