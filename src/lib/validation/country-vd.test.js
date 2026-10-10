import { describe, expect, it } from "vitest";
import { validateBatch } from "./index.js";
import { buildContext } from "./testFixtures.js";

// Valdoria (VD) es ficticio: demuestra que un país nuevo solo cambia datos, no código.
const ctxVD = (extra = {}) => buildContext({ country: "VD", siteCode: "VD-NOR", ...extra });
const ctxCL = () => buildContext({ country: "CL", siteCode: "CL-STG" });
const structure = (fileName) => ({ fileName, headers: [], missingFields: [], renamed: [] });

const vdRow = (over = {}) => ({
  rowNumber: 2,
  national_id: "VD-411841",
  employee_code: "VD-0001",
  concept_code: "OT",
  date: "2026-09-14",
  quantity: 2,
  unit: "hours",
  ...over,
});

const codes = (r) => r.findings.map((f) => f.code);

describe("país VD", () => {
  it("identificador por expresión regular", () => {
    const ok = validateBatch({ rows: [vdRow()], structure: structure("NOV_VD_VD-NOR_2026-09.xlsx"), context: ctxVD() });
    expect(ok.findings).toEqual([]);
    const bad = validateBatch({ rows: [vdRow({ national_id: "VD-12345", employee_code: "" })], context: ctxVD() });
    expect(codes(bad)).toEqual(["IDN-001"]);
    expect(bad.findings[0].message).toContain("NIV");
    expect(bad.findings[0].message).not.toContain("VD-12345");
  });

  it("BONO_ASIST es válido en VD y CON-002 en CL", () => {
    const vd = validateBatch({ rows: [vdRow({ concept_code: "BONO_ASIST", quantity: 1, unit: "días" })], context: ctxVD() });
    expect(vd.findings).toEqual([]);
    const cl = validateBatch({
      rows: [{ rowNumber: 2, national_id: "22480194-7", concept_code: "BONO_ASIST", date: "2026-09-14", quantity: 1 }],
      context: ctxCL(),
    });
    expect(codes(cl)).toEqual(["CON-002"]);
  });

  it("LEG-001: 3 h pasa en VD; 4 h es advertencia del país (override)", () => {
    const three = validateBatch({ rows: [vdRow({ quantity: 3 })], context: ctxVD() });
    expect(three.findings).toEqual([]);
    const four = validateBatch({ rows: [vdRow({ quantity: 4 })], context: ctxVD() });
    expect(four.findings).toHaveLength(1);
    expect(four.findings[0]).toMatchObject({ code: "LEG-001", severity: "warning", owner: "central" });
    expect(four.findings[0].message).toContain("Valdoria");
    expect(four.disposition).toBe("load_with_warnings");
  });

  it("en CL 3 h de horas extra bloquean", () => {
    const cl = validateBatch({
      rows: [{ rowNumber: 2, national_id: "22480194-7", concept_code: "HE50", date: "2026-09-14", quantity: 3 }],
      context: ctxCL(),
    });
    expect(cl.findings.map((f) => [f.code, f.severity])).toEqual([["LEG-001", "blocking"]]);
  });

  it("vacaciones en fin de semana no generan COH-004 (días corridos)", () => {
    const r = validateBatch({ rows: [vdRow({ concept_code: "VAC", quantity: 1, unit: "", date: "2026-09-19" })], context: ctxVD() });
    expect(r.findings).toEqual([]);
  });

  it("IDN-004 con VD-0003 desvinculado el 2026-09-05", () => {
    const r = validateBatch({ rows: [vdRow({ national_id: "VD-168198", employee_code: "VD-0003", date: "2026-09-07" })], context: ctxVD() });
    expect(codes(r)).toEqual(["IDN-004"]);
  });

  it("la jornada de 45 h no supera el límite de VD (LEG-005 pasa)", () => {
    const r = validateBatch({ rows: [vdRow()], context: ctxVD() });
    expect(codes(r)).not.toContain("LEG-005");
  });
});
