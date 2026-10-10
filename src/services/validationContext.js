import { getConcepts, getCountryRules, getPeriods, getValidationRules } from "./reference";
import { getPriorBatchData } from "./batches";
import { getEmployeeHistoryStats, getSiteHistoryStats, matchEmployees } from "./employees";

// Arma el contexto del motor de validación a partir de Supabase.
// El motor es puro: todo lo que depende del país llega aquí como datos.
export async function loadValidationContext({ country, site, period, rows, today }) {
  const nationalIds = [...new Set(rows.map((r) => r.national_id).filter(Boolean))];
  const codes = [...new Set(rows.map((r) => r.employee_code).filter(Boolean).map(String))];

  const [concepts, rules, vrules, periods, prior, empStats, siteStats, employees] = await Promise.all([
    getConcepts(),
    getCountryRules(country.code),
    getValidationRules(country.code),
    getPeriods(country.code),
    getPriorBatchData({ siteId: site.id, period }),
    getEmployeeHistoryStats(site.code),
    getSiteHistoryStats(site.code),
    nationalIds.length + codes.length > 0 ? matchEmployees(country.code, normalizeIds(nationalIds), codes) : Promise.resolve({ data: [], error: null }),
  ]);

  const failed = [concepts, rules, vrules, periods, prior, empStats, siteStats, employees].find((r) => r.error);
  if (failed) return { data: null, error: failed.error };

  return {
    data: {
      today,
      period,
      country: {
        code: country.code,
        nationalIdValidator: country.national_id_validator,
        nationalIdRegex: country.national_id_regex,
        nationalIdLabel: country.national_id_label,
      },
      site: { id: site.id, code: site.code },
      concepts: concepts.data.map((c) => ({
        countryCode: c.country_code,
        code: c.code,
        name: c.name,
        unit: c.unit,
        category: c.category,
        requiresSupport: c.requires_support,
        active: c.active,
      })),
      rules: rules.data.map((r) => ({
        ruleKey: r.rule_key,
        valueNumeric: r.value_numeric === null ? null : Number(r.value_numeric),
        valueText: r.value_text,
        validFrom: r.valid_from,
        validTo: r.valid_to,
      })),
      validationRules: vrules.data.map((v) => ({
        code: v.code,
        countryCode: v.country_code,
        severity: v.severity,
        owner: v.owner,
        active: v.active,
        messageTemplate: v.message_template,
      })),
      employees: employees.data.map((e) => ({
        id: e.id,
        employeeCode: e.employee_code,
        nationalId: e.national_id,
        siteCode: e.site_code,
        hireDate: e.hire_date,
        terminationDate: e.termination_date,
        leaveBalanceDays: Number(e.leave_balance_days),
        weeklyHours: Number(e.weekly_hours),
      })),
      closedPeriods: periods.data.filter((p) => p.status === "closed").map((p) => p.period),
      priorFingerprints: prior.data.fingerprints,
      priorRowKeys: prior.data.rowKeys,
      history: {
        employees: groupStats(empStats.data, "employee_code"),
        sites: groupStats(siteStats.data, "site_code"),
      },
    },
    error: null,
  };
}

function groupStats(list, key) {
  const out = {};
  for (const s of list) {
    out[s[key]] ??= {};
    out[s[key]][s.category] = { mean: Number(s.mean), sd: Number(s.sd), n: Number(s.n) };
  }
  return out;
}

// El maestro guarda el RUT sin puntos y con guion ("12345678-5"); se envían ambas formas por si el archivo trae otra.
function normalizeIds(ids) {
  const out = new Set();
  for (const raw of ids) {
    const s = String(raw).trim();
    out.add(s);
    const clean = s.replace(/[.\s]/g, "").toUpperCase();
    out.add(clean);
    if (!clean.includes("-") && clean.length > 1) out.add(`${clean.slice(0, -1)}-${clean.slice(-1)}`);
  }
  return [...out];
}
