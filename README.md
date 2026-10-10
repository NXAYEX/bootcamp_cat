# Validador de Novedades de RR.HH.

Prototipo académico con datos sintéticos. Valida las novedades mensuales de remuneraciones (horas extraordinarias, feriado legal y ausencias) con reglas por país antes de la nómina, y audita los procedimientos con que cada país las captura.

- Stack: React + Vite + Tailwind 3, Supabase (Auth, Postgres con RLS, Storage, Edge Functions), Vercel.
- Guía obligatoria: `CLAUDE.md`. Spec: `docs/specs/`. Diseño: `docs/diseno.md`. Supuestos: `docs/supuestos.md`. Evaluación: `docs/evaluacion.md`.

## Desarrollo

```
npm install
cp .env.example .env.local   # completa VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY
npm run dev
npx vitest run               # motor de validación y auditor de procedimientos
```

## Base de datos

Ejecutar en Supabase > SQL Editor, en orden: `supabase/migrations/001` a `008`, y luego `supabase/seed/test_users.sql` (después de crear los usuarios en Authentication).
Los archivos 003, 004 y 008 se generan con `node scripts/build-seed.mjs` desde `supabase/seed/source/`.

## Agregar un país

Copiar `supabase/seed/source/vd.json`, ajustar conceptos, reglas, plantas y periodos, ejecutar `node scripts/build-seed.mjs` y correr el SQL generado. No se cambia código.
