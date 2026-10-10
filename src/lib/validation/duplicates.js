import { employeeKey, employeeLabel } from "./prepare.js";

/** FNV-1a de 32 bits en hexadecimal (8 caracteres). */
export function fnv1a(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/**
 * Huella del lote: FNV-1a de las filas normalizadas (empleado|fecha|concepto|cantidad|unidad) ordenadas.
 * Acepta filas normalizadas de validateBatch.
 */
export function fingerprintRows(normalizedRows = []) {
  const lines = normalizedRows.map((r) =>
    [
      r.employee_code || r.national_id || "",
      r.date || "",
      r.concept_code || "",
      r.quantity === null || r.quantity === undefined ? "" : String(r.quantity),
      r.unit || "",
    ].join("|"),
  );
  lines.sort();
  return fnv1a(lines.join("\n"));
}

/** DUP-001: misma persona, fecha y concepto repetidos dentro del archivo. */
export function checkInFileDuplicates(rows, out) {
  const first = new Map();
  for (const r of rows) {
    if (!r.date || !r.conceptCode) continue;
    if (!r.employee && !r.nationalId && !r.employeeCodeRaw) continue;
    const key = `${employeeKey(r)}|${r.date}|${r.conceptCode}`;
    if (!first.has(key)) {
      first.set(key, r.rowNumber);
      continue;
    }
    r.flags.add("DUP-001");
    out.add("DUP-001", {
      rowNumber: r.rowNumber,
      field: "concept_code",
      value: r.conceptCode,
      params: { employeeCode: employeeLabel(r), conceptCode: r.conceptCode, date: r.date, firstRow: first.get(key) },
    });
  }
}

/** DUP-003: la novedad ya fue informada en otro lote del periodo (clave código|fecha|concepto). */
export function checkPriorRows(rows, ctx, out) {
  if (!ctx.priorRowKeys.size) return;
  for (const r of rows) {
    const code = r.employee?.employeeCode || r.employeeCodeRaw;
    if (!code || !r.date || !r.conceptCode) continue;
    if (!ctx.priorRowKeys.has(`${code}|${r.date}|${r.conceptCode}`)) continue;
    out.add("DUP-003", {
      rowNumber: r.rowNumber,
      field: "concept_code",
      value: r.conceptCode,
      params: { employeeCode: code, conceptCode: r.conceptCode, date: r.date },
    });
  }
}

/** DUP-002: lote idéntico (misma huella) ya enviado. */
export function checkPriorFingerprint(fingerprint, ctx, out) {
  if (ctx.priorFingerprints.has(fingerprint)) {
    out.add("DUP-002", { field: "fingerprint", value: fingerprint, params: { fingerprint } });
  }
}
