// Genera los archivos de ejemplo de samples/ con errores sembrados y su resultado esperado.
// Usa empleados REALES del maestro sintético (supabase/seed/generated), el mismo que carga el seed,
// para que la web produzca exactamente los mismos hallazgos.
// Uso: node scripts/generate-samples.mjs
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as XLSX from "xlsx";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const samplesDir = join(root, "samples");
const expectedDir = join(samplesDir, "expected");
mkdirSync(expectedDir, { recursive: true });

const readJson = (rel) => JSON.parse(readFileSync(join(root, rel), "utf8"));
const EMP = {
  CL: readJson("supabase/seed/generated/employees-cl.json"),
  VD: readJson("supabase/seed/generated/employees-vd.json"),
};
const emp = (code) => {
  const country = code.startsWith("VD") ? "VD" : "CL";
  const e = EMP[country].find((x) => x.employeeCode === code);
  if (!e) throw new Error(`Empleado ${code} no existe en el maestro`);
  return e;
};

// RUT con puntos ("22.480.194-7"), como suele venir de Excel.
const dotted = (rut) => {
  const [body, dv] = rut.split("-");
  return `${body.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}-${dv}`;
};
const dmy = (iso) => `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`;
const excelSerial = (iso) => (Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) - Date.UTC(1899, 11, 30)) / 86400000;

/** Fila de novedad a partir de un empleado del maestro. `seeded` documenta el error sembrado. */
function nov(code, concept, date, quantity, unit, extra = {}) {
  const e = emp(code);
  return {
    national_id: e.nationalId.startsWith("VD") ? e.nationalId : dotted(e.nationalId),
    employee_code: e.employeeCode,
    employee_name: `${e.firstName} ${e.lastName}`,
    concept_code: concept,
    date,
    quantity,
    unit,
    support_ref: "",
    notes: "",
    seeded: [],
    ...extra,
  };
}
const seed = (row, ...items) => ({ ...row, seeded: [...row.seeded, ...items.map(([code, label]) => ({ code, label }))] });

const TEMPLATE = [
  ["rut", "national_id"],
  ["codigo_empleado", "employee_code"],
  ["nombre", "employee_name"],
  ["concepto", "concept_code"],
  ["fecha", "date"],
  ["cantidad", "quantity"],
  ["unidad", "unit"],
  ["respaldo", "support_ref"],
  ["observacion", "notes"],
];

// ---------- 1. Archivo limpio ----------
const STG_NORMAL = ["CL-000011", "CL-000012", "CL-000013", "CL-000014", "CL-000015", "CL-000016", "CL-000017", "CL-000018", "CL-000019", "CL-000020", "CL-000021", "CL-000022", "CL-000023", "CL-000024", "CL-000025", "CL-000026", "CL-000027", "CL-000028", "CL-000029", "CL-000030"];
const WEEKDAYS = ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-07", "2026-09-08", "2026-09-09", "2026-09-10", "2026-09-11", "2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18", "2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25", "2026-09-28"];
const cleanRows = [
  ...STG_NORMAL.map((c, i) => nov(c, "HE50", WEEKDAYS[i], 2, i % 3 === 0 ? "horas" : "hours")),
  nov("CL-000011", "FER", "2026-09-29", 1, "días"),
  nov("CL-000012", "FER", "2026-09-30", 1, "dias"),
  nov("CL-000013", "HE100", "2026-09-18", "1,5", "hrs", { support_ref: "AUT-2026-0913" }),
  nov("CL-000014", "LM", "2026-09-21", 3, "días", { support_ref: "LM-55120" }),
  nov("CL-000015", "PCG", "2026-09-22", 1, "días", { support_ref: "CERT-118", notes: "Nacimiento" }),
];

// ---------- 2. Identidad ----------
const identityRows = [
  nov("CL-000011", "HE50", "2026-09-14", 2, "horas"),
  seed(nov("CL-000011", "HE50", "2026-09-15", 1, "horas", { national_id: "22.480.194-0", employee_code: "" }), ["IDN-001", "RUT con dígito verificador inválido"]),
  seed(nov("CL-000012", "HE50", "2026-09-15", 1, "horas", { national_id: "12.345.678-5", employee_code: "", employee_name: "Persona Inexistente" }), ["IDN-002", "RUT válido que no está en el maestro"]),
  seed(nov("CL-000091", "HE50", "2026-09-15", 2, "horas"), ["IDN-003", "Trabajador de CL-ANF informado por CL-STG"]),
  seed(nov("CL-000005", "HE50", "2026-09-15", 2, "horas"), ["IDN-004", "CL-000005 desvinculado el 2026-09-10"]),
  seed(nov("CL-000006", "HE50", "2026-09-14", 2, "horas"), ["IDN-005", "CL-000006 contratado el 2026-09-20"]),
  seed(nov("CL-000012", "HE50", "2026-09-16", 2, "horas", { employee_code: "CL-000013" }), ["IDN-006", "RUT de CL-000012 con código CL-000013"]),
  nov("CL-000013", "FER", "2026-09-17", 1, "días"),
];

// ---------- 3. CSV de Antofagasta con columnas renombradas ----------
const ANF_COLUMNS = [
  ["Rut_Empleado", "national_id"],
  ["codigo_empleado", "employee_code"],
  ["nombre", "employee_name"],
  ["Tipo_Novedad", "concept_code"],
  ["Fecha_Novedad", "date"],
  ["Horas", "quantity"],
  ["unidad", "unit"],
  ["respaldo", "support_ref"],
];
const anfRows = [
  nov("CL-000092", "HE50", "2026-09-14", "2", "horas"),
  seed(nov("CL-000093", "HE50", "2026-08-28", "2", "horas"), ["PER-001", "Fecha de agosto en el lote de septiembre"]),
  seed(nov("CL-000094", "HE50", "2026-12-15", "2", "horas"), ["PER-001", "Fecha de diciembre (fuera del mes)"], ["PER-003", "Fecha futura (2026-12-15)"]),
  nov("CL-000095", "HE50", "2026-09-16", "1", "horas"),
  seed(nov("CL-000095", "HE50", "2026-09-16", "1", "horas"), ["DUP-001", "Repite la fila 5"]),
  seed(nov("CL-000096", "HEX", "2026-09-17", "2", "horas"), ["CON-001", "Concepto HEX inexistente"]),
  seed(nov("CL-000097", "BONO_ASIST", "2026-09-17", "1", "días"), ["CON-002", "BONO_ASIST solo existe en VD"]),
  seed(nov("CL-000098", "HE50", "2026-09-18", "2", "días"), ["CON-003", "HE50 informado en días"]),
  seed(nov("CL-000092", "HE50", "2026-09-21", "dos", "horas"), ["STR-004", "Cantidad no numérica («dos»)"]),
];

// ---------- 4. Reglas legales, coherencia y rangos ----------
const week39 = ["2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25", "2026-09-26", "2026-09-27"];
const rng = ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-07", "2026-09-08", "2026-09-09", "2026-09-10", "2026-09-11"];
const legalRows = [
  seed(nov("CL-000011", "HE50", "2026-09-14", 3, "horas"), ["LEG-001", "3 h extra en un día (tope 2)"]),
  ...week39.map((d, i) =>
    i === 6 ? seed(nov("CL-000029", "HE50", d, 2, "horas"), ["LEG-002", "CL-000029 acumula 14 h en la semana ISO 39 (tope 12)"]) : nov("CL-000029", "HE50", d, 2, "horas"),
  ),
  nov("CL-000008", "FER", "2026-09-14", 1, "días"),
  nov("CL-000008", "FER", "2026-09-15", 1, "días"),
  seed(nov("CL-000008", "FER", "2026-09-16", 1, "días"), ["LEG-003", "CL-000008 usa 3 días con saldo 2"]),
  seed(nov("CL-000013", "LM", "2026-09-17", 1, "días"), ["LEG-004", "Licencia médica sin folio"]),
  seed(nov("CL-000007", "HE50", "2026-09-15", 1, "horas"), ["LEG-005", "CL-000007 con jornada de 45 h (límite 42)"]),
  nov("CL-000014", "FER", "2026-09-14", 1, "días"),
  seed(nov("CL-000014", "HE50", "2026-09-14", 1, "horas"), ["COH-001", "Feriado y horas extra el mismo día"]),
  nov("CL-000015", "AUSI", "2026-09-15", 1, "días"),
  seed(nov("CL-000015", "HE50", "2026-09-15", 1, "horas"), ["COH-002", "Ausencia y horas extra el mismo día"]),
  nov("CL-000016", "FER", "2026-09-16", 1, "días"),
  seed(nov("CL-000016", "LM", "2026-09-16", 1, "días", { support_ref: "LM-77801" }), ["COH-003", "Licencia médica el mismo día que feriado"]),
  seed(nov("CL-000017", "FER", "2026-09-19", 1, "días"), ["COH-004", "Feriado en sábado"]),
  ...rng.map((d, i) =>
    i === rng.length - 1 ? seed(nov("CL-000009", "HE50", d, 2, "horas"), ["RNG-001", "CL-000009 suma 18 h (historial ≈ 2 h/mes)"]) : nov("CL-000009", "HE50", d, 2, "horas"),
  ),
];

// ---------- 5. Periodo cerrado ----------
const closedRows = [
  nov("CL-000011", "HE50", "2026-08-12", 2, "horas"),
  nov("CL-000012", "FER", "2026-08-13", 1, "días"),
  nov("CL-000013", "HE50", "2026-08-14", 1, "horas"),
];

// ---------- 6. Falta la columna fecha ----------
const noDateColumns = TEMPLATE.filter(([, f]) => f !== "date");
const noDateRows = [nov("CL-000151", "HE50", "2026-09-14", 2, "horas"), nov("CL-000152", "FER", "2026-09-15", 1, "días")];

// ---------- 8. Valdoria (país ficticio) ----------
const vdRows = [
  nov("VD-0001", "OT", "2026-09-14", 3, "hours"),
  seed(nov("VD-0002", "OT", "2026-09-14", 4, "hours"), ["LEG-001", "4 h extra (tope VD 3; advertencia por regla del país)"]),
  nov("VD-0004", "BONO_ASIST", "2026-09-15", 1, "days"),
  seed(nov("VD-0003", "OT", "2026-09-07", 1, "hours"), ["IDN-004", "VD-0003 desvinculado el 2026-09-05"]),
  seed(nov("VD-0005", "HE50", "2026-09-16", 1, "hours"), ["CON-002", "HE50 es un concepto de CL"]),
  nov("VD-0006", "VAC", "2026-09-19", 1, "days"),
];

const SAMPLES = [
  { file: "NOV_CL_CL-STG_2026-09.xlsx", siteCode: "CL-STG", period: "2026-09", description: "Archivo limpio: 25 novedades sin hallazgos.", columns: TEMPLATE, rows: cleanRows },
  { file: "NOV_CL_CL-STG_2026-09_identidad.xlsx", siteCode: "CL-STG", period: "2026-09", description: "Errores de identidad del trabajador; el sufijo _identidad rompe el patrón de nombre.", columns: TEMPLATE, rows: identityRows, batch: [["STR-005", "Nombre con sufijo _identidad"]] },
  { file: "NOV_CL_CL-ANF_2026-09.csv", siteCode: "CL-ANF", period: "2026-09", description: "CSV con punto y coma, columnas renombradas y errores de periodo, duplicados, conceptos y tipos.", columns: ANF_COLUMNS, rows: anfRows, batch: [["STR-002", "Rut_Empleado → identificador"], ["STR-002", "Tipo_Novedad → concepto"], ["STR-002", "Fecha_Novedad → fecha"], ["STR-002", "Horas → cantidad"]] },
  { file: "NOV_CL_CL-STG_2026-09_legal.xlsx", siteCode: "CL-STG", period: "2026-09", description: "Topes legales, coherencia entre conceptos y valores atípicos; el sufijo _legal rompe el patrón de nombre.", columns: TEMPLATE, rows: legalRows, batch: [["STR-005", "Nombre con sufijo _legal"]] },
  { file: "NOV_CL_CL-STG_2026-08.xlsx", siteCode: "CL-STG", period: "2026-08", description: "Novedades de un periodo ya cerrado.", columns: TEMPLATE, rows: closedRows, batch: [["PER-002", "Agosto 2026 está cerrado"]] },
  { file: "NOV_CL_CL-CON_2026-09.xlsx", siteCode: "CL-CON", period: "2026-09", description: "Plantilla sin la columna fecha.", columns: noDateColumns, rows: noDateRows, batch: [["STR-001", "Falta la columna fecha"]] },
  { file: "NOV_CL_CL-CON_2026-10.xlsx", siteCode: "CL-CON", period: "2026-10", description: "Plantilla con encabezados y sin filas.", columns: TEMPLATE, rows: [], batch: [["STR-003", "Archivo sin filas"]] },
  { file: "NOV_VD_VD-NOR_2026-09.xlsx", siteCode: "VD-NOR", period: "2026-09", description: "País ficticio Valdoria: otro identificador, otros conceptos y otro tope.", columns: TEMPLATE, rows: vdRows },
];

function writeXlsx(path, columns, rows) {
  const aoa = [columns.map(([h]) => h), ...rows.map((r) => columns.map(([, f]) => (f === "date" ? excelSerial(r.date) : r[f])))];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const dateCol = columns.findIndex(([, f]) => f === "date");
  if (dateCol >= 0) {
    for (let i = 1; i <= rows.length; i++) {
      const cell = ws[XLSX.utils.encode_cell({ r: i, c: dateCol })];
      if (cell) cell.z = "dd-mm-yyyy";
    }
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Novedades");
  writeFileSync(path, XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
}

function writeCsv(path, columns, rows) {
  const esc = (v) => (/[;"\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? ""));
  const lines = [columns.map(([h]) => h).join(";"), ...rows.map((r) => columns.map(([, f]) => esc(f === "date" ? dmy(r.date) : r[f])).join(";"))];
  writeFileSync(path, "﻿" + lines.join("\r\n") + "\r\n", "utf8");
}

const readme = [];
for (const s of SAMPLES) {
  const path = join(samplesDir, s.file);
  if (s.file.endsWith(".csv")) writeCsv(path, s.columns, s.rows);
  else writeXlsx(path, s.columns, s.rows);

  const expected = [];
  for (const [code, label] of s.batch || []) {
    expected.push({ code, rowNumber: null });
    readme.push([s.file, s.siteCode, s.period, `${code} — ${label}`, "lote"]);
  }
  s.rows.forEach((r, i) => {
    for (const { code, label } of r.seeded) {
      expected.push({ code, rowNumber: i + 2 });
      readme.push([s.file, s.siteCode, s.period, `${code} — ${label}`, String(i + 2)]);
    }
  });
  if (!expected.length) readme.push([s.file, s.siteCode, s.period, "Ninguno (archivo limpio)", "—"]);
  const json = { file: s.file, countryCode: s.siteCode.slice(0, 2), siteCode: s.siteCode, period: s.period, description: s.description, expected };
  writeFileSync(join(expectedDir, `${s.file}.json`), JSON.stringify(json, null, 2) + "\n");
}

const md = `# Archivos de ejemplo (samples)

Archivos **generados** por \`node scripts/generate-samples.mjs\` (el script es la fuente; no editar a mano).
Usan trabajadores **sintéticos** del maestro \`supabase/seed/generated/\`, el mismo que carga el seed, de modo que la web y las pruebas producen los mismos hallazgos.
Fecha de referencia de las pruebas: 2026-10-10. El resultado esperado de cada archivo está en \`expected/<archivo>.json\`; \`src/lib/validation/samples.test.js\` los compara y escribe \`docs/evaluacion-resultados.json\`.

| Archivo | Planta | Periodo | Error sembrado | Fila |
|---|---|---|---|---|
${readme.map((r) => `| ${r.join(" | ")} |`).join("\n")}

## Casos que no se siembran en un solo archivo

- **DUP-002** (lote idéntico ya enviado): en la web, sube dos veces \`NOV_CL_CL-STG_2026-09.xlsx\`; el segundo envío tiene la misma huella. Cubierto en \`engine.test.js\`.
- **DUP-003** (novedad informada en otro lote del periodo): requiere un lote previo con la misma novedad (por ejemplo, subir \`NOV_CL_CL-STG_2026-09.xlsx\` y luego otro archivo con una de sus filas). Cubierto en \`engine.test.js\`.
- **RNG-002** (total atípico de la planta): necesita cientos de filas para superar el historial de la planta; cubierto en \`engine.test.js\` con un historial de prueba.
`;
writeFileSync(join(samplesDir, "README.md"), md);
process.stdout.write(`Samples generados: ${SAMPLES.length}\n`);
