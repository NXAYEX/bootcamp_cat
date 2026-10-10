import { run } from "./client";

export const listProcedures = () =>
  run((sb) =>
    sb
      .from("procedures")
      .select("id, country_code, site_id, title, file_name, created_at, sites(code, name), procedure_audits(id, score, method, created_at)")
      .order("created_at", { ascending: false })
      .limit(200)
  );

export const getProcedure = (id) =>
  run((sb) => sb.from("procedures").select("id, country_code, site_id, title, file_name, file_path, content_text, created_at, sites(code, name)").eq("id", id).maybeSingle());

export const getLatestAudit = (procedureId) =>
  run((sb) =>
    sb
      .from("procedure_audits")
      .select("id, method, score, created_at, procedure_findings(id, item_code, result, evidence_quote, question, suggested_text, source, confidence, human_result)")
      .eq("procedure_id", procedureId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
  );

export async function uploadProcedureFile({ countryCode, siteCode, file }) {
  const ext = (file.name.split(".").pop() || "bin").toLowerCase();
  const path = `${countryCode}/${siteCode || "general"}/${crypto.randomUUID()}.${ext}`;
  const res = await run((sb) => sb.storage.from("procedures").upload(path, file, { upsert: false }));
  return res.error ? res : { data: { path }, error: null };
}

export const createProcedure = ({ countryCode, siteId, title, fileName, filePath, content }) =>
  run((sb) =>
    sb.rpc("create_procedure", {
      p_country: countryCode,
      p_site_id: siteId || null,
      p_title: title,
      p_file_name: fileName,
      p_file_path: filePath,
      p_content: content,
    })
  );

export const saveProcedureAudit = (procedureId, method, score, findings) =>
  run((sb) => sb.rpc("save_procedure_audit", { p_procedure_id: procedureId, p_method: method, p_score: score, p_findings: findings }));

export const reviewProcedureFinding = (findingId, humanResult) =>
  run((sb) => sb.rpc("review_procedure_finding", { p_finding_id: findingId, p_human_result: humanResult }));
