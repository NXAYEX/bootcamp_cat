import { validateBatch } from "../lib/validation";
import { todayISO } from "../lib/dates";
import { correctBatch, submitBatch, uploadBatchFile } from "./batches";
import { loadValidationContext } from "./validationContext";

// Corre el mismo motor para archivos, captura móvil y correcciones de filas.
export async function validateRows({ rows, structure, country, site, period, excludeBatchId }) {
  const ctx = await loadValidationContext({ country, site, period, rows, today: todayISO(), excludeBatchId });
  if (ctx.error) return { data: null, error: ctx.error };
  try {
    return { data: validateBatch({ rows, structure, context: ctx.data }), error: null };
  } catch (e) {
    return { data: null, error: { message: `No se pudo validar el lote: ${e.message}` } };
  }
}

// El identificador completo viaja solo para guardarlo en una columna que la API no puede leer;
// en las filas visibles queda enmascarado.
function toDbRows(result) {
  return result.normalizedRows.map((r) => ({
    row_number: r.rowNumber,
    employee_id: r.employeeId,
    employee_code: r.employee_code ?? null,
    national_id: r.national_id ?? null,
    national_id_masked: r.national_id_masked ?? null,
    concept_code: r.concept_code ?? null,
    date: r.date ?? null,
    quantity: Number.isFinite(r.quantity) ? r.quantity : null,
    unit: r.unit ?? null,
    support_ref: r.support_ref ? String(r.support_ref).slice(0, 120) : null,
  }));
}

function toDbFindings(result) {
  return result.findings.map((f) => ({
    row_number: f.rowNumber,
    code: f.code,
    severity: f.severity,
    owner: f.owner,
    field: f.field,
    value: f.value === null || f.value === undefined ? null : String(f.value),
    message: f.message,
  }));
}

export async function sendBatch({ result, country, site, period, source, file }) {
  let filePath = null;
  if (file) {
    const up = await uploadBatchFile({ countryCode: country.code, siteCode: site.code, period, file });
    if (up.error) return { data: null, error: { message: `No se pudo guardar el archivo original: ${up.error.message}` } };
    filePath = up.data.path;
  }
  return submitBatch(
    { site_id: site.id, period, source, file_name: file?.name ?? null, file_path: filePath, fingerprint: result.fingerprint },
    toDbRows(result),
    toDbFindings(result)
  );
}

// Vuelve a validar todo el lote con las filas ya corregidas y guarda el resultado.
// La planta de origen y el periodo no cambian; el lote no se compara contra sí mismo.
export async function saveCorrections({ batch, country, site, rows, edits }) {
  const engineRows = rows.map((r) => ({
    rowNumber: r.row_number,
    national_id: r.national_id,
    employee_code: r.employee_code,
    concept_code: r.concept_code,
    date: r.date,
    quantity: r.quantity,
    unit: r.unit,
    support_ref: r.support_ref,
  }));
  const structure = batch.source === "file" && batch.file_name ? { fileName: batch.file_name, headers: [], missingFields: [], renamed: [] } : null;
  const validated = await validateRows({ rows: engineRows, structure, country, site, period: batch.period, excludeBatchId: batch.id });
  if (validated.error) return validated;
  const saved = await correctBatch(batch.id, toDbRows(validated.data), toDbFindings(validated.data), validated.data.fingerprint, edits);
  if (saved.error) return saved;
  return { data: { disposition: saved.data, counts: validated.data.counts }, error: null };
}
