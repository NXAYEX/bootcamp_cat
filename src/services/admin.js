import { run } from "./client";

// Escrituras de configuración: RLS solo las permite al rol admin y cada cambio queda en audit_log por trigger.
const ALLOWED = ["concepts", "country_rules", "validation_rules", "procedure_checklist_items", "payroll_periods", "column_aliases"];

function assertTable(table) {
  if (!ALLOWED.includes(table)) throw new Error(`Tabla no editable: ${table}`);
}

export const updateRow = (table, id, changes) => {
  assertTable(table);
  return run((sb) => sb.from(table).update(changes).eq("id", id).select().single());
};

export const insertRow = (table, row) => {
  assertTable(table);
  return run((sb) => sb.from(table).insert(row).select().single());
};

// user_access apunta a auth.users (no a profiles), por eso se lee en dos consultas y se une aquí.
export async function listUsers() {
  const [profiles, access] = await Promise.all([
    run((sb) => sb.from("profiles").select("id, email, full_name, role").order("email")),
    run((sb) => sb.from("user_access").select("id, user_id, country_code, process, site_id, sites(code)")),
  ]);
  if (profiles.error) return profiles;
  if (access.error) return access;
  return {
    data: profiles.data.map((p) => ({ ...p, user_access: access.data.filter((a) => a.user_id === p.id) })),
    error: null,
  };
}

export const updateUserRole = (userId, role) => run((sb) => sb.from("profiles").update({ role }).eq("id", userId));

export const addAccess = (row) => run((sb) => sb.from("user_access").insert(row));

export const removeAccess = (id) => run((sb) => sb.from("user_access").delete().eq("id", id));

export const listAuditLog = (limit = 100) =>
  run((sb) => sb.from("audit_log").select("id, user_id, action, module, entity, entity_id, details, created_at").order("created_at", { ascending: false }).limit(limit));

export const getQualityMetrics = (countryCode, period) =>
  run((sb) => sb.rpc("quality_metrics", { p_country: countryCode, p_period: period || null }));

export const logEvent = (action, module, entity, entityId, details) =>
  run((sb) => sb.rpc("log_event", { p_action: action, p_module: module, p_entity: entity ?? null, p_entity_id: entityId ?? null, p_details: details ?? {} }));
