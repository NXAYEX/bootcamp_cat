import { beforeEach, describe, expect, it } from "vitest";
import { CATALOG_CODES, validateBatch } from "./index.js";
import { buildContext } from "./testFixtures.js";

// Trabajador "normal" de CL-STG: CL-000011, RUT 22480194-7, saldo 21 días, jornada 42 h.
const RUT = "22.480.194-7";
const CODE = "CL-000011";

let seq = 1;
const row = (over = {}) => ({
  rowNumber: ++seq,
  national_id: RUT,
  employee_code: CODE,
  concept_code: "HE50",
  date: "2026-09-14",
  quantity: 2,
  unit: "horas",
  support_ref: "",
  ...over,
});

const STRUCTURE = { fileName: "NOV_CL_CL-STG_2026-09.xlsx", headers: [], missingFields: [], renamed: [] };

beforeEach(() => {
  seq = 1;
});

function run(rows, { structure = STRUCTURE, ...ctx } = {}) {
  return validateBatch({ rows, structure, context: buildContext({ siteCode: "CL-STG", ...ctx }) });
}

const cleanRows = () => {
  seq = 1;
  return [
    row({ concept_code: "HE50", date: "2026-09-14", quantity: 2 }),
    row({ concept_code: "FER", date: "2026-09-15", quantity: 1, unit: "días" }),
    row({ concept_code: "HE100", date: "2026-09-18", quantity: "1,5", unit: "hrs", support_ref: "AUT-1" }),
    row({ concept_code: "LM", date: "2026-09-22", quantity: 1, unit: "d", support_ref: "LM-778" }),
  ];
};

const codesOf = (result) => result.findings.map((f) => f.code);
const at = (result, code) => result.findings.filter((f) => f.code === code).map((f) => f.rowNumber);

describe("lote limpio", () => {
  const result = validateBatch({ rows: cleanRows(), structure: STRUCTURE, context: buildContext({ siteCode: "CL-STG" }) });

  it("no genera hallazgos y se carga", () => {
    expect(result.findings).toEqual([]);
    expect(result.disposition).toBe("load");
    expect(result.fingerprint).toMatch(/^[0-9a-f]{8}$/);
  });

  it.each(CATALOG_CODES)("%s no aparece en un lote limpio", (code) => {
    expect(codesOf(result)).not.toContain(code);
  });

  it("normaliza filas con employeeId y RUT enmascarado", () => {
    const r = result.normalizedRows[2];
    expect(r).toMatchObject({ employeeId: CODE, employee_code: CODE, national_id_masked: "22.***.***-7", quantity: 1.5, unit: "hours" });
  });
});

describe("estructura", () => {
  it("STR-001 columna obligatoria faltante", () => {
    const r = run(cleanRows(), { structure: { ...STRUCTURE, missingFields: ["date"] } });
    expect(codesOf(r)).toEqual(["STR-001"]);
    expect(r.findings[0].message).toContain("Fecha");
  });
  it("STR-002 columna renombrada es info y no bloquea", () => {
    const r = run(cleanRows(), { structure: { ...STRUCTURE, renamed: [{ header: "Rut_Empleado", field: "national_id" }] } });
    expect(codesOf(r)).toEqual(["STR-002"]);
    expect(r.findings[0].severity).toBe("info");
    expect(r.findings[0].message).toContain("RUT");
    expect(r.disposition).toBe("load");
  });
  it("STR-003 archivo sin filas", () => {
    expect(codesOf(run([]))).toEqual(["STR-003"]);
  });
  it("STR-004 fecha ilegible, cantidad no numérica, cantidad ≤ 0 y campo vacío", () => {
    const r = run([row({ date: "31-02-2026" }), row({ quantity: "dos" }), row({ quantity: 0 }), row({ concept_code: "" })]);
    expect(at(r, "STR-004")).toEqual([2, 3, 4, 5]);
    expect(at(r, "LEG-001")).toEqual([]);
  });
  it("STR-004 acepta serial de Excel y DD/MM/AAAA", () => {
    const r = run([row({ date: 46279 }), row({ date: "15/09/2026", concept_code: "HE100", support_ref: "A" })]);
    expect(codesOf(r)).not.toContain("STR-004");
    expect(r.normalizedRows[0].date).toBe("2026-09-14");
  });
  it("STR-005 nombre fuera de patrón", () => {
    const r = run(cleanRows(), { structure: { ...STRUCTURE, fileName: "novedades septiembre.xlsx" } });
    expect(codesOf(r)).toEqual(["STR-005"]);
    expect(r.disposition).toBe("load_with_warnings");
  });
});

describe("identidad", () => {
  it("IDN-001 dígito verificador inválido, sin RUT completo en el hallazgo", () => {
    const r = run([row({ national_id: "12.345.678-9", employee_code: "" })]);
    expect(codesOf(r)).toEqual(["IDN-001"]);
    const f = r.findings[0];
    expect(f.value).toBe("12.***.***-9");
    expect(f.message).not.toContain("12345678");
    expect(f.message).toContain("RUT");
  });
  it("IDN-002 inexistente por RUT y por código, sin LEG/RNG", () => {
    const r = run([
      row({ national_id: "12.345.678-5", employee_code: "", quantity: 5 }),
      row({ national_id: "", employee_code: "CL-999999" }),
    ]);
    expect(at(r, "IDN-002")).toEqual([2, 3]);
    expect(codesOf(r)).not.toContain("LEG-001");
    expect(r.findings[0].message).not.toContain("12345678");
  });
  it("IDN-003 trabajador de otra planta", () => {
    const r = run([row({ national_id: "18294438-6", employee_code: "CL-000091" })]);
    expect(codesOf(r)).toEqual(["IDN-003"]);
  });
  it("IDN-004 fecha posterior a la desvinculación (pasa en la fecha límite)", () => {
    const r = run([
      row({ national_id: "18827131-6", employee_code: "CL-000005", date: "2026-09-10" }),
      row({ national_id: "18827131-6", employee_code: "CL-000005", date: "2026-09-11" }),
    ]);
    expect(at(r, "IDN-004")).toEqual([3]);
  });
  it("IDN-005 fecha anterior a la contratación (pasa desde el ingreso)", () => {
    const r = run([
      row({ national_id: "", employee_code: "CL-000006", date: "2026-09-18" }),
      row({ national_id: "", employee_code: "CL-000006", date: "2026-09-21" }),
    ]);
    expect(at(r, "IDN-005")).toEqual([2]);
  });
  it("IDN-006 RUT y código de personas distintas", () => {
    const r = run([row({ employee_code: "CL-000012" })]);
    expect(codesOf(r)).toEqual(["IDN-006"]);
    expect(r.findings[0].message).not.toContain("22480194");
  });
  it("IDN-006 conserva el código informado en la fila normalizada (no lo reemplaza por el del maestro)", () => {
    const r = run([row({ employee_code: "CL-000012" })]);
    expect(r.normalizedRows[0].employee_code).toBe("CL-000012");
  });
  it("IDN-001 tiene precedencia sobre IDN-003…006", () => {
    const r = run([row({ national_id: "18294438-0", employee_code: "CL-000091" })]);
    expect(codesOf(r)).toEqual(["IDN-001"]);
  });
});

describe("periodo", () => {
  it("PER-001 fecha fuera del mes declarado", () => {
    expect(at(run([row({ date: "2026-08-31" })]), "PER-001")).toEqual([2]);
  });
  it("PER-002 periodo cerrado (nivel lote)", () => {
    const r = run([row({ date: "2026-08-14" })], { period: "2026-08" });
    expect(r.findings.map((f) => [f.code, f.rowNumber])).toEqual([["PER-002", null]]);
    expect(run([row()], { period: "2026-09" }).findings).toEqual([]);
  });
  it("PER-003 fecha futura", () => {
    const r = run([row({ date: "2026-10-09" }), row({ date: "2026-10-20" })], { period: "2026-10" });
    expect(at(r, "PER-003")).toEqual([3]);
  });
});

describe("duplicados", () => {
  it("DUP-001 se marca la repetición, no la primera fila", () => {
    const r = run([row(), row({ quantity: 1 }), row({ date: "2026-09-15" })]);
    expect(at(r, "DUP-001")).toEqual([3]);
    expect(r.findings[0].message).toContain("fila 2");
  });
  it("DUP-002 misma huella que un lote ya enviado", () => {
    const first = run(cleanRows());
    const again = run(cleanRows(), { priorFingerprints: [first.fingerprint] });
    expect(again.findings.map((f) => [f.code, f.rowNumber])).toEqual([["DUP-002", null]]);
    expect(run(cleanRows(), { priorFingerprints: ["00000000"] }).findings).toEqual([]);
  });
  it("DUP-003 novedad informada en otro lote del periodo", () => {
    const r = run(cleanRows(), { priorRowKeys: [`${CODE}|2026-09-15|FER`, `${CODE}|2026-09-16|FER`] });
    expect(at(r, "DUP-003")).toEqual([3]);
    expect(r.findings[0].severity).toBe("warning");
  });
});

describe("coherencia", () => {
  it("COH-001 feriado y horas extra el mismo día", () => {
    const r = run([row(), row({ concept_code: "FER", quantity: 1, unit: "" })]);
    expect(at(r, "COH-001")).toEqual([2]);
  });
  it("COH-002 ausencia y horas extra el mismo día", () => {
    const r = run([row({ concept_code: "AUSI", quantity: 1, unit: "" }), row()]);
    expect(at(r, "COH-002")).toEqual([3]);
    expect(codesOf(run([row({ concept_code: "AUSI", quantity: 1, unit: "", date: "2026-09-15" }), row()]))).not.toContain("COH-002");
  });
  it("COH-003 licencia médica cruzada con feriado", () => {
    const r = run([row({ concept_code: "FER", quantity: 1, unit: "" }), row({ concept_code: "LM", quantity: 1, unit: "", support_ref: "F1" })]);
    expect(at(r, "COH-003")).toEqual([3]);
  });
  it("COH-004 feriado en sábado o domingo (regla vacation_business_days_only = 1)", () => {
    const r = run([row({ concept_code: "FER", quantity: 1, unit: "", date: "2026-09-19" }), row({ concept_code: "FER", quantity: 1, unit: "", date: "2026-09-21" })]);
    expect(at(r, "COH-004")).toEqual([2]);
  });
  it("sin coherencia si la fila tiene concepto desconocido", () => {
    const r = run([row(), row({ concept_code: "VACX", quantity: 1, unit: "" })]);
    expect(codesOf(r)).toEqual(["CON-001"]);
  });
});

describe("reglas legales", () => {
  it("LEG-001 supera tope diario (2 h pasa, 3 h bloquea)", () => {
    const r = run([row({ quantity: 2 }), row({ quantity: 3, date: "2026-09-15" })]);
    expect(at(r, "LEG-001")).toEqual([3]);
    expect(r.findings.find((f) => f.code === "LEG-001").severity).toBe("blocking");
  });
  it("LEG-001 suma conceptos de horas extra del mismo día", () => {
    const r = run([row({ quantity: 1 }), row({ concept_code: "HE100", quantity: 1.5, support_ref: "A" })]);
    expect(at(r, "LEG-001")).toEqual([3]);
  });
  it("LEG-002 tope semanal ISO, un hallazgo en la fila que lo supera", () => {
    const days = ["2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18", "2026-09-19", "2026-09-20"];
    const r = run(days.map((date) => row({ date })));
    expect(at(r, "LEG-002")).toEqual([8]);
    const ok = run(days.slice(0, 6).map((date) => row({ date })));
    expect(codesOf(ok)).not.toContain("LEG-002");
  });
  it("LEG-003 días de feriado superan el saldo (CL-000008, saldo 2)", () => {
    const fer = (date) => row({ national_id: "11900239-7", employee_code: "CL-000008", concept_code: "FER", quantity: 1, unit: "", date });
    const r = run([fer("2026-09-14"), fer("2026-09-15"), fer("2026-09-16"), fer("2026-09-17")]);
    expect(at(r, "LEG-003")).toEqual([4]);
    expect(codesOf(run([fer("2026-09-14"), fer("2026-09-15")]))).not.toContain("LEG-003");
  });
  it("LEG-004 concepto exige respaldo y no viene", () => {
    const r = run([row({ concept_code: "LM", quantity: 1, unit: "" }), row({ concept_code: "LM", quantity: 1, unit: "", date: "2026-09-15", support_ref: "F-1" })]);
    expect(at(r, "LEG-004")).toEqual([2]);
  });
  it("LEG-005 jornada contractual sobre el límite vigente, una vez por trabajador", () => {
    const e7 = (date) => row({ national_id: "11881397-9", employee_code: "CL-000007", date });
    const r = run([e7("2026-09-14"), e7("2026-09-15")]);
    expect(at(r, "LEG-005")).toEqual([2]);
    expect(r.findings[0].message).toContain("42");
  });
});

describe("conceptos", () => {
  it("CON-001 concepto desconocido", () => {
    expect(codesOf(run([row({ concept_code: "XYZ", quantity: 9 })]))).toEqual(["CON-001"]);
  });
  it("CON-002 concepto que solo existe en otro país", () => {
    const r = run([row({ concept_code: "BONO_ASIST", quantity: 1, unit: "" })]);
    expect(codesOf(r)).toEqual(["CON-002"]);
    expect(r.findings[0].message).toContain("VD");
  });
  it("CON-003 unidad distinta a la del concepto", () => {
    const r = run([row({ unit: "días" }), row({ date: "2026-09-15", unit: "HRS" })]);
    expect(at(r, "CON-003")).toEqual([2]);
  });
});

describe("rangos", () => {
  const e9 = (date) => row({ national_id: "22189943-1", employee_code: "CL-000009", date });
  const days = ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-07", "2026-09-08", "2026-09-09", "2026-09-10", "2026-09-11"];

  it("RNG-001 total atípico del trabajador, en su última fila", () => {
    const r = run(days.map(e9));
    expect(r.findings.map((f) => [f.code, f.rowNumber])).toEqual([["RNG-001", 10]]);
  });
  it("RNG-001 no aplica dentro de su rango habitual", () => {
    expect(run(days.slice(0, 2).map(e9)).findings).toEqual([]);
  });
  it("RNG-001 no aplica con historial insuficiente", () => {
    const history = { employees: { "CL-000009": { overtime: { mean: 2, sd: 0.5, n: 2 } } }, sites: {} };
    expect(run(days.map(e9), { history }).findings).toEqual([]);
  });
  it("RNG-002 total de la planta atípico (nivel lote, info)", () => {
    const history = { employees: {}, sites: { "CL-STG": { overtime: { mean: 0, sd: 0.2, n: 6 } } } };
    const r = run(cleanRows(), { history });
    expect(r.findings.map((f) => [f.code, f.rowNumber, f.severity])).toEqual([["RNG-002", null, "info"]]);
    expect(r.disposition).toBe("load");
  });
});

describe("configuración de validation_rules", () => {
  it("un código inactivo no genera hallazgos", () => {
    const ctx = buildContext({ siteCode: "CL-STG" });
    ctx.validationRules.push({ code: "LEG-001", countryCode: "CL", severity: "blocking", owner: "site", active: false });
    seq = 1;
    const r = validateBatch({ rows: [row({ quantity: 5 })], structure: STRUCTURE, context: ctx });
    expect(codesOf(r)).not.toContain("LEG-001");
  });
  it("sin fila configurada se usa el valor del catálogo y texto genérico", () => {
    const ctx = buildContext({ siteCode: "CL-STG", validationRules: [] });
    seq = 1;
    const r = validateBatch({ rows: [row({ quantity: 5 })], structure: STRUCTURE, context: ctx });
    expect(r.findings[0]).toMatchObject({ code: "LEG-001", severity: "blocking", owner: "site" });
    expect(r.findings[0].message).toContain("tope diario es 2");
  });
});
