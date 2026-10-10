// Catálogo de códigos del motor (docs/specs/design.md §4.2).
// La severidad y el responsable reales vienen de validation_rules; estos valores solo se usan
// si un código no tiene fila configurada.
export const CATALOG = [
  { code: "STR-001", level: "batch", severity: "blocking", owner: "site" },
  { code: "STR-002", level: "batch", severity: "info", owner: "central" },
  { code: "STR-003", level: "batch", severity: "blocking", owner: "site" },
  { code: "STR-004", level: "row", severity: "blocking", owner: "site" },
  { code: "STR-005", level: "batch", severity: "warning", owner: "site" },
  { code: "IDN-001", level: "row", severity: "blocking", owner: "site" },
  { code: "IDN-002", level: "row", severity: "blocking", owner: "central" },
  { code: "IDN-003", level: "row", severity: "blocking", owner: "site" },
  { code: "IDN-004", level: "row", severity: "blocking", owner: "central" },
  { code: "IDN-005", level: "row", severity: "blocking", owner: "central" },
  { code: "IDN-006", level: "row", severity: "blocking", owner: "site" },
  { code: "PER-001", level: "row", severity: "blocking", owner: "site" },
  { code: "PER-002", level: "batch", severity: "blocking", owner: "central" },
  { code: "PER-003", level: "row", severity: "blocking", owner: "site" },
  { code: "DUP-001", level: "row", severity: "blocking", owner: "site" },
  { code: "DUP-002", level: "batch", severity: "blocking", owner: "central" },
  { code: "DUP-003", level: "row", severity: "warning", owner: "central" },
  { code: "COH-001", level: "row", severity: "warning", owner: "site" },
  { code: "COH-002", level: "row", severity: "warning", owner: "site" },
  { code: "COH-003", level: "row", severity: "warning", owner: "site" },
  { code: "COH-004", level: "row", severity: "warning", owner: "site" },
  { code: "LEG-001", level: "row", severity: "blocking", owner: "site" },
  { code: "LEG-002", level: "row", severity: "warning", owner: "central" },
  { code: "LEG-003", level: "row", severity: "blocking", owner: "central" },
  { code: "LEG-004", level: "row", severity: "warning", owner: "site" },
  { code: "LEG-005", level: "row", severity: "warning", owner: "central" },
  { code: "CON-001", level: "row", severity: "blocking", owner: "site" },
  { code: "CON-002", level: "row", severity: "blocking", owner: "site" },
  { code: "CON-003", level: "row", severity: "blocking", owner: "site" },
  { code: "RNG-001", level: "row", severity: "warning", owner: "central" },
  { code: "RNG-002", level: "batch", severity: "info", owner: "central" },
];

export const CATALOG_CODES = CATALOG.map((c) => c.code);

export const CATALOG_BY_CODE = Object.fromEntries(CATALOG.map((c) => [c.code, c]));

// Etiquetas visibles de los campos internos. El identificador nacional se rotula con
// context.country.nationalIdLabel cuando se conoce el país.
export const FIELD_LABELS = {
  national_id: "Identificador nacional",
  employee_code: "Código de empleado",
  employee_name: "Nombre",
  concept_code: "Concepto",
  date: "Fecha",
  quantity: "Cantidad",
  unit: "Unidad",
  support_ref: "Respaldo",
  notes: "Observación",
};

export const REQUIRED_FIELDS = ["concept_code", "date", "quantity"];

// Categorías genéricas de concepto (no códigos de concepto).
export const CATEGORY_LABELS = {
  overtime: "horas extraordinarias",
  vacation: "feriado",
  medical_leave: "licencia médica",
  absence: "ausencias",
  benefit: "beneficios",
};

export const UNIT_LABELS = { hours: "horas", days: "días" };

const ORDER = Object.fromEntries(CATALOG.map((c, i) => [c.code, i]));
export const catalogOrder = (code) => ORDER[code] ?? 999;
