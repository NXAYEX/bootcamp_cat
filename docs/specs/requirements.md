# Requisitos — Validador de Novedades de RR.HH. (spec maestro)

Spec único para las 10 fases (excepción 2 autorizada por el usuario a CLAUDE.md §15.1). Cada requisito es verificable; el código entre corchetes se usa en `tasks.md`.

## Fase 1 — Base
- [R1.1] La app compila con `npm run build` y se despliega en Vercel sin errores.
- [R1.2] `/` sin sesión redirige a `/login`. Con sesión, `/login` redirige a `/`.
- [R1.3] Inicio y cierre de sesión con email y contraseña (Supabase Auth). No hay registro público.
- [R1.4] `AuthContext` expone sesión, perfil, rol y accesos; `ProtectedRoute` y `RoleRoute` protegen las rutas; la navegación muestra solo los enlaces del rol.
- [R1.5] Toda página tiene título propio en la pestaña.

## Fase 2 — Modelo de acceso
- [R2.1] Existen `countries`, `sites`, `profiles`, `user_access` y `audit_log`, todas con RLS activo en el mismo SQL que las crea.
- [R2.2] `private.has_site_access(site_id)` y `private.has_country_access(country_code)` deciden el acceso leyendo `user_access`.
- [R2.3] Un usuario no puede cambiar su propio rol ni sus accesos; solo `admin`.
- [R2.4] `audit_log` acepta inserciones solo desde funciones; nadie puede editar ni borrar.
- [R2.5] Prueba documentada en `docs/evaluacion.md`: supervisor A, supervisor B, analista solo Chile y admin no ven datos fuera de su alcance, también consultando la API REST directamente.

## Fase 3 — Datos de referencia de Chile
- [R3.1] `concepts`, `country_rules` (con `valid_from`/`valid_to`), `validation_rules` (severidad y responsable), `column_aliases`, `payroll_periods`.
- [R3.2] Chile: 42 h semanales desde 2026-04-26 y 40 h desde 2028-04-26; 2 h extra diarias; 15 días hábiles de feriado legal.
- [R3.3] ~200 empleados sintéticos en 3 plantas, con RUT de dígito verificador válido y nombres claramente ficticios; RUT completo no legible vía API (solo enmascarado).
- [R3.4] El admin ve y edita reglas, conceptos y reglas de validación en `/configuracion`.

## Fase 4 — Motor de validación
- [R4.1] `src/lib/validation/` contiene funciones puras (sin React ni Supabase) que cubren todo el catálogo de §7.2 (ver `design.md` §4).
- [R4.2] Cada código tiene al menos 1 prueba que pasa y 1 que falla.
- [R4.3] `samples/` tiene ≥ 6 archivos con errores sembrados y `samples/expected/*.json`; una prueba reporta tasa de detección y falsos positivos.

## Fase 5 — Subida de Excel/CSV
- [R5.1] `/lotes/nuevo`: elegir planta y periodo, subir .xlsx/.csv (≤ 10 MB, ≤ 20.000 filas), confirmar mapeo de columnas, validar y enviar.
- [R5.2] El archivo original va a un bucket privado `batch-files` en `CL/<site>/<periodo>/<uuid>.<ext>`.
- [R5.3] `/lotes/:id` muestra el veredicto, la cuenta de hallazgos y la tabla de hallazgos y filas (RUT enmascarado).
- [R5.4] Los samples producen en la web los mismos hallazgos que en las pruebas.

## Fase 6 — Excepciones y exportación
- [R6.1] `/excepciones` lista hallazgos abiertos con filtros y ciclo de vida: abierto → en corrección → resuelto, o aceptado con justificación (solo advertencias).
- [R6.2] La disposición se recalcula en la base de datos al cambiar el estado de un hallazgo.
- [R6.3] `/exportaciones` exporta en formato canónico (§7.4) solo lotes aprobados; cada acción queda en `audit_log`.

## Fase 7 — Captura móvil
- [R7.1] `/captura` es cómoda a 375 px: botones ≥ 44 px, un paso por pantalla, teclado numérico.
- [R7.2] Genera un lote `source = mobile` que pasa por el mismo motor.

## Fase 8 — Módulo B sin IA
- [R8.1] Subida de procedimiento .docx/.md/.txt al bucket privado `procedures`.
- [R8.2] Checklist de §9 en `procedure_checklist_items` (editable); puntaje calculado con código usando pesos.
- [R8.3] Cada hallazgo tiene cita textual exacta o "no encontrado"; ningún "cumple"/"parcial" sin cita.
- [R8.4] 3 procedimientos sintéticos (bueno, regular, malo) con puntajes coherentes (bueno > regular > malo).

## Fase 9 — IA
- [R9.1] Edge Function `ai-assist` con 3 tareas: mapeo de columnas, explicación de hallazgo y auditoría de procedimiento.
- [R9.2] Respuesta en JSON validado contra esquema; si no cumple, "No fue posible generar la sugerencia".
- [R9.3] Minimización: nunca nombres, RUT ni montos. Confianza visible y marca "Sugerencia de IA: requiere revisión".
- [R9.4] Con la función caída o sin clave, la app funciona completa (sinónimos y palabras clave).

## Fase 10 — Reportes y escalabilidad
- [R10.1] `/reportes` muestra las métricas de §10.
- [R10.2] `/acerca` muestra supuestos y limitaciones.
- [R10.3] Un segundo país ficticio se carga solo con datos (SQL de inserciones) y valida lotes con sus propias reglas, sin cambios de código.
