# Supuestos y limitaciones

Todo supuesto de negocio, legal o técnico se registra aquí (CLAUDE.md §17). Las reglas legales son **referenciales** y deben ser validadas por un especialista laboral antes de un uso real.

## Datos

| # | Supuesto | Por qué |
|---|---|---|
| D1 | Todos los datos son sintéticos: 200 empleados de Chile en 3 plantas (Santiago 90, Antofagasta 60, Concepción 50) y 30 del país ficticio Valdoria. Los apellidos son palabras como "Muestra" o "Ensayo" para que nadie los confunda con personas reales. | CLAUDE.md §1.1: prohibido usar datos reales. |
| D2 | El maestro de empleados simula a Workday y es de solo lectura desde la app. | En el caso real, la fuente de verdad del empleado es Workday. |
| D3 | El historial de horas extraordinarias de marzo a agosto de 2026 es sintético y se usa solo para detectar valores atípicos. | No hay historial real disponible. |
| D4 | "Hoy" en el seed y en las pruebas es 2026-10-10. Los periodos 2026-07 y 2026-08 están cerrados; 2026-09 y 2026-10, abiertos. | Fecha de construcción del prototipo. |

## Reglas legales de Chile (referenciales)

| # | Supuesto | Fuente |
|---|---|---|
| L1 | Máximo 2 horas extraordinarias por día. | Código del Trabajo, art. 31. |
| L2 | **Tope semanal de 12 horas extraordinarias** (2 h × 6 días). La ley no fija un tope semanal explícito: es un supuesto de diseño, configurable en `country_rules`. | Derivado del art. 31. |
| L3 | Jornada ordinaria máxima: 44 h (desde 2024-04-26), **42 h desde 2026-04-26** y 40 h desde 2028-04-26, cargadas con vigencia. | Ley 21.561. |
| L4 | Recargo mínimo de 50 % de las horas extraordinarias. El validador no calcula montos: el recargo solo se usa para auditar procedimientos. | Código del Trabajo, art. 32. |
| L5 | 15 días hábiles de feriado legal; el feriado se cuenta en días hábiles de lunes a viernes. No se modelan feriados nacionales ni el feriado progresivo por antigüedad. | Código del Trabajo, arts. 67 y 69. |
| L6 | La licencia médica, las horas extraordinarias en día festivo y los permisos (con y sin goce) exigen un respaldo (folio o autorización). | Supuesto de proceso. |

## Validación

| # | Supuesto | Por qué |
|---|---|---|
| V1 | La disposición se calcula con una sola regla: ≥ 1 bloqueante abierto → Bloquear; solo advertencias abiertas → Cargar con advertencias; si no → Cargar. Los informativos no cuentan. | CLAUDE.md §7.3. |
| V2 | Un hallazgo bloqueante nunca se acepta: se corrige y se vuelve a enviar el lote. Las advertencias las acepta el centro de operaciones con justificación. | Evita que un error grave llegue a la nómina. |
| V3 | El tope semanal se mide por semana ISO (lunes a domingo). | Convención simple y verificable. |
| V4 | Un valor es atípico si supera el promedio histórico en más de 3 desviaciones estándar (mínimo 1) y hay al menos 3 meses de historial. | Regla estadística simple y explicable. |
| V5 | La validación se ejecuta en el navegador y la base de datos recalcula la disposición desde los hallazgos. **Límite conocido:** un cliente modificado podría omitir hallazgos al enviar. Mejora futura: ejecutar el mismo motor en una Edge Function. | CLAUDE.md §14. |
| V6 | El identificador completo (RUT) se guarda en `batch_rows.national_id_input`, una columna que la API no puede leer; solo lo devuelven `get_batch_rows_editable` (corregir y descargar), a quien ya tiene acceso al lote y con registro en auditoría, y la exportación aprobada. En pantalla y en `findings` siempre va enmascarado. | Permite corregir y descargar el archivo sin que la API exponga RUT. |
| V8 | Un hallazgo bloqueante no se resuelve con una nota: se corrige la fila en la pestaña Filas, se valida todo el lote de nuevo y los hallazgos se recalculan. Las advertencias ya aceptadas se conservan. Cada cambio queda en `batch_row_edits` y en `audit_log`. | El veredicto debe depender del dato, no de una justificación. |
| V7 | Las novedades se informan por día (una fila por trabajador, fecha y concepto). Los rangos de vacaciones se informan como un día por fila. | Simplifica las validaciones cruzadas por día. |

## Acceso

| # | Supuesto | Por qué |
|---|---|---|
| A1 | El administrador gestiona usuarios y reglas, pero **no** ve novedades ni empleados individuales: solo métricas agregadas. | Mínimo privilegio. |
| A2 | El analista con acceso a un país ve todas sus plantas; el supervisor solo su planta. | CLAUDE.md §4. |
| A3 | Los usuarios se crean en el panel de Supabase; no hay registro público. | Evita cuentas no autorizadas. |

## Limitaciones conocidas

- No hay integración real con Workday ni con el sistema de nómina: la exportación es un CSV canónico.
- No se modelan feriados nacionales, turnos especiales, jornadas parciales ni el feriado progresivo.
- Las reglas legales de Chile están simplificadas y deben ser validadas por un especialista.
- La auditoría de procedimientos sin IA se basa en palabras clave: puede no reconocer sinónimos (ver concordancia en `docs/evaluacion.md`).
