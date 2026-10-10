// Prueba de alcance contra la API REST de Supabase (no pasa por la interfaz).
// Inicia sesión con cada usuario de prueba y verifica qué filas devuelve cada tabla.
// Uso: node --env-file=.env.local scripts/rls-check.mjs
// Requiere VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY y TEST_USERS_PASSWORD (la misma contraseña para los usuarios de prueba).
import { createClient } from "@supabase/supabase-js";

const url = process.env.VITE_SUPABASE_URL;
const anon = process.env.VITE_SUPABASE_ANON_KEY;
const password = process.env.TEST_USERS_PASSWORD;
if (!url || !anon || !password) {
  process.stderr.write("Faltan VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY o TEST_USERS_PASSWORD\n");
  process.exit(1);
}

const results = [];
const check = (user, name, ok, detail) => results.push({ user, name, ok, detail });

async function asUser(email) {
  const sb = createClient(url, anon, { auth: { persistSession: false } });
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`${email}: ${error.message}`);
  return sb;
}

async function siteCodesOf(sb, table) {
  const { data, error } = await sb.from(table).select("site_id, sites(code)").limit(5000);
  if (error) return { error: error.message };
  return { codes: [...new Set(data.map((r) => r.sites?.code))].sort() };
}

async function countOf(sb, table) {
  const { count, error } = await sb.from(table).select("*", { count: "exact", head: true });
  return error ? `error: ${error.message}` : count;
}

// 1) Anónimo: no ve nada.
{
  const sb = createClient(url, anon, { auth: { persistSession: false } });
  for (const t of ["employees", "batches", "findings", "profiles", "user_access", "audit_log", "procedures", "concepts"]) {
    const { data, error } = await sb.from(t).select("id").limit(1);
    check("anon", `${t} sin sesión`, Boolean(error) || data.length === 0, error ? error.message : `${data.length} filas`);
  }
}

// 2) Supervisores: solo su planta.
for (const [email, site] of [["sup.stg@validador.test", "CL-STG"], ["sup.anf@validador.test", "CL-ANF"]]) {
  const sb = await asUser(email);
  for (const t of ["employees", "batches", "findings", "batch_rows"]) {
    const r = await siteCodesOf(sb, t);
    check(email, `${t} solo de ${site}`, !r.error && r.codes.every((c) => c === site), r.error || `plantas: ${r.codes.join(", ") || "(sin filas)"}`);
  }
  const rut = await sb.from("employees").select("national_id").limit(1);
  check(email, "RUT completo no legible", Boolean(rut.error), rut.error ? rut.error.message : "¡devolvió national_id!");
  const other = await sb.from("employees").select("id").neq("country_code", "CL").limit(1);
  check(email, "sin empleados de otro país", !other.error && other.data.length === 0, `${other.data?.length ?? other.error?.message}`);
  const procs = await sb.from("procedures").select("id").limit(1);
  check(email, "no ve procedimientos", !procs.error && procs.data.length === 0, `${procs.data?.length ?? procs.error?.message}`);
  const audit = await sb.from("audit_log").select("id").limit(1);
  check(email, "no ve audit_log", !audit.error && audit.data.length === 0, `${audit.data?.length ?? audit.error?.message}`);
  const profiles = await sb.from("profiles").select("email");
  check(email, "solo ve su perfil", !profiles.error && profiles.data.length === 1 && profiles.data[0].email === email, profiles.data?.map((p) => p.email).join(", "));
  const escalate = await sb.from("profiles").update({ role: "admin" }).eq("email", email).select();
  check(email, "no puede hacerse admin", Boolean(escalate.error) || escalate.data.length === 0, escalate.error?.message || `${escalate.data.length} filas`);
  const grant = await sb.from("user_access").insert({ user_id: (await sb.auth.getUser()).data.user.id, country_code: "CL", site_id: null });
  check(email, "no puede darse acceso a todo el país", Boolean(grant.error), grant.error?.message || "¡insertó!");
  const write = await sb.from("batches").insert({ country_code: "CL", site_id: null, period: "2026-09", source: "file", disposition: "load", initial_disposition: "load" });
  check(email, "no inserta lotes directo (solo RPC)", Boolean(write.error), write.error?.message || "¡insertó!");
  const log = await sb.from("audit_log").insert({ action: "fake" });
  check(email, "no escribe audit_log", Boolean(log.error), log.error?.message || "¡insertó!");
}

// 3) Analista Chile: todas las plantas de Chile, nada de Valdoria.
{
  const email = "analista.cl@validador.test";
  const sb = await asUser(email);
  const r = await siteCodesOf(sb, "employees");
  check(email, "empleados solo de Chile", !r.error && r.codes.length > 0 && r.codes.every((c) => c.startsWith("CL-")), r.error || r.codes.join(", "));
  const vd = await sb.from("batches").select("id").eq("country_code", "VD").limit(1);
  check(email, "no ve lotes de Valdoria", !vd.error && vd.data.length === 0, `${vd.data?.length ?? vd.error?.message}`);
  const m = await sb.rpc("quality_metrics", { p_country: "VD" });
  check(email, "no ve métricas de Valdoria", Boolean(m.error), m.error?.message || "¡devolvió métricas!");
  const match = await sb.rpc("match_employees", { p_country_code: "VD", p_national_ids: [], p_employee_codes: ["VD-0001"] });
  check(email, "no cruza el maestro de Valdoria", Boolean(match.error), match.error?.message || "¡devolvió empleados!");
}

// 4) Admin: configura, pero no ve novedades ni empleados.
{
  const email = "admin@validador.test";
  const sb = await asUser(email);
  check(email, "no ve empleados", (await countOf(sb, "employees")) === 0, String(await countOf(sb, "employees")));
  check(email, "no ve lotes", (await countOf(sb, "batches")) === 0, String(await countOf(sb, "batches")));
  check(email, "ve todos los perfiles", (await countOf(sb, "profiles")) >= 5, String(await countOf(sb, "profiles")));
  check(email, "ve audit_log", typeof (await countOf(sb, "audit_log")) === "number", String(await countOf(sb, "audit_log")));
}

const failed = results.filter((r) => !r.ok);
const lines = ["| Usuario | Verificación | Resultado | Detalle |", "|---|---|---|---|"];
for (const r of results) lines.push(`| ${r.user} | ${r.name} | ${r.ok ? "OK" : "FALLA"} | ${String(r.detail ?? "").replace(/\|/g, "/").slice(0, 90)} |`);
process.stdout.write(`${lines.join("\n")}\n\n${results.length - failed.length}/${results.length} verificaciones correctas\n`);
process.exit(failed.length ? 1 : 0);
