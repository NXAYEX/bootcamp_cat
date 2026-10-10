import { checkConcepts } from "./concepts.js";
import { checkCoherence } from "./coherence.js";
import { checkInFileDuplicates, checkPriorFingerprint, checkPriorRows, fingerprintRows } from "./duplicates.js";
import { computeDisposition, countFindings, createCollector } from "./findings.js";
import { checkIdentity } from "./identity.js";
import { checkLegal } from "./legal.js";
import { checkClosedPeriod, checkRowPeriod } from "./period.js";
import { buildInternalContext, prepareRows } from "./prepare.js";
import { checkRange } from "./range.js";
import { checkEmpty, checkRowTypes, checkStructure } from "./structure.js";

function toNormalized(r) {
  return {
    rowNumber: r.rowNumber,
    employeeId: r.employee?.id ?? null,
    employee_code: r.employee?.employeeCode ?? r.employeeCodeRaw ?? null,
    national_id: r.nationalId,
    national_id_masked: r.nationalIdMasked,
    concept_code: r.conceptCode,
    date: r.date,
    quantity: r.quantity,
    unit: r.unit ?? r.concept?.unit ?? null,
    support_ref: r.supportRef,
  };
}

/**
 * Motor de validación puro (design.md §4.1).
 * @param {{ rows: object[], structure?: object|null, context: object }} input
 * @returns {{ findings, disposition, counts, fingerprint, normalizedRows }}
 */
export function validateBatch({ rows = [], structure = null, context = {} } = {}) {
  const ctx = buildInternalContext(context);
  const out = createCollector(ctx);
  const prepared = prepareRows(rows, ctx);

  const missingColumns = checkStructure(structure, ctx, out);
  const empty = checkEmpty(prepared, out);
  checkClosedPeriod(ctx, out);

  // Si falta una columna obligatoria no se evalúan las filas: todas fallarían por la misma causa.
  if (!missingColumns && !empty) {
    checkRowTypes(prepared, ctx, out);
    checkConcepts(prepared, ctx, out);
    checkIdentity(prepared, ctx, out);
    checkRowPeriod(prepared, ctx, out);
    checkInFileDuplicates(prepared, out);
    checkPriorRows(prepared, ctx, out);
    checkCoherence(prepared, ctx, out);
    checkLegal(prepared, ctx, out);
    checkRange(prepared, ctx, out);
  }

  const normalizedRows = prepared.map(toNormalized);
  const fingerprint = fingerprintRows(normalizedRows);
  if (!empty) checkPriorFingerprint(fingerprint, ctx, out);

  const findings = out.sorted();
  return {
    findings,
    disposition: computeDisposition(findings),
    counts: countFindings(findings),
    fingerprint,
    normalizedRows,
  };
}
