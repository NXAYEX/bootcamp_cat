import * as XLSX from "xlsx";
import Papa from "papaparse";

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_ROWS = 20000;

const isBlank = (v) => v === null || v === undefined || (typeof v === "string" && v.trim() === "");

async function toUint8Array(input) {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  if (input && typeof input.arrayBuffer === "function") return new Uint8Array(await input.arrayBuffer());
  throw new Error("No se pudo leer el archivo: formato de entrada no soportado.");
}

function decodeText(bytes) {
  // TextDecoder descarta el BOM UTF-8. Si el archivo no es UTF-8 válido, se asume Windows-1252 (Excel en español).
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

function cleanHeaders(rawHeaders) {
  const used = new Map();
  return rawHeaders.map((h, i) => {
    let name = isBlank(h) ? `columna_${i + 1}` : String(h).trim();
    const count = used.get(name) || 0;
    used.set(name, count + 1);
    if (count) name = `${name} (${count + 1})`;
    return name;
  });
}

/** matrix: arreglo de filas (arreglos de celdas); firstRowNumber: número de fila de la primera fila del arreglo. */
function fromMatrix(matrix, firstRowNumber) {
  let start = 0;
  while (start < matrix.length && (matrix[start] || []).every(isBlank)) start++;
  if (start >= matrix.length) return { headers: [], rows: [] };
  const headers = cleanHeaders(matrix[start]);
  const rows = [];
  for (let i = start + 1; i < matrix.length; i++) {
    const cells = matrix[i] || [];
    if (cells.every(isBlank)) continue;
    const values = {};
    headers.forEach((h, c) => {
      const v = cells[c];
      values[h] = typeof v === "string" ? v.trim() : v ?? null;
    });
    rows.push({ rowNumber: firstRowNumber + i, values });
    if (rows.length > MAX_ROWS) {
      throw new Error(`El archivo supera el máximo de ${MAX_ROWS.toLocaleString("es-CL")} filas. Divídelo en archivos más pequeños.`);
    }
  }
  return { headers, rows };
}

function readCsv(bytes) {
  const text = decodeText(bytes).replace(/^﻿/, "");
  const parsed = Papa.parse(text, { delimiter: "", delimitersToGuess: [";", ",", "\t"], skipEmptyLines: false });
  // Papaparse informa errores de cantidad de campos; no son fatales para el motor.
  return fromMatrix(parsed.data, 1);
}

function readWorkbook(bytes) {
  let wb;
  try {
    wb = XLSX.read(bytes, { type: "array", cellDates: false });
  } catch {
    throw new Error("No se pudo leer el archivo Excel. Verifica que no esté dañado ni protegido con contraseña.");
  }
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet || !sheet["!ref"]) return { headers: [], rows: [] };
  const range = XLSX.utils.decode_range(sheet["!ref"]);
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null, blankrows: true });
  return fromMatrix(matrix, range.s.r + 1);
}

/**
 * Lee un Excel (.xlsx/.xls) o CSV (, o ;) en el navegador o en Node.
 * @param {File|Blob|ArrayBuffer|Uint8Array} input
 * @param {string} fileName
 * @returns {Promise<{ headers: string[], rows: { rowNumber: number, values: Record<string, any> }[] }>}
 */
export async function readTabularFile(input, fileName = "") {
  const name = fileName || input?.name || "";
  const size = input?.size ?? input?.byteLength;
  if (typeof size === "number" && size > MAX_FILE_BYTES) {
    throw new Error("El archivo supera el máximo de 10 MB.");
  }
  const bytes = await toUint8Array(input);
  if (bytes.byteLength > MAX_FILE_BYTES) throw new Error("El archivo supera el máximo de 10 MB.");

  const ext = (name.split(".").pop() || "").toLowerCase();
  if (ext === "csv" || ext === "txt") return readCsv(bytes);
  if (ext === "xlsx" || ext === "xls" || ext === "xlsm") return readWorkbook(bytes);
  throw new Error("Formato no soportado. Sube un archivo .xlsx, .xls o .csv.");
}
