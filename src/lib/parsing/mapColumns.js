// Mapeo de encabezados del archivo a campos internos usando column_aliases (datos, no código).

// Encabezados de la plantilla oficial (design.md §3): usarlos no cuenta como columna renombrada.
export const TEMPLATE_HEADERS = {
  national_id: "rut",
  employee_code: "codigo_empleado",
  employee_name: "nombre",
  concept_code: "concepto",
  date: "fecha",
  quantity: "cantidad",
  unit: "unidad",
  support_ref: "respaldo",
  notes: "observacion",
};

export const MAPPABLE_FIELDS = Object.keys(TEMPLATE_HEADERS);

export function normalizeHeader(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[\s_]+/g, " ")
    .trim();
}

/** Campos obligatorios sin columna: concepto, fecha, cantidad y (identificador o código). */
export function computeMissingFields(mapping) {
  const missing = [];
  if (!mapping.national_id && !mapping.employee_code) missing.push("national_id");
  for (const f of ["concept_code", "date", "quantity"]) if (!mapping[f]) missing.push(f);
  return missing;
}

/**
 * @param {string[]} headers
 * @param {{ field: string, alias: string, countryCode?: string|null }[]} aliases
 * @param {{ countryCode?: string, templateHeaders?: Record<string,string> }} [options]
 * @returns {{ mapping: Record<string,string>, renamed: {header,field}[], missingFields: string[], unmapped: string[] }}
 */
export function suggestMapping(headers = [], aliases = [], options = {}) {
  const template = options.templateHeaders || TEMPLATE_HEADERS;
  const countryCode = options.countryCode;
  const templateByNorm = new Map(Object.entries(template).map(([field, h]) => [normalizeHeader(h), field]));

  // Alias del país primero, luego globales; se ignoran alias de otros países.
  const relevant = aliases.filter((a) => !countryCode || !a.countryCode || a.countryCode === countryCode);
  relevant.sort((a, b) => Number(!a.countryCode) - Number(!b.countryCode));
  const aliasByNorm = new Map();
  for (const a of relevant) {
    const key = normalizeHeader(a.alias);
    if (key && !aliasByNorm.has(key)) aliasByNorm.set(key, a.field);
  }

  const mapping = {};
  const renamed = [];
  const unmapped = [];
  const pending = [];

  // Primera pasada: encabezados idénticos a la plantilla.
  for (const header of headers) {
    const field = templateByNorm.get(normalizeHeader(header));
    if (field && !mapping[field]) mapping[field] = header;
    else pending.push(header);
  }
  // Segunda pasada: alias configurados (cuentan como renombrados, STR-002).
  for (const header of pending) {
    const field = aliasByNorm.get(normalizeHeader(header));
    if (field && !mapping[field]) {
      mapping[field] = header;
      renamed.push({ header, field });
    } else {
      unmapped.push(header);
    }
  }

  const order = (h) => headers.indexOf(h);
  renamed.sort((a, b) => order(a.header) - order(b.header));
  unmapped.sort((a, b) => order(a) - order(b));
  return { mapping, renamed, missingFields: computeMissingFields(mapping), unmapped };
}

/** Convierte filas leídas ({ rowNumber, values }) en filas del motor ({ rowNumber, <campo>: valor }). */
export function applyMapping(rows = [], mapping = {}) {
  const entries = Object.entries(mapping).filter(([, header]) => header);
  return rows.map((row) => {
    const out = { rowNumber: row.rowNumber };
    for (const [field, header] of entries) out[field] = row.values?.[header] ?? null;
    return out;
  });
}
