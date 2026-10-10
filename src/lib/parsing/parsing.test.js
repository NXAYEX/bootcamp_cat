import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { applyMapping, readTabularFile, suggestMapping } from "./index.js";
import { ALIASES } from "../validation/testFixtures.js";

const enc = (text) => new TextEncoder().encode(text);

function xlsxBytes(aoa) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "Novedades");
  return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }));
}

describe("readTabularFile", () => {
  it("lee CSV con punto y coma, BOM y filas vacías conservando el número de fila", async () => {
    const csv = "﻿rut;concepto;fecha;cantidad\n22.480.194-7;HE50;14-09-2026;1,5\n;;;\n22.480.194-7;FER;15-09-2026;1\n";
    const { headers, rows } = await readTabularFile(enc(csv), "x.csv");
    expect(headers).toEqual(["rut", "concepto", "fecha", "cantidad"]);
    expect(rows.map((r) => r.rowNumber)).toEqual([2, 4]);
    expect(rows[0].values).toEqual({ rut: "22.480.194-7", concepto: "HE50", fecha: "14-09-2026", cantidad: "1,5" });
  });

  it("lee CSV separado por comas", async () => {
    const { headers, rows } = await readTabularFile(enc("rut,concepto\n1-9,HE50\n"), "x.csv");
    expect(headers).toEqual(["rut", "concepto"]);
    expect(rows).toHaveLength(1);
  });

  it("lee CSV en Windows-1252", async () => {
    const bytes = new Uint8Array([...enc("observaci"), 0xf3, 0x6e, 0x0a, 0x64, 0xed, 0x61, 0x0a]);
    const { headers, rows } = await readTabularFile(bytes, "x.csv");
    expect(headers).toEqual(["observación"]);
    expect(rows[0].values["observación"]).toBe("día");
  });

  it("lee xlsx con fechas como serial y omite filas vacías", async () => {
    const bytes = xlsxBytes([["rut", "fecha", "cantidad"], ["22480194-7", 46279, 2], [null, null, null], ["22480194-7", 46280, 1]]);
    const { headers, rows } = await readTabularFile(bytes.buffer, "NOV.xlsx");
    expect(headers).toEqual(["rut", "fecha", "cantidad"]);
    expect(rows.map((r) => [r.rowNumber, r.values.fecha])).toEqual([[2, 46279], [4, 46280]]);
  });

  it("archivo solo con encabezados no tiene filas", async () => {
    const { headers, rows } = await readTabularFile(xlsxBytes([["rut", "concepto"]]), "a.xlsx");
    expect(headers).toEqual(["rut", "concepto"]);
    expect(rows).toEqual([]);
  });

  it("rechaza más de 20.000 filas, más de 10 MB y formatos no soportados", async () => {
    const big = "a\n" + "1\n".repeat(20001);
    await expect(readTabularFile(enc(big), "a.csv")).rejects.toThrow(/20\.000 filas/);
    await expect(readTabularFile(new Uint8Array(10 * 1024 * 1024 + 1), "a.csv")).rejects.toThrow(/10 MB/);
    await expect(readTabularFile(enc("x"), "a.pdf")).rejects.toThrow(/Formato no soportado/);
  });
});

describe("suggestMapping", () => {
  it("encabezados de plantilla no cuentan como renombrados", () => {
    const r = suggestMapping(["rut", "codigo_empleado", "nombre", "concepto", "fecha", "cantidad", "unidad", "respaldo", "observacion"], ALIASES);
    expect(r.renamed).toEqual([]);
    expect(r.missingFields).toEqual([]);
    expect(r.unmapped).toEqual([]);
    expect(r.mapping.national_id).toBe("rut");
  });

  it("alias sin tildes, mayúsculas ni guiones bajos se marcan como renombrados", () => {
    const r = suggestMapping(["Rut_Empleado", "Tipo Novedad", "Fecha_Novedad", "Horas", "Observación", "Extra"], ALIASES);
    expect(r.mapping).toMatchObject({ national_id: "Rut_Empleado", concept_code: "Tipo Novedad", date: "Fecha_Novedad", quantity: "Horas", notes: "Observación" });
    expect(r.renamed.map((x) => x.header)).toEqual(["Rut_Empleado", "Tipo Novedad", "Fecha_Novedad", "Horas"]);
    expect(r.unmapped).toEqual(["Extra"]);
  });

  it("informa campos obligatorios faltantes", () => {
    expect(suggestMapping(["rut", "concepto", "cantidad"], ALIASES).missingFields).toEqual(["date"]);
    expect(suggestMapping(["codigo_empleado", "concepto", "fecha", "cantidad"], ALIASES).missingFields).toEqual([]);
    expect(suggestMapping(["concepto", "fecha", "cantidad"], ALIASES).missingFields).toEqual(["national_id"]);
  });

  it("aplica alias del país y descarta los de otros países", () => {
    const aliases = [...ALIASES, { field: "national_id", alias: "niv", countryCode: "VD" }];
    expect(suggestMapping(["niv"], aliases, { countryCode: "VD" }).mapping.national_id).toBe("niv");
    expect(suggestMapping(["niv"], aliases, { countryCode: "CL" }).mapping.national_id).toBeUndefined();
  });
});

describe("applyMapping", () => {
  it("convierte filas leídas en filas del motor", () => {
    const rows = [{ rowNumber: 2, values: { Rut: "1-9", Concepto: "HE50", Otra: "x" } }];
    expect(applyMapping(rows, { national_id: "Rut", concept_code: "Concepto" })).toEqual([
      { rowNumber: 2, national_id: "1-9", concept_code: "HE50" },
    ]);
  });
});
