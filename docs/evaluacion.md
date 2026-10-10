# Evaluación

## 1. Motor de validación (fase 4)

`npx vitest run` → 130 pruebas en 6 archivos, todas pasan. Cada uno de los 31 códigos del catálogo tiene al menos un caso que pasa y uno que falla.

Archivos de ejemplo (`samples/`, resultado esperado en `samples/expected/`), comparados por código y fila:

| Métrica | Valor |
|---|---|
| Errores sembrados | 36 |
| Detectados correctamente | 36 |
| Tasa de detección | **100 %** |
| Falsos positivos | **0 %** |

Detalle por archivo en `docs/evaluacion-resultados.json` (lo regenera `samples.test.js`). DUP-002, DUP-003 y RNG-002 no se pueden sembrar en un solo archivo: se cubren con pruebas unitarias. DUP-002 se reproduce en la web subiendo dos veces el archivo limpio.

## 2. Auditoría de procedimientos sin IA (fase 8)

| Documento | Puntaje | Concordancia con revisión humana |
|---|---|---|
| procedimiento-bueno.md / .docx | 100 | 12/12 |
| procedimiento-regular.txt | 35,2 | 11/12 |
| procedimiento-malo.md | 3,7 | 11/12 |

Concordancia total: 95,8 %. Hallazgos «cumple» o «parcial» sin cita: 0. Los dos desacuerdos son sinónimos que las palabras clave no reconocen ("alguien de remuneraciones", "cosas repetidas"): es la limitación esperada del modo sin IA. Detalle en `docs/evaluacion-procedimientos.json`.

## 3. Prueba de alcance por rol (fase 2)

Se ejecuta contra la API REST de Supabase, sin pasar por la interfaz:

```
node --env-file=.env.local scripts/rls-check.mjs
```

Verifica, con cada usuario de prueba: anónimo sin acceso a ninguna tabla; supervisores solo con filas de su planta, sin RUT completo, sin procedimientos ni auditoría, sin poder darse rol o acceso ni escribir lotes directamente; analista de Chile sin datos ni métricas de Valdoria; admin sin acceso a empleados ni lotes.

**Resultado:** pendiente de ejecutar una vez conectado Supabase. Pega aquí la tabla que imprime el script.

## 4. Escalabilidad (fase 10)

`008_seed_country_vd.sql` agrega Valdoria solo con inserciones (planta, conceptos, reglas distintas, validador de identificador por expresión regular, 30 empleados). El archivo `samples/NOV_VD_VD-NOR_2026-09.xlsx` produce LEG-001 como **advertencia** (en Valdoria el tope es 3 h y la severidad está sobrescrita), IDN-004 y CON-002 (HE50 no existe en Valdoria), sin cambiar código (`country-vd.test.js`).
