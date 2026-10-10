# Diseño — Validador de Novedades de RR.HH. (spec maestro)

## 1. Arquitectura

```
Navegador (React + Vite, en Vercel)
  ├─ lib/parsing     Excel/CSV/docx → filas crudas → mapeo de columnas → filas normalizadas
  ├─ lib/validation  motor puro: (filas, contexto) → hallazgos + disposición + huella
  ├─ lib/procedures  auditor por palabras clave (modo sin IA), puntaje con pesos
  ├─ lib/export      CSV canónico
  └─ services/*      única capa que habla con Supabase ({ data, error })
Supabase
  ├─ Postgres + RLS (acceso por rol + país + planta + proceso)
  ├─ RPC security definer para toda escritura de negocio (submit_batch, approve_batch, …)
  ├─ Storage privado: batch-files, procedures
  └─ Edge Function ai-assist (fase 9, opcional)
```

**Principio:** la IA interpreta; el código decide. La disposición se recalcula en Postgres a partir de los hallazgos (`private.compute_disposition`), con la misma regla que el motor.

**Límite de confianza conocido:** la validación corre en el navegador (CLAUDE.md §14). Un cliente modificado podría omitir hallazgos al enviar. Mitigación futura: ejecutar el mismo motor en una Edge Function. Registrado en `docs/supuestos.md`.

## 2. Modelo de datos

Todas las tablas: `id uuid pk default gen_random_uuid()`, `created_at timestamptz default now()`, RLS activo en el mismo SQL.

| Tabla | Columnas clave | Lectura | Escritura |
|---|---|---|---|
| `countries` | `code` único, `name`, `national_id_label`, `national_id_validator` (`rut_mod11` \| `regex`), `national_id_regex`, `timezone` | autenticados | admin |
| `sites` | `country_code`, `code` único, `name` | autenticados | admin |
| `profiles` | `id` = auth.users.id, `email`, `full_name`, `role` | uno mismo; admin todos | admin (rol nunca editable por el propio usuario) |
| `user_access` | `user_id`, `country_code`, `site_id` (null = todo el país), `process` (`novedades` \| `procedimientos`) | uno mismo; admin | admin |
| `employees` | `country_code`, `site_id`, `employee_code`, `national_id` (oculto por privilegio de columna), `national_id_masked` (generada), nombres, `hire_date`, `termination_date`, `leave_balance_days`, `weekly_hours` | `has_site_access(site_id)`; vista `employees_directory` | solo seed/admin vía SQL |
| `employee_history` | `employee_id`, `site_id`, `period`, `category`, `total` | `has_site_access` | seed |
| `concepts` | `country_code`, `code`, `name`, `unit` (`hours`\|`days`), `category` (`overtime`\|`vacation`\|`absence`\|`medical_leave`\|`benefit`), `requires_support`, `active` | autenticados | admin |
| `country_rules` | `country_code`, `rule_key`, `value_numeric`, `value_text`, `unit`, `description`, `legal_reference`, `procedure_keywords text[]`, `valid_from`, `valid_to` | autenticados | admin |
| `validation_rules` | `code`, `country_code` (null = todos), `name`, `severity`, `owner` (`site`\|`central`), `message_template`, `active` | autenticados | admin |
| `column_aliases` | `country_code` (null = todos), `field`, `alias` | autenticados | admin |
| `payroll_periods` | `country_code`, `period`, `status` (`open`\|`closed`), `cutoff_date` | autenticados | admin |
| `batches` | `country_code`, `site_id`, `period`, `source` (`file`\|`mobile`), `file_name`, `file_path`, `fingerprint`, `row_count`, `status` (`validated`\|`approved`\|`rejected`\|`exported`), `disposition` (`load`\|`load_with_warnings`\|`block`), `approved_disposition`, `decision_note`, `created_by`, `approved_by`, `approved_at`, `export_id` | `has_site_access(site_id)` y rol supervisor/analista | solo RPC |
| `batch_rows` | `batch_id`, `country_code`, `site_id`, `row_number`, `employee_id`, `employee_code`, `national_id_masked`, `concept_code`, `date`, `quantity`, `unit`, `support_ref` | igual que batches | solo RPC |
| `findings` | `batch_id`, `country_code`, `site_id`, `row_number`, `code`, `severity`, `owner`, `field`, `value` (enmascarado si es RUT), `message`, `status` (`open`\|`in_correction`\|`resolved`\|`accepted`), `resolution_note`, `resolved_by`, `resolved_at` | igual que batches | solo RPC |
| `exports` | `country_code`, `period`, `batch_ids uuid[]`, `row_count`, `created_by` | analista con país | solo RPC |
| `procedures` | `country_code`, `site_id` null, `title`, `file_name`, `file_path`, `content_text`, `uploaded_by` | `has_country_access(country,'procedimientos')` | RPC |
| `procedure_checklist_items` | `country_code` null, `code`, `title`, `description`, `weight`, `keywords text[]`, `min_hits_full`, `min_hits_partial`, `uses_country_rules`, `question`, `suggested_text`, `sort_order`, `active` | autenticados | admin |
| `procedure_audits` | `procedure_id`, `country_code`, `method` (`keywords`\|`ai`), `score`, `created_by` | igual que procedures | RPC |
| `procedure_findings` | `audit_id`, `item_code`, `result` (`cumple`\|`parcial`\|`no_encontrado`), `evidence_quote`, `question`, `suggested_text`, `source`, `confidence`, `human_result`, `reviewed_by` | igual que procedures | RPC |
| `audit_log` | `user_id`, `action`, `module`, `entity`, `entity_id`, `details jsonb` | admin | solo funciones (`public.log_event`, triggers) |

### 2.1 Funciones auxiliares (`private`, security definer, `search_path = ''`)

- `private.user_role()` → rol del usuario actual.
- `private.is_admin()`.
- `private.has_site_access(site_id, process default 'novedades')`: existe fila en `user_access` con ese `site_id`, o con `site_id is null` y el país de la planta.
- `private.has_country_access(country_code, process default 'novedades')`: existe fila con ese país y `site_id is null` (acceso a todo el país).
- `private.has_any_country_access(country_code, process)`: cualquier fila del país (para buscar empleados en el maestro).
- `private.compute_disposition(batch_id)`: ≥1 bloqueante abierto → `block`; solo advertencias abiertas → `load_with_warnings`; si no → `load`. "Abierto" = `open` o `in_correction`. Los `info` no cuentan.

Se usan funciones `security definer` en un esquema no expuesto porque (1) evitan repetir la misma lógica en cada política y (2) leen `user_access` sin quedar sujetas a su propio RLS, lo que evita bucles de recursión.

### 2.2 RPC de negocio (security definer, validan rol y alcance)

| RPC | Quién | Qué hace |
|---|---|---|
| `match_employees(country, national_ids[], employee_codes[])` | supervisor/analista con acceso al país | Devuelve solo los empleados que coinciden con los RUT/códigos que el usuario ya tiene en su archivo |
| `submit_batch(batch jsonb, rows jsonb, findings jsonb)` | supervisor (sus plantas) / analista (sus países) | Inserta lote, filas y hallazgos de forma atómica; disposición calculada en SQL; audita |
| `update_finding_status(id, status, note)` | supervisor (owner=site) / analista | Ciclo de vida; aceptar solo advertencias, con justificación ≥ 10 caracteres |
| `approve_batch(id, note)` | analista del país | No permite `block`; con advertencias exige justificación y las marca aceptadas |
| `reject_batch(id, note)` | analista del país | Devuelve el lote a la planta |
| `export_batches(ids[])` | analista del país | Solo lotes `approved`; devuelve filas canónicas con RUT completo desde el maestro; marca `exported`; audita |
| `export_rows(export_id)` | analista del país | Vuelve a descargar una exportación; audita |
| `create_procedure`, `save_procedure_audit`, `review_procedure_finding` | process_owner / analista | Módulo B |
| `quality_metrics(country)` | analista (sus países) / admin | Agregados sin datos personales |
| `log_event(action, module, entity, entity_id, details)` | autenticados | Lecturas sensibles y llamadas a IA |

### 2.3 Storage

Buckets privados `batch-files` y `procedures`. Ruta `<country>/<site_code>/<period>/<uuid>.<ext>` (procedimientos: `<country>/<site_code|general>/<uuid>.<ext>`). Las políticas de `storage.objects` usan `storage.foldername(name)` para aplicar el mismo acceso por país y planta.

### 2.4 Privacidad de columnas

`national_id` de `employees` no tiene privilegio `select` para `authenticated`: la API devuelve error si se pide. Los listados usan `national_id_masked` (`12.***.***-5`). El RUT completo solo sale en `export_batches`. `batch_rows` guarda solo el RUT enmascarado.

## 3. Formato de entrada

Plantilla (alias configurables en `column_aliases`):

| Campo interno | Encabezado plantilla | Obligatorio |
|---|---|---|
| `national_id` | `rut` | sí (o `employee_code`) |
| `employee_code` | `codigo_empleado` | no |
| `employee_name` | `nombre` | no (no se guarda) |
| `concept_code` | `concepto` | sí |
| `date` | `fecha` | sí |
| `quantity` | `cantidad` | sí |
| `unit` | `unidad` | no |
| `support_ref` | `respaldo` | no |
| `notes` | `observacion` | no |

Nombre de archivo esperado (regla `file_name_pattern`): `NOV_<PAIS>_<PLANTA>_<AAAA-MM>.xlsx|csv`.

## 4. Motor de validación (`src/lib/validation/`)

### 4.1 Interfaz

```js
import { validateBatch } from "src/lib/validation";

const result = validateBatch({
  rows: [ // filas ya mapeadas a campos internos (valores crudos, como vienen del archivo)
    { rowNumber: 2, national_id: "12.345.678-5", employee_code: "CL-000123",
      concept_code: "HE50", date: "2026-09-14" | 46279 | "14-09-2026",
      quantity: "2" | 2 | "1,5", unit: "horas" | "hours" | "", support_ref: "" }
  ],
  structure: { // null para captura móvil
    fileName: "NOV_CL_STG-01_2026-09.xlsx",
    headers: ["rut", "concepto", ...],
    missingFields: ["date"],          // campos obligatorios sin columna
    renamed: [{ header: "Rut_Empleado", field: "national_id" }],
  },
  context: {
    today: "2026-10-10",
    period: "2026-09",
    country: { code: "CL", nationalIdValidator: "rut_mod11", nationalIdRegex: null },
    site: { code: "CL-STG", id: "uuid" },
    concepts: [{ countryCode, code, name, unit, category, requiresSupport, active }], // todos los países
    rules: [{ ruleKey, valueNumeric, valueText, validFrom, validTo }],               // del país
    validationRules: [{ code, countryCode, severity, owner, active, messageTemplate }],
    employees: [{ id, employeeCode, nationalId, siteCode, hireDate, terminationDate, leaveBalanceDays, weeklyHours }],
    closedPeriods: ["2026-08"],
    priorFingerprints: ["a1b2c3d4"],
    priorRowKeys: ["CL-000123|2026-09-14|HE50"],
    history: {
      employees: { "CL-000123": { overtime: { mean, sd, n } } },
      sites: { "CL-STG": { overtime: { mean, sd, n } } }
    },
  },
});
// → {
//   findings: [{ code, severity, owner, rowNumber|null, field|null, value|null, message, params }],
//   disposition: "load" | "load_with_warnings" | "block",
//   counts: { blocking, warning, info },
//   fingerprint: "8 hex",            // FNV-1a de filas normalizadas ordenadas
//   normalizedRows: [{ rowNumber, employeeId, employee_code, national_id, national_id_masked,
//                      concept_code, date: "YYYY-MM-DD", quantity: number, unit, support_ref }]
// }
```

- Severidad y responsable salen de `validationRules` (la fila del país gana a la global). Un código con `active = false` no genera hallazgos.
- Los mensajes usan `messageTemplate` con `{marcadores}` si existe; si no, un texto genérico del motor.
- Ningún valor de RUT sale completo en `value` ni en `message`: se enmascara.
- Las reglas legales se leen con `ruleValue(rules, key, date)` respetando `validFrom`/`validTo`.
- La validación del identificador nacional usa un registro de algoritmos (`rut_mod11`, `regex`), no el código de país.
- La coherencia usa `category` del concepto, nunca códigos de concepto fijos.

### 4.2 Catálogo

| Código | Regla | Nivel | Severidad CL / responsable |
|---|---|---|---|
| STR-001 | Columna obligatoria faltante | lote | blocking / site |
| STR-002 | Columna renombrada interpretada por alias | lote | info / central |
| STR-003 | Hoja o archivo sin filas | lote | blocking / site |
| STR-004 | Tipo de dato inválido (fecha ilegible, cantidad no numérica o ≤ 0, campo obligatorio vacío) | fila | blocking / site |
| STR-005 | Nombre de archivo fuera de patrón | lote | warning / site |
| IDN-001 | Identificador nacional inválido (dígito verificador o formato) | fila | blocking / site |
| IDN-002 | Empleado inexistente en el maestro | fila | blocking / central |
| IDN-003 | Empleado de otra planta | fila | blocking / site |
| IDN-004 | Fecha posterior a la desvinculación | fila | blocking / central |
| IDN-005 | Fecha anterior a la contratación | fila | blocking / central |
| IDN-006 | RUT y código de empleado no corresponden a la misma persona | fila | blocking / site |
| PER-001 | Fecha fuera del mes declarado | fila | blocking / site |
| PER-002 | Periodo ya cerrado | lote | blocking / central |
| PER-003 | Fecha futura | fila | blocking / site |
| DUP-001 | Misma persona, fecha y concepto repetidos en el archivo | fila | blocking / site |
| DUP-002 | Lote idéntico ya enviado (misma huella) | lote | blocking / central |
| DUP-003 | Novedad ya informada en otro lote del periodo | fila | warning / central |
| COH-001 | Vacaciones y horas extra el mismo día | fila | warning / site |
| COH-002 | Ausencia y horas extra el mismo día | fila | warning / site |
| COH-003 | Licencia médica cruzada con vacaciones | fila | warning / site |
| COH-004 | Feriado legal en día no hábil (sábado/domingo) | fila | warning / site |
| LEG-001 | Supera tope diario de horas extra (`max_overtime_hours_per_day`) | fila | blocking / site |
| LEG-002 | Supera tope semanal de horas extra (`max_overtime_hours_per_week`, semana ISO) | fila | warning / central |
| LEG-003 | Días de feriado superan el saldo del trabajador | fila | blocking / central |
| LEG-004 | Concepto exige respaldo y no viene | fila | warning / site |
| LEG-005 | Jornada contractual supera la jornada legal vigente (`weekly_hours_limit`) | fila | warning / central |
| CON-001 | Código de concepto desconocido | fila | blocking / site |
| CON-002 | Concepto o beneficio que no existe en este país (existe en otro) | fila | blocking / site |
| CON-003 | Unidad distinta a la del concepto | fila | blocking / site |
| RNG-001 | Total del trabajador atípico frente a su historial (z > `outlier_z_score`, n ≥ 3) | fila | warning / central |
| RNG-002 | Total de la planta atípico frente a su historial | lote | info / central |

Precedencia para evitar ruido: si una fila tiene STR-004 o CON-001/CON-002, no se evalúan sus reglas LEG/COH. Si IDN-001 o IDN-002, no se evalúan IDN-003…006 ni LEG/RNG de esa fila. Un hallazgo de fila se reporta una vez por fila y código.

### 4.3 Pruebas y samples

- `src/lib/validation/*.test.js`: ≥ 1 caso que pasa y 1 que falla por código.
- `samples/*.xlsx|csv` + `samples/expected/<archivo>.json` (`{ period, siteCode, expected: [{ code, rowNumber }] }`).
- `samples.test.js` compara por `(code, rowNumber)`, calcula detección = encontrados esperados / esperados y falsos positivos = detectados no esperados / detectados, y escribe `docs/evaluacion-resultados.json`.
- Los datos de referencia de las pruebas salen de la misma fuente que el seed: `supabase/seed/source/*.json`.

## 5. Módulo B (`src/lib/procedures/`)

- `auditProcedure({ text, checklist, countryRules })` → `{ findings: [{ itemCode, result, evidenceQuote, question, suggestedText }], score }`.
- Párrafos = bloques separados por línea en blanco; por ítem se cuentan palabras clave distintas (sin tildes, minúsculas) por párrafo; el mejor párrafo es la cita (texto exacto del documento).
- `cumple` si hits ≥ `min_hits_full`, `parcial` si ≥ `min_hits_partial`, si no `no_encontrado` (cita null).
- Ítems con `uses_country_rules`: cada regla vigente con `procedure_keywords` debe aparecer; todas → cumple, alguna → parcial.
- Puntaje = Σ peso × (1 \| 0,5 \| 0) / Σ pesos × 100, redondeado a 1 decimal.

## 6. Rutas y roles

Según CLAUDE.md §12. `RoleRoute` solo oculta; la protección es RLS.

## 7. IA (fase 9)

Edge Function `ai-assist` (Deno). Entrada `{ task: "map_columns" | "explain_finding" | "audit_procedure", payload }`. Verifica el JWT del usuario, aplica minimización (encabezados, códigos de hallazgo, texto del procedimiento), llama al proveedor configurado en secrets (`AI_PROVIDER`, `AI_API_KEY`, `AI_MODEL`), valida el JSON contra un esquema fijo y registra en `audit_log` sin contenido sensible. El frontend usa `services/ai.js`; ante cualquier error cae al modo sin IA.

## 8. Escalabilidad

Segundo país ficticio **Valdoria (`VD`)** en una migración de solo inserciones: planta, conceptos (incluye `BONO_ASIST`, bono por asistencia que solo existe ahí), reglas distintas (3 h extra diarias, 45 h semanales, 20 días de feriado), validador de identificador por expresión regular y empleados sintéticos. Ningún archivo de `src/` cambia.
