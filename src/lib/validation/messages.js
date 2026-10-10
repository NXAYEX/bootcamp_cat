// Textos genéricos del motor, usados solo si validation_rules no trae message_template.
const GENERIC = {
  "STR-001": "Falta la columna obligatoria «{fieldLabel}».",
  "STR-002": "La columna «{header}» se interpretó como «{fieldLabel}».",
  "STR-003": "El archivo no tiene filas con novedades.",
  "STR-004": "Valor inválido en «{fieldLabel}»: «{value}». {detail}",
  "STR-005": "El nombre de archivo «{fileName}» no sigue el patrón esperado.",
  "IDN-001": "{idLabel} inválido: «{value}».",
  "IDN-002": "El trabajador {value} no existe en el maestro de empleados.",
  "IDN-003": "El trabajador {employeeCode} pertenece a la planta {employeeSite}, no a {site}.",
  "IDN-004": "El trabajador {employeeCode} fue desvinculado el {terminationDate}; la novedad es del {date}.",
  "IDN-005": "El trabajador {employeeCode} ingresó el {hireDate}; la novedad es del {date}.",
  "IDN-006": "El {idLabel} y el código {employeeCode} corresponden a trabajadores distintos.",
  "PER-001": "La fecha {date} está fuera del periodo declarado {period}.",
  "PER-002": "El periodo {period} ya está cerrado.",
  "PER-003": "La fecha {date} es futura.",
  "DUP-001": "Novedad repetida: {employeeCode}, {conceptCode}, {date} (también en la fila {firstRow}).",
  "DUP-002": "Este lote es idéntico a uno ya enviado.",
  "DUP-003": "La novedad {employeeCode}, {conceptCode}, {date} ya fue informada en otro lote del periodo.",
  "COH-001": "Vacaciones y horas extra el mismo día ({date}).",
  "COH-002": "Ausencia y horas extra el mismo día ({date}).",
  "COH-003": "Licencia médica cruzada con vacaciones el {date}.",
  "COH-004": "Vacaciones registradas en día no hábil ({date}).",
  "LEG-001": "{quantity} horas extra el {date}; el tope diario es {max}.",
  "LEG-002": "{total} horas extra en la semana {week}; el tope semanal es {max}.",
  "LEG-003": "Se informan {total} días de vacaciones y el saldo de {employeeCode} es {balance}.",
  "LEG-004": "El concepto {conceptCode} exige respaldo y no viene.",
  "LEG-005": "La jornada contractual de {employeeCode} ({weeklyHours} h) supera la jornada legal vigente de {max} h.",
  "CON-001": "El concepto «{value}» no existe.",
  "CON-002": "El concepto «{value}» no existe en este país (solo en {otherCountries}).",
  "CON-003": "La unidad «{value}» no corresponde al concepto {conceptCode} (se espera {expectedUnit}).",
  "RNG-001": "{employeeCode} suma {total} en {categoryLabel}; su promedio histórico mensual es {mean}.",
  "RNG-002": "La planta suma {total} en {categoryLabel}; su promedio histórico mensual es {mean}.",
};

export function renderMessage(template, params = {}) {
  return String(template || "")
    .replace(/\{(\w+)\}/g, (_, key) => {
      const v = params[key];
      return v === null || v === undefined ? "" : String(v);
    })
    .replace(/\s+/g, " ")
    .trim();
}

export function buildMessage(code, template, params) {
  return renderMessage(template || GENERIC[code] || `Hallazgo ${code}.`, params);
}
