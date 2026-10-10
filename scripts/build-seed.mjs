// Genera los datos sintéticos (empleados e historial) y los SQL de seed a partir de supabase/seed/source/*.json.
// Es determinístico: siempre produce los mismos empleados, para que las pruebas y la web coincidan.
// Uso: node scripts/build-seed.mjs
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = (f) => JSON.parse(readFileSync(join(root, "supabase/seed/source", f), "utf8"));
const out = (f, text) => {
  mkdirSync(dirname(join(root, f)), { recursive: true });
  writeFileSync(join(root, f), text);
};

const global = src("global.json");
const cl = src("cl.json");
const vd = src("vd.json");

function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST = ["Camila", "Matías", "Valentina", "Benjamín", "Antonia", "Vicente", "Florencia", "Tomás", "Isidora", "Joaquín", "Martina", "Agustín", "Catalina", "Cristóbal", "Fernanda", "Ignacio", "Josefa", "Diego", "Constanza", "Sebastián", "Javiera", "Felipe", "Trinidad", "Nicolás", "Amanda", "Lucas", "Renata", "Gaspar", "Emilia", "Bastián"];
// Apellidos claramente ficticios: ningún trabajador sintético puede confundirse con una persona real.
const LAST = ["Muestra", "Ensayo", "Prueba", "Simulado", "Ficticio", "Sintético", "Ejemplo", "Modelo", "Borrador", "Maqueta", "Plantilla", "Bosquejo"];

function rutDv(body) {
  let sum = 0;
  let mul = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += Number(body[i]) * mul;
    mul = mul === 7 ? 2 : mul + 1;
  }
  const r = 11 - (sum % 11);
  return r === 11 ? "0" : r === 10 ? "K" : String(r);
}

function normal(rand) {
  const u = Math.max(rand(), 1e-9);
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const HISTORY_PERIODS = ["2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08"];

function buildEmployees(def, seed, overrides) {
  const country = { ...def.country, sites: def.sites };
  const rand = mulberry32(seed);
  const employees = [];
  const usedIds = new Set();
  let n = 0;
  for (const site of country.sites) {
    for (let i = 0; i < site.employees; i++) {
      n++;
      const code = country.code === "CL" ? `CL-${String(n).padStart(6, "0")}` : `${country.code}-${String(n).padStart(4, "0")}`;
      let nationalId;
      do {
        if (country.national_id_validator === "rut_mod11") {
          const body = String(8000000 + Math.floor(rand() * 18000000));
          nationalId = `${body}-${rutDv(body)}`;
        } else {
          nationalId = `${country.code}-${String(100000 + Math.floor(rand() * 900000))}`;
        }
      } while (usedIds.has(nationalId));
      usedIds.add(nationalId);
      const first = FIRST[Math.floor(rand() * FIRST.length)];
      const last1 = LAST[Math.floor(rand() * LAST.length)];
      const last2 = LAST[Math.floor(rand() * LAST.length)];
      const hireYear = 2008 + Math.floor(rand() * 17);
      const hireMonth = 1 + Math.floor(rand() * 12);
      const overtimeMean = 2 + rand() * 10;
      const emp = {
        employeeCode: code,
        nationalId,
        firstName: first,
        lastName: `${last1} ${last2}`,
        siteCode: site.code,
        hireDate: `${hireYear}-${String(hireMonth).padStart(2, "0")}-01`,
        terminationDate: null,
        leaveBalanceDays: 5 + Math.floor(rand() * 21),
        weeklyHours: country.code === "CL" ? 42 : 45,
        history: HISTORY_PERIODS.map((period) => ({
          period,
          category: "overtime",
          total: Math.max(0, Math.round(overtimeMean + normal(rand) * 2)),
        })),
      };
      Object.assign(emp, overrides[code] || {});
      if (overrides[code]?.history) emp.history = overrides[code].history;
      employees.push(emp);
    }
  }
  return employees;
}

// Casos especiales usados por samples/ (ver samples/README.md).
const CL_OVERRIDES = {
  "CL-000005": { terminationDate: "2026-09-10" },
  "CL-000006": { hireDate: "2026-09-20" },
  "CL-000007": { weeklyHours: 45 },
  "CL-000008": { leaveBalanceDays: 2 },
  "CL-000009": { history: HISTORY_PERIODS.map((period, i) => ({ period, category: "overtime", total: [2, 3, 2, 1, 3, 2][i] })) },
  "CL-000010": { terminationDate: "2025-12-31" },
};
const VD_OVERRIDES = {
  "VD-0003": { terminationDate: "2026-09-05" },
};

const clEmployees = buildEmployees(cl, 20261010, CL_OVERRIDES);
const vdEmployees = buildEmployees(vd, 20261011, VD_OVERRIDES);

out("supabase/seed/generated/employees-cl.json", JSON.stringify(clEmployees, null, 1));
out("supabase/seed/generated/employees-vd.json", JSON.stringify(vdEmployees, null, 1));

// ---------- SQL ----------
const q = (v) => (v === null || v === undefined ? "null" : typeof v === "number" ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
const arr = (a) => (a && a.length ? `array[${a.map(q).join(", ")}]::text[]` : "null");
const header = (title) => `-- ${title}\n-- ARCHIVO GENERADO por scripts/build-seed.mjs desde supabase/seed/source/. No editar a mano.\n-- Todos los datos son SINTÉTICOS. Las reglas legales son referenciales.\n\n`;

function countrySql(c) {
  const lines = [];
  lines.push(`insert into public.countries (code, name, national_id_label, national_id_validator, national_id_regex, timezone) values (${q(c.country.code)}, ${q(c.country.name)}, ${q(c.country.national_id_label)}, ${q(c.country.national_id_validator)}, ${q(c.country.national_id_regex)}, ${q(c.country.timezone)}) on conflict (code) do nothing;`);
  for (const s of c.sites) {
    lines.push(`insert into public.sites (country_code, code, name) values (${q(c.country.code)}, ${q(s.code)}, ${q(s.name)}) on conflict (code) do nothing;`);
  }
  lines.push("");
  lines.push("insert into public.concepts (country_code, code, name, unit, category, requires_support) values");
  lines.push(c.concepts.map((k) => `  (${q(c.country.code)}, ${q(k.code)}, ${q(k.name)}, ${q(k.unit)}, ${q(k.category)}, ${k.requires_support})`).join(",\n") + "\non conflict (country_code, code) do nothing;\n");
  lines.push("insert into public.country_rules (country_code, rule_key, value_numeric, value_text, unit, description, legal_reference, procedure_keywords, valid_from, valid_to) values");
  lines.push(c.rules.map((r) => `  (${q(c.country.code)}, ${q(r.rule_key)}, ${q(r.value_numeric ?? null)}, ${q(r.value_text ?? null)}, ${q(r.unit)}, ${q(r.description)}, ${q(r.legal_reference)}, ${arr(r.procedure_keywords)}, ${q(r.valid_from)}, ${q(r.valid_to)})`).join(",\n") + ";\n");
  lines.push("insert into public.payroll_periods (country_code, period, status, cutoff_date) values");
  lines.push(c.periods.map((p) => `  (${q(c.country.code)}, ${q(p.period)}, ${q(p.status)}, ${q(p.cutoff_date)})`).join(",\n") + "\non conflict (country_code, period) do nothing;\n");
  if (c.validation_rules?.length) {
    lines.push("insert into public.validation_rules (code, country_code, name, severity, owner, message_template) values");
    lines.push(c.validation_rules.map((v) => `  (${q(v.code)}, ${q(c.country.code)}, ${q(v.name)}, ${q(v.severity)}, ${q(v.owner)}, ${q(v.message_template)})`).join(",\n") + ";\n");
  }
  return lines.join("\n");
}

function employeesSql(countryCode, employees) {
  const lines = [];
  for (let i = 0; i < employees.length; i += 50) {
    const chunk = employees.slice(i, i + 50);
    lines.push("insert into public.employees (country_code, site_id, employee_code, national_id, first_name, last_name, hire_date, termination_date, leave_balance_days, weekly_hours)");
    lines.push("select v.country_code, s.id, v.employee_code, v.national_id, v.first_name, v.last_name, v.hire_date::date, v.termination_date::date, v.leave_balance_days, v.weekly_hours");
    lines.push("from (values");
    lines.push(chunk.map((e) => `  (${q(countryCode)}, ${q(e.siteCode)}, ${q(e.employeeCode)}, ${q(e.nationalId)}, ${q(e.firstName)}, ${q(e.lastName)}, ${q(e.hireDate)}, ${q(e.terminationDate)}, ${e.leaveBalanceDays}, ${e.weeklyHours})`).join(",\n"));
    lines.push(") as v(country_code, site_code, employee_code, national_id, first_name, last_name, hire_date, termination_date, leave_balance_days, weekly_hours)");
    lines.push("join public.sites s on s.code = v.site_code\non conflict (country_code, employee_code) do nothing;\n");
  }
  for (let i = 0; i < employees.length; i += 50) {
    const chunk = employees.slice(i, i + 50);
    lines.push("insert into public.employee_history (country_code, site_id, employee_id, period, category, total)");
    lines.push("select e.country_code, e.site_id, e.id, v.period, v.category, v.total");
    lines.push("from (values");
    lines.push(chunk.flatMap((e) => e.history.map((h) => `  (${q(e.employeeCode)}, ${q(h.period)}, ${q(h.category)}, ${h.total})`)).join(",\n"));
    lines.push(") as v(employee_code, period, category, total)");
    lines.push(`join public.employees e on e.employee_code = v.employee_code and e.country_code = ${q(countryCode)};\n`);
  }
  return lines.join("\n");
}

function globalSql() {
  const lines = [];
  lines.push("insert into public.validation_rules (code, country_code, name, severity, owner, message_template) values");
  lines.push(global.validation_rules.map((v) => `  (${q(v.code)}, null, ${q(v.name)}, ${q(v.severity)}, ${q(v.owner)}, ${q(v.message_template)})`).join(",\n") + ";\n");
  lines.push("insert into public.column_aliases (country_code, field, alias) values");
  lines.push(Object.entries(global.column_aliases).flatMap(([field, aliases]) => aliases.map((a) => `  (null, ${q(field)}, ${q(a)})`)).join(",\n") + ";\n");
  lines.push("insert into public.procedure_checklist_items (country_code, code, title, description, weight, keywords, min_hits_full, min_hits_partial, uses_country_rules, question, suggested_text, sort_order) values");
  lines.push(global.checklist.map((c, i) => `  (null, ${q(c.code)}, ${q(c.title)}, ${q(c.description)}, ${c.weight}, ${arr(c.keywords)}, ${c.min_hits_full}, ${c.min_hits_partial}, ${c.uses_country_rules}, ${q(c.question)}, ${q(c.suggested_text)}, ${i + 1})`).join(",\n") + ";\n");
  return lines.join("\n");
}

out("supabase/migrations/003_seed_reference_cl.sql", header("003 · Datos de referencia globales y de Chile") + globalSql() + "\n" + countrySql(cl));
out("supabase/migrations/004_seed_employees_cl.sql", header("004 · Maestro sintético de empleados de Chile e historial") + employeesSql("CL", clEmployees));
out("supabase/migrations/008_seed_country_vd.sql", header("008 · Segundo país FICTICIO (Valdoria): solo inserciones de datos, sin cambios de código") + countrySql(vd) + "\n" + employeesSql("VD", vdEmployees));

process.stdout.write(`Empleados CL: ${clEmployees.length}, VD: ${vdEmployees.length}\n`);
