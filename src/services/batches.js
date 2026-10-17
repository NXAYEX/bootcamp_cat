import { run } from "./client";

const BATCH_FIELDS =
  "id, country_code, site_id, period, source, file_name, file_path, fingerprint, revision, row_count, status, disposition, initial_disposition, approved_disposition, decision_note, created_by, created_at, decided_at, export_id, sites(code, name)";

export const listBatches = ({ period, siteId, status } = {}) =>
  run((sb) => {
    let q = sb.from("batches").select(BATCH_FIELDS).order("created_at", { ascending: false }).limit(500);
    if (period) q = q.eq("period", period);
    if (siteId) q = q.eq("site_id", siteId);
    if (status) q = q.eq("status", status);
    return q;
  });

export const getBatch = (id) => run((sb) => sb.from("batches").select(BATCH_FIELDS).eq("id", id).maybeSingle());

export const getBatchRows = (batchId) =>
  run((sb) =>
    sb
      .from("batch_rows")
      .select("id, row_number, employee_code, national_id_masked, concept_code, date, quantity, unit, support_ref")
      .eq("batch_id", batchId)
      .order("row_number")
      .limit(20000)
  );

const FINDING_FIELDS =
  "id, batch_id, site_id, row_number, code, severity, owner, field, value, message, status, resolution_note, resolved_at, created_at";

export const getBatchFindings = (batchId) =>
  run((sb) => sb.from("findings").select(FINDING_FIELDS).eq("batch_id", batchId).order("row_number", { nullsFirst: true }).limit(20000));

export const listOpenFindings = ({ period, siteId, severity, owner, status } = {}) =>
  run((sb) => {
    let q = sb
      .from("findings")
      .select(`${FINDING_FIELDS}, batches!inner(period, status, file_name, source, sites(code, name))`)
      .eq("batches.status", "validated")
      .neq("severity", "info")
      .order("created_at", { ascending: false })
      .limit(1000);
    if (period) q = q.eq("batches.period", period);
    if (siteId) q = q.eq("site_id", siteId);
    if (severity) q = q.eq("severity", severity);
    if (owner) q = q.eq("owner", owner);
    q = status ? q.eq("status", status) : q.in("status", ["open", "in_correction"]);
    return q;
  });

// Datos previos del periodo para DUP-002 (huella) y DUP-003 (novedad repetida entre lotes).
// excludeBatchId: al volver a validar un lote corregido no debe compararse contra sí mismo.
export async function getPriorBatchData({ siteId, period, excludeBatchId }) {
  const batches = await run((sb) =>
    sb.from("batches").select("id, fingerprint, status").eq("site_id", siteId).eq("period", period).neq("status", "rejected")
  );
  if (batches.error) return batches;
  batches.data = batches.data.filter((b) => b.id !== excludeBatchId);
  const ids = batches.data.map((b) => b.id);
  if (ids.length === 0) return { data: { fingerprints: [], rowKeys: [] }, error: null };
  const rows = await run((sb) => sb.from("batch_rows").select("employee_code, date, concept_code").in("batch_id", ids).limit(50000));
  if (rows.error) return rows;
  return {
    data: {
      fingerprints: batches.data.map((b) => b.fingerprint).filter(Boolean),
      rowKeys: rows.data.map((r) => `${r.employee_code}|${r.date}|${r.concept_code}`),
    },
    error: null,
  };
}

export const submitBatch = (batch, rows, findings) =>
  run((sb) => sb.rpc("submit_batch", { p_batch: batch, p_rows: rows, p_findings: findings }));

export const listRowEdits = (batchId) =>
  run((sb) => sb.from("batch_row_edits").select("id, row_number, field, old_value, new_value, created_at").eq("batch_id", batchId).order("created_at", { ascending: false }).limit(500));

// Filas con el identificador completo: la función valida el acceso y deja registro en audit_log.
export const getEditableRows = (batchId, purpose = "edit") =>
  run((sb) => sb.rpc("get_batch_rows_editable", { p_batch_id: batchId, p_purpose: purpose }));

// revision: versión del lote que el usuario abrió; si otra persona guardó antes, la base de datos rechaza el cambio.
export const correctBatch = (batchId, revision, rows, findings, fingerprint, edits) =>
  run((sb) =>
    sb.rpc("correct_batch", { p_batch_id: batchId, p_revision: revision, p_rows: rows, p_findings: findings, p_fingerprint: fingerprint, p_edits: edits })
  );

export const updateFindingStatus = (findingId, status, note) =>
  run((sb) => sb.rpc("update_finding_status", { p_finding_id: findingId, p_status: status, p_note: note ?? null }));

export const approveBatch = (batchId, note) => run((sb) => sb.rpc("approve_batch", { p_batch_id: batchId, p_note: note ?? null }));

export const rejectBatch = (batchId, note) => run((sb) => sb.rpc("reject_batch", { p_batch_id: batchId, p_note: note }));

export async function uploadBatchFile({ countryCode, siteCode, period, file }) {
  const ext = (file.name.split(".").pop() || "bin").toLowerCase();
  const path = `${countryCode}/${siteCode}/${period}/${crypto.randomUUID()}.${ext}`;
  const res = await run((sb) => sb.storage.from("batch-files").upload(path, file, { upsert: false, contentType: file.type || undefined }));
  return res.error ? res : { data: { path }, error: null };
}

export const getBatchFileUrl = (path) => run((sb) => sb.storage.from("batch-files").createSignedUrl(path, 60));

export const listExports = () =>
  run((sb) => sb.from("exports").select("id, country_code, period, batch_ids, row_count, created_at").order("created_at", { ascending: false }).limit(100));

export const exportBatches = (batchIds) => run((sb) => sb.rpc("export_batches", { p_batch_ids: batchIds }));

export const exportRows = (exportId) => run((sb) => sb.rpc("export_rows", { p_export_id: exportId }));
