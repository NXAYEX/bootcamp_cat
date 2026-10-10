import { validateBatch } from "../lib/validation";
import { todayISO } from "../lib/dates";
import { submitBatch, uploadBatchFile } from "./batches";
import { loadValidationContext } from "./validationContext";

// Corre el mismo motor para archivos y captura móvil.
export async function validateRows({ rows, structure, country, site, period }) {
  const ctx = await loadValidationContext({ country, site, period, rows, today: todayISO() });
  if (ctx.error) return { data: null, error: ctx.error };
  try {
    return { data: validateBatch({ rows, structure, context: ctx.data }), error: null };
  } catch (e) {
    return { data: null, error: { message: `No se pudo validar el lote: ${e.message}` } };
  }
}

// Envía el lote validado. El RUT completo nunca se guarda en las filas: solo enmascarado.
export async function sendBatch({ result, country, site, period, source, file }) {
  let filePath = null;
  if (file) {
    const up = await uploadBatchFile({ countryCode: country.code, siteCode: site.code, period, file });
    if (up.error) return { data: null, error: { message: `No se pudo guardar el archivo original: ${up.error.message}` } };
    filePath = up.data.path;
  }
  const rows = result.normalizedRows.map((r) => ({
    row_number: r.rowNumber,
    employee_id: r.employeeId,
    employee_code: r.employee_code ?? null,
    national_id_masked: r.national_id_masked ?? null,
    concept_code: r.concept_code ?? null,
    date: r.date ?? null,
    quantity: Number.isFinite(r.quantity) ? r.quantity : null,
    unit: r.unit ?? null,
    support_ref: r.support_ref ? String(r.support_ref).slice(0, 120) : null,
  }));
  const findings = result.findings.map((f) => ({
    row_number: f.rowNumber,
    code: f.code,
    severity: f.severity,
    owner: f.owner,
    field: f.field,
    value: f.value === null || f.value === undefined ? null : String(f.value),
    message: f.message,
  }));
  return submitBatch(
    { site_id: site.id, period, source, file_name: file?.name ?? null, file_path: filePath, fingerprint: result.fingerprint },
    rows,
    findings
  );
}
