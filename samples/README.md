# Archivos de ejemplo (samples)

Archivos **generados** por `node scripts/generate-samples.mjs` (el script es la fuente; no editar a mano).
Usan trabajadores **sintéticos** del maestro `supabase/seed/generated/`, el mismo que carga el seed, de modo que la web y las pruebas producen los mismos hallazgos.
Fecha de referencia de las pruebas: 2026-10-10. El resultado esperado de cada archivo está en `expected/<archivo>.json`; `src/lib/validation/samples.test.js` los compara y escribe `docs/evaluacion-resultados.json`.

| Archivo | Planta | Periodo | Error sembrado | Fila |
|---|---|---|---|---|
| NOV_CL_CL-STG_2026-09.xlsx | CL-STG | 2026-09 | Ninguno (archivo limpio) | — |
| NOV_CL_CL-STG_2026-09_identidad.xlsx | CL-STG | 2026-09 | STR-005 — Nombre con sufijo _identidad | lote |
| NOV_CL_CL-STG_2026-09_identidad.xlsx | CL-STG | 2026-09 | IDN-001 — RUT con dígito verificador inválido | 3 |
| NOV_CL_CL-STG_2026-09_identidad.xlsx | CL-STG | 2026-09 | IDN-002 — RUT válido que no está en el maestro | 4 |
| NOV_CL_CL-STG_2026-09_identidad.xlsx | CL-STG | 2026-09 | IDN-003 — Trabajador de CL-ANF informado por CL-STG | 5 |
| NOV_CL_CL-STG_2026-09_identidad.xlsx | CL-STG | 2026-09 | IDN-004 — CL-000005 desvinculado el 2026-09-10 | 6 |
| NOV_CL_CL-STG_2026-09_identidad.xlsx | CL-STG | 2026-09 | IDN-005 — CL-000006 contratado el 2026-09-20 | 7 |
| NOV_CL_CL-STG_2026-09_identidad.xlsx | CL-STG | 2026-09 | IDN-006 — RUT de CL-000012 con código CL-000013 | 8 |
| NOV_CL_CL-ANF_2026-09.csv | CL-ANF | 2026-09 | STR-002 — Rut_Empleado → identificador | lote |
| NOV_CL_CL-ANF_2026-09.csv | CL-ANF | 2026-09 | STR-002 — Tipo_Novedad → concepto | lote |
| NOV_CL_CL-ANF_2026-09.csv | CL-ANF | 2026-09 | STR-002 — Fecha_Novedad → fecha | lote |
| NOV_CL_CL-ANF_2026-09.csv | CL-ANF | 2026-09 | STR-002 — Horas → cantidad | lote |
| NOV_CL_CL-ANF_2026-09.csv | CL-ANF | 2026-09 | PER-001 — Fecha de agosto en el lote de septiembre | 3 |
| NOV_CL_CL-ANF_2026-09.csv | CL-ANF | 2026-09 | PER-001 — Fecha de diciembre (fuera del mes) | 4 |
| NOV_CL_CL-ANF_2026-09.csv | CL-ANF | 2026-09 | PER-003 — Fecha futura (2026-12-15) | 4 |
| NOV_CL_CL-ANF_2026-09.csv | CL-ANF | 2026-09 | DUP-001 — Repite la fila 5 | 6 |
| NOV_CL_CL-ANF_2026-09.csv | CL-ANF | 2026-09 | CON-001 — Concepto HEX inexistente | 7 |
| NOV_CL_CL-ANF_2026-09.csv | CL-ANF | 2026-09 | CON-002 — BONO_ASIST solo existe en VD | 8 |
| NOV_CL_CL-ANF_2026-09.csv | CL-ANF | 2026-09 | CON-003 — HE50 informado en días | 9 |
| NOV_CL_CL-ANF_2026-09.csv | CL-ANF | 2026-09 | STR-004 — Cantidad no numérica («dos») | 10 |
| NOV_CL_CL-STG_2026-09_legal.xlsx | CL-STG | 2026-09 | STR-005 — Nombre con sufijo _legal | lote |
| NOV_CL_CL-STG_2026-09_legal.xlsx | CL-STG | 2026-09 | LEG-001 — 3 h extra en un día (tope 2) | 2 |
| NOV_CL_CL-STG_2026-09_legal.xlsx | CL-STG | 2026-09 | LEG-002 — CL-000029 acumula 14 h en la semana ISO 39 (tope 12) | 9 |
| NOV_CL_CL-STG_2026-09_legal.xlsx | CL-STG | 2026-09 | LEG-003 — CL-000008 usa 3 días con saldo 2 | 12 |
| NOV_CL_CL-STG_2026-09_legal.xlsx | CL-STG | 2026-09 | LEG-004 — Licencia médica sin folio | 13 |
| NOV_CL_CL-STG_2026-09_legal.xlsx | CL-STG | 2026-09 | LEG-005 — CL-000007 con jornada de 45 h (límite 42) | 14 |
| NOV_CL_CL-STG_2026-09_legal.xlsx | CL-STG | 2026-09 | COH-001 — Feriado y horas extra el mismo día | 16 |
| NOV_CL_CL-STG_2026-09_legal.xlsx | CL-STG | 2026-09 | COH-002 — Ausencia y horas extra el mismo día | 18 |
| NOV_CL_CL-STG_2026-09_legal.xlsx | CL-STG | 2026-09 | COH-003 — Licencia médica el mismo día que feriado | 20 |
| NOV_CL_CL-STG_2026-09_legal.xlsx | CL-STG | 2026-09 | COH-004 — Feriado en sábado | 21 |
| NOV_CL_CL-STG_2026-09_legal.xlsx | CL-STG | 2026-09 | RNG-001 — CL-000009 suma 18 h (historial ≈ 2 h/mes) | 30 |
| NOV_CL_CL-STG_2026-08.xlsx | CL-STG | 2026-08 | PER-002 — Agosto 2026 está cerrado | lote |
| NOV_CL_CL-CON_2026-09.xlsx | CL-CON | 2026-09 | STR-001 — Falta la columna fecha | lote |
| NOV_CL_CL-CON_2026-10.xlsx | CL-CON | 2026-10 | STR-003 — Archivo sin filas | lote |
| NOV_VD_VD-NOR_2026-09.xlsx | VD-NOR | 2026-09 | LEG-001 — 4 h extra (tope VD 3; advertencia por regla del país) | 3 |
| NOV_VD_VD-NOR_2026-09.xlsx | VD-NOR | 2026-09 | IDN-004 — VD-0003 desvinculado el 2026-09-05 | 5 |
| NOV_VD_VD-NOR_2026-09.xlsx | VD-NOR | 2026-09 | CON-002 — HE50 es un concepto de CL | 6 |

## Casos que no se siembran en un solo archivo

- **DUP-002** (lote idéntico ya enviado): en la web, sube dos veces `NOV_CL_CL-STG_2026-09.xlsx`; el segundo envío tiene la misma huella. Cubierto en `engine.test.js`.
- **DUP-003** (novedad informada en otro lote del periodo): requiere un lote previo con la misma novedad (por ejemplo, subir `NOV_CL_CL-STG_2026-09.xlsx` y luego otro archivo con una de sus filas). Cubierto en `engine.test.js`.
- **RNG-002** (total atípico de la planta): necesita cientos de filas para superar el historial de la planta; cubierto en `engine.test.js` con un historial de prueba.
