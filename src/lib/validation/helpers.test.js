import { describe, expect, it } from "vitest";
import {
  buildHistoryStats,
  computeDisposition,
  fingerprintRows,
  isValidNationalId,
  isoWeek,
  maskNationalId,
  normalizeDate,
  normalizeNationalId,
  normalizeQuantity,
  normalizeUnit,
  resolveValidationRule,
  ruleValue,
  CATALOG,
} from "./index.js";
import { buildContext, SOURCE } from "./testFixtures.js";

describe("identificador nacional", () => {
  it("normaliza y enmascara RUT", () => {
    expect(normalizeNationalId("12.345.678-k")).toBe("12345678-K");
    expect(normalizeNationalId("123456785")).toBe("12345678-5");
    expect(maskNationalId("12.345.678-k")).toBe("12.***.***-K");
    expect(maskNationalId("8.864.984-2")).toBe("88.***.***-2");
  });
  it("valida módulo 11", () => {
    expect(isValidNationalId("12.345.678-5", "rut_mod11")).toBe(true);
    expect(isValidNationalId("12.345.678-K", "rut_mod11")).toBe(false);
    expect(isValidNationalId("13553661-k", "rut_mod11")).toBe(true);
    expect(isValidNationalId("abc", "rut_mod11")).toBe(false);
  });
  it("valida por expresión regular", () => {
    expect(isValidNationalId("VD-411841", "regex", "^VD-\\d{6}$")).toBe(true);
    expect(isValidNationalId("VD-41184", "regex", "^VD-\\d{6}$")).toBe(false);
    expect(isValidNationalId("VD-411841", "desconocido")).toBe(false);
  });
});

describe("normalización", () => {
  it("fechas", () => {
    expect(normalizeDate("2026-09-14")).toBe("2026-09-14");
    expect(normalizeDate("14-09-2026")).toBe("2026-09-14");
    expect(normalizeDate("14/09/2026")).toBe("2026-09-14");
    expect(normalizeDate(46279)).toBe("2026-09-14");
    expect(normalizeDate(new Date(2026, 8, 14))).toBe("2026-09-14");
    expect(normalizeDate("31-02-2026")).toBeNull();
    expect(normalizeDate("ayer")).toBeNull();
  });
  it("cantidades", () => {
    expect(normalizeQuantity("1,5")).toBe(1.5);
    expect(normalizeQuantity("2.0")).toBe(2);
    expect(normalizeQuantity(3)).toBe(3);
    expect(normalizeQuantity("dos")).toBeNull();
    expect(normalizeQuantity("")).toBeNull();
  });
  it("unidades", () => {
    for (const u of ["horas", "Hrs", "h", "hours", "HORA"]) expect(normalizeUnit(u)).toBe("hours");
    for (const u of ["días", "dias", "d", "days"]) expect(normalizeUnit(u)).toBe("days");
    expect(normalizeUnit("")).toBeNull();
    expect(normalizeUnit("semanas")).toBe("semanas");
  });
  it("semana ISO", () => {
    expect(isoWeek("2026-09-14")).toBe("2026-W38");
    expect(isoWeek("2026-09-20")).toBe("2026-W38");
    expect(isoWeek("2026-09-21")).toBe("2026-W39");
    expect(isoWeek("2027-01-01")).toBe("2026-W53");
  });
});

describe("reglas", () => {
  const { rules } = buildContext();
  it("ruleValue respeta la vigencia", () => {
    expect(ruleValue(rules, "weekly_hours_limit", "2026-01-15")).toBe(44);
    expect(ruleValue(rules, "weekly_hours_limit", "2026-09-01")).toBe(42);
    expect(ruleValue(rules, "weekly_hours_limit", "2028-05-01")).toBe(40);
    expect(ruleValue(rules, "no_existe", "2026-09-01")).toBeNull();
    expect(typeof ruleValue(rules, "file_name_pattern", "2026-09-01")).toBe("string");
  });
  it("la fila del país gana a la global", () => {
    const vr = buildContext({ country: "VD" }).validationRules;
    expect(resolveValidationRule(vr, "LEG-001", "VD")).toMatchObject({ severity: "warning", owner: "central" });
    expect(resolveValidationRule(vr, "LEG-001", "CL")).toMatchObject({ severity: "blocking", owner: "site" });
  });
  it("el catálogo coincide con global.json", () => {
    const seeded = SOURCE.global.validation_rules;
    expect(CATALOG.map((c) => c.code)).toEqual(seeded.map((v) => v.code));
    for (const c of CATALOG) {
      const v = seeded.find((x) => x.code === c.code);
      expect([c.severity, c.owner]).toEqual([v.severity, v.owner]);
    }
  });
});

describe("disposición", () => {
  it("block > load_with_warnings > load; info no cuenta", () => {
    expect(computeDisposition([{ severity: "info" }, { severity: "blocking" }])).toBe("block");
    expect(computeDisposition([{ severity: "info" }, { severity: "warning" }])).toBe("load_with_warnings");
    expect(computeDisposition([{ severity: "info" }])).toBe("load");
    expect(computeDisposition([])).toBe("load");
  });
});

describe("huella", () => {
  const a = { employee_code: "CL-1", date: "2026-09-14", concept_code: "HE50", quantity: 2, unit: "hours" };
  const b = { employee_code: "CL-2", date: "2026-09-15", concept_code: "FER", quantity: 1, unit: "days" };
  it("no depende del orden y cambia con los datos", () => {
    expect(fingerprintRows([a, b])).toBe(fingerprintRows([b, a]));
    expect(fingerprintRows([a, b])).not.toBe(fingerprintRows([a, { ...b, quantity: 2 }]));
    expect(fingerprintRows([a])).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe("buildHistoryStats", () => {
  it("calcula media, desviación y n por trabajador y por planta", () => {
    const employees = [
      { employeeCode: "A", siteCode: "S", history: [{ period: "p1", category: "overtime", total: 2 }, { period: "p2", category: "overtime", total: 4 }] },
      { employeeCode: "B", siteCode: "S", history: [{ period: "p1", category: "overtime", total: 6 }, { period: "p2", category: "overtime", total: 8 }] },
    ];
    const h = buildHistoryStats(employees);
    expect(h.employees.A.overtime).toEqual({ mean: 3, sd: 1.41, n: 2 });
    expect(h.sites.S.overtime).toEqual({ mean: 10, sd: 2.83, n: 2 });
  });
});
