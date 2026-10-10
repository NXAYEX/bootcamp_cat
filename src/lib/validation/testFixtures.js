// Contexto de pruebas construido desde la misma fuente que el seed (supabase/seed/source/*.json).
// Solo para pruebas en Node (usa fs).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildHistoryStats } from "./range.js";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const readJson = (rel) => JSON.parse(readFileSync(join(ROOT, rel), "utf8"));

export const SOURCE = {
  global: readJson("supabase/seed/source/global.json"),
  CL: readJson("supabase/seed/source/cl.json"),
  VD: readJson("supabase/seed/source/vd.json"),
};
export const EMPLOYEES = {
  CL: readJson("supabase/seed/generated/employees-cl.json"),
  VD: readJson("supabase/seed/generated/employees-vd.json"),
};

const COUNTRIES = ["CL", "VD"];

export const ALL_CONCEPTS = COUNTRIES.flatMap((cc) =>
  SOURCE[cc].concepts.map((c) => ({
    countryCode: cc,
    code: c.code,
    name: c.name,
    unit: c.unit,
    category: c.category,
    requiresSupport: c.requires_support,
    active: true,
  })),
);

export const ALIASES = Object.entries(SOURCE.global.column_aliases).flatMap(([field, list]) =>
  list.map((alias) => ({ field, alias, countryCode: null })),
);

const mapRule = (r) => ({
  ruleKey: r.rule_key,
  valueNumeric: r.value_numeric ?? null,
  valueText: r.value_text ?? null,
  validFrom: r.valid_from,
  validTo: r.valid_to,
});

const mapValidationRule = (countryCode) => (v) => ({
  code: v.code,
  countryCode,
  severity: v.severity,
  owner: v.owner,
  active: true,
  messageTemplate: v.message_template,
});

const mapEmployee = (e) => ({
  id: e.employeeCode,
  employeeCode: e.employeeCode,
  nationalId: e.nationalId,
  siteCode: e.siteCode,
  hireDate: e.hireDate,
  terminationDate: e.terminationDate,
  leaveBalanceDays: e.leaveBalanceDays,
  weeklyHours: e.weeklyHours,
});

export function buildContext({ country = "CL", siteCode, period = "2026-09", today = "2026-10-10", ...extra } = {}) {
  const src = SOURCE[country];
  const site = siteCode || src.sites[0].code;
  return {
    today,
    period,
    country: {
      code: country,
      nationalIdValidator: src.country.national_id_validator,
      nationalIdRegex: src.country.national_id_regex,
      nationalIdLabel: src.country.national_id_label,
    },
    site: { code: site, id: site },
    concepts: ALL_CONCEPTS,
    rules: src.rules.map(mapRule),
    validationRules: [
      ...SOURCE.global.validation_rules.map(mapValidationRule(null)),
      ...(src.validation_rules || []).map(mapValidationRule(country)),
    ],
    employees: EMPLOYEES[country].map(mapEmployee),
    closedPeriods: src.periods.filter((p) => p.status === "closed").map((p) => p.period),
    priorFingerprints: [],
    priorRowKeys: [],
    history: buildHistoryStats(EMPLOYEES[country]),
    ...extra,
  };
}

export const employee = (country, code) => EMPLOYEES[country].find((e) => e.employeeCode === code);

/** Primer empleado activo de una planta que cumpla `filter`. */
export function pickEmployees(country, siteCode, count, filter = () => true) {
  return EMPLOYEES[country]
    .filter((e) => e.siteCode === siteCode && !e.terminationDate && e.hireDate < "2026-01-01" && filter(e))
    .slice(0, count);
}
