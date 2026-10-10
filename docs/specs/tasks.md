# Tareas — spec maestro

Leyenda: `[x]` hecho y verificado · `[~]` hecho en código, falta verificar en la URL de Vercel · `[ ]` pendiente.

## Fase 1 — Base
- [x] React + Vite + Tailwind 3, estructura §6, sistema de diseño (`docs/diseno.md`)
- [x] Cliente de Supabase con variables de entorno; aviso si faltan
- [x] AuthContext, ProtectedRoute, RoleRoute, navegación por rol, periodo visible
- [x] `docs/supuestos.md`
- [~] Login / logout en la URL de Vercel; "/" sin sesión → /login

## Fase 2 — Modelo de acceso
- [x] `001_access_model.sql`: countries, sites, profiles, user_access, audit_log, funciones private.*, RLS
- [x] `supabase/seed/test_users.sql`
- [~] Prueba de alcance documentada en `docs/evaluacion.md` (script `scripts/rls-check.mjs`)

## Fase 3 — Datos de referencia de Chile
- [x] `002_reference_model.sql`, `003_seed_reference_cl.sql`, `004_seed_employees_cl.sql` (generados por `scripts/build-seed.mjs`)
- [~] /configuracion: reglas con vigencia, conceptos, reglas de validación, periodos, checklist, usuarios y auditoría

## Fase 4 — Motor de validación
- [x] `src/lib/validation/` con los 31 códigos y 130 pruebas
- [x] 8 archivos en `samples/` + `samples/expected/`: detección 100 %, falsos positivos 0 %

## Fase 5 — Subida de Excel/CSV
- [x] `005_batches.sql` (lotes, filas, hallazgos, RPC, bucket privado)
- [~] /lotes/nuevo y /lotes/:id (mapeo, validación, envío, decisión, archivo original)

## Fase 6 — Excepciones y exportación
- [~] /excepciones (ciclo de vida, aceptación con justificación) y /exportaciones (CSV canónico, solo aprobados)

## Fase 7 — Captura móvil
- [~] /captura (paso a paso, botones ≥ 44 px, borrador en el dispositivo, mismo motor)

## Fase 8 — Módulo B sin IA
- [x] Auditor por palabras clave + 3 procedimientos de prueba (bueno 100, regular 35,2, malo 3,7)
- [x] `006_procedures.sql`
- [~] /procedimientos y /procedimientos/:id (cita o «no encontrado», revisión humana)

## Fase 9 — IA
- [~] Edge Function `ai-assist` (Claude, JSON con esquema, minimización, confianza) y caída al modo sin IA

## Fase 10 — Reportes y escalabilidad
- [x] `007_reports.sql`, `008_seed_country_vd.sql`
- [~] /reportes y /acerca; lote de Valdoria validado en pruebas (falta en la web)

## Registro de estado por fase
<!-- Una línea por fase al cerrarla: fecha · fase · resultado · commit -->
2026-10-10 · Fases 1 a 10 · código completo, build y 130 pruebas OK · falta verificar en Vercel con Supabase conectado
