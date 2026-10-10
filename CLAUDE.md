# CLAUDE.md — Validador de Novedades de RR.HH.

Instrucciones para el agente de IA en este proyecto. Léelas completas antes de escribir código. Si una instrucción del usuario contradice este archivo, gana el usuario, pero avísale del conflicto.

---

## 0. Resumen en 30 segundos

- **Qué es:** una aplicación web que recibe las **novedades mensuales de remuneraciones** (horas extra, vacaciones y ausencias), las **valida** con reglas por país antes de que lleguen a la nómina y **audita los procedimientos** con que cada país las captura.
- **Para quién:** el área de RR.HH. de una empresa multinacional manufacturera con muchos sistemas heredados. El caso de estudio es Caterpillar, dentro del Bootcamp de IA Aplicada de la USM.
- **Por qué:** hoy las novedades se llenan en Excel y se envían por correo a un centro de operaciones. El sistema local no se integra con la nómina (ADP u otros) y los errores terminan en **pagos incorrectos**.
- **Alcance:** se parte por **Chile**, pero todo se diseña para **agregar países sin tocar código**: las reglas legales son datos, no `if` en el código.
- **Fuente de verdad:** la URL de Vercel, nunca localhost.

---

## 1. Contexto del proyecto

### 1.1 El problema (según la reunión con el cliente)

| Tema | Lo que sabemos |
|---|---|
| Dolor principal | La captura de datos no está estandarizada y eso se refleja en el pago a los empleados |
| Datos afectados | Horas extra (sobretiempo), vacaciones y ausencias |
| Flujo actual | Se llena un Excel → se envía por correo → lo recibe un centro de operaciones → se carga en la nómina |
| Usuarios de origen | Muchos operadores **no tienen computador**. Un supervisor o administrativo registra por ellos |
| Centro de operaciones | **5 personas con el mismo rol y acceso**, que procesan datos de distintas plantas y países |
| Sistemas | **Workday** (datos maestros del empleado), un **sistema local** (procesa horas extra y vacaciones, normalmente no se integra) y la **nómina** (ADP y otros). Hay 49 sistemas en total y la meta es llegar a un solo proveedor |
| Dificultad clave | **Leyes laborales locales** de cada país y beneficios propios (por ejemplo, el bono por asistencia existe en un solo país) |
| Seguridad | Datos personales sensibles. El acceso depende del **proceso que ejecuta** cada persona |
| Pregunta que la app debe responder | **¿Cómo asegurar que cada persona accede solo a los datos que le corresponden?** |
| Escalamiento | Un problema puede resolverse a nivel local, regional o global. Si afecta a varias áreas, pasa a la "central" |

### 1.2 Lo que la app NO es

- No es un reemplazo de Workday ni de la nómina. Es un **puente controlado** entre la captura y la nómina.
- No es un chatbot. La IA apoya en tareas puntuales (sección 8) y nunca toma la decisión final.
- No es un producto oficial de Caterpillar. **No uses el logo, el nombre comercial ni la identidad visual de Caterpillar** en la interfaz. En la app, la empresa se llama "la compañía".

### 1.3 Supuestos sin confirmar

**No habrá más reuniones con el cliente.** Todo lo siguiente es un supuesto de diseño y debe quedar visible en `docs/supuestos.md` y en la pantalla "Acerca de":

1. No hay ejemplos reales. Todos los archivos, empleados y procedimientos son **sintéticos**.
2. No se conoce el formato de entrada de la nómina. Definimos un **formato canónico propio** (sección 7.4) y, más adelante, un adaptador por proveedor (ADP, etc.).
3. Quién corrige un error **depende del tipo de error**. Cada tipo de error se configura con un responsable: la planta de origen o el centro de operaciones (sección 7.3).
4. No se sabe qué herramientas de IA o nube están aprobadas. La IA queda **aislada detrás de una Edge Function** y la app funciona completa aunque la IA esté apagada (sección 8.3).
5. Las reglas legales de Chile cargadas en la base de datos son **referenciales** y deben ser validadas por un especialista laboral antes de un uso real.

Si el usuario aporta información nueva, actualiza `docs/supuestos.md` primero y luego el código.

---

## 2. Módulos del producto

La app tiene **2 módulos** (corresponden a los problemas 4 y 2 del documento base) y **1 capa transversal**.

### Módulo A — Compuerta de calidad de novedades (problema 4)

1. **Captura:** dos vías de entrada.
   - **Subida de Excel o CSV:** se mantiene el proceso actual, pero validado.
   - **Formulario móvil** para el supervisor de planta: registra novedades por trabajador desde el celular, con datos ya estandarizados. Esto resuelve el caso de los operadores sin computador.
2. **Validación determinística:** estructura, empleados contra el maestro, periodo, duplicados y reglas legales del país (sección 7).
3. **Disposición del lote**, con 3 resultados posibles: **Cargar**, **Cargar con advertencias** o **Bloquear**.
4. **Cola de excepciones:** cada error tiene severidad, responsable y estado (abierto, en corrección, resuelto, aceptado con justificación).
5. **Exportación:** genera el archivo en formato canónico, listo para la nómina, solo con los lotes aprobados.
6. **Reporte de calidad:** errores por tipo, por planta y por periodo.

### Módulo B — Auditor de procedimientos (problema 2)

1. Un dueño de proceso sube el **procedimiento** que usa su país o planta para capturar y enviar novedades (.docx, .md o texto).
2. La app lo evalúa contra un **checklist estándar** (sección 9): propósito, alcance, disparador, entradas, responsables, plazos, conceptos y códigos, reglas legales locales, validaciones, excepciones, escalamiento, evidencia, dueño y fecha de revisión.
3. Entrega: **puntaje**, **vacíos detectados**, **preguntas que haría un empleado nuevo** y **propuesta de redacción** para cada vacío.
4. Cada hallazgo **cita el fragmento del documento** que lo respalda o indica explícitamente "no encontrado". Un hallazgo sin evidencia no se muestra como confirmado.
5. Conexión con el módulo A: el checklist verifica que el procedimiento mencione las reglas del país configuradas en `country_rules`. Ejemplo: si Chile tiene un tope de 2 horas extra diarias y el procedimiento no lo menciona, eso es un vacío.

### Capa transversal — Acceso, auditoría y país

- Acceso por **rol + país + planta + proceso**, aplicado en la base de datos con RLS (sección 11.2). Filtrar en la interfaz **no** es seguridad.
- **Registro de auditoría** de cada lectura sensible, exportación, cambio de estado y llamada a la IA.
- **Configuración por país:** reglas legales, conceptos (códigos de novedad) y beneficios locales.

---

## 3. Stack

- **Frontend:** React 18+ con Vite, Tailwind CSS 3+ y JavaScript (no TypeScript salvo que el usuario lo pida).
- **Backend:** Supabase (Postgres, Auth, Storage, Edge Functions). No se construye un servidor propio.
- **Despliegue:** Vercel. Cada push a GitHub genera un despliegue. La rama `main` es producción; cualquier otra rama genera una URL de preview.
- **Librerías permitidas** (además de las del stack base):
  - `react-router-dom`: la app tiene varias páginas.
  - `lucide-react`: íconos.
  - **SheetJS** (`xlsx`) para leer y escribir Excel. Instálalo desde el CDN oficial, porque la versión de npm está desactualizada: `npm install https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`. Revisa en cdn.sheetjs.com si hay una versión más nueva antes de instalar.
  - `papaparse`: CSV.
  - `mammoth`: extraer texto de procedimientos en .docx.
  - `vitest`: pruebas del motor de validación (sección 7.6).
- Cualquier otra librería requiere la aprobación del usuario. Prohibidas las librerías de componentes (shadcn, MUI, Chakra, DaisyUI).

---

## 4. Idioma y comunicación

- Responde siempre en español. El usuario puede no ser programador: explica cada decisión técnica en 1 o 2 frases en español simple antes de ejecutarla.
- Nunca uses jerga sin explicarla la primera vez. Ejemplo: "Voy a crear una política RLS (una regla en la base de datos que decide qué filas puede ver cada usuario)".
- Todo el texto visible de la interfaz va en español de Chile y usa el vocabulario de RR.HH. chileno: "novedades", "remuneraciones", "feriado legal", "licencia médica", "horas extraordinarias", "RUT".
- Los nombres de archivos, componentes, variables, funciones, tablas y columnas van en inglés: `snake_case` en SQL y `camelCase` en JavaScript.
- Los textos de la interfaz que dependen del país (nombres de conceptos, mensajes legales) **vienen de la base de datos**, no del JSX, para poder agregar países.

---

## 5. Configuración inicial

Cuando el proyecto parte de cero, sigue este orden y no saltes pasos.

### 5.1 Proyecto React

```bash
npm create vite@latest validador-novedades -- --template react
cd validador-novedades
npm install
npm install -D tailwindcss@3 postcss autoprefixer
npx tailwindcss init -p
npm install @supabase/supabase-js react-router-dom lucide-react
```

- En `tailwind.config.js`, configura `content: ["./index.html", "./src/**/*.{js,jsx}"]`.
- Agrega las 3 directivas de Tailwind a `src/index.css`.
- Instala SheetJS, papaparse, mammoth y vitest solo cuando la tarea que los necesita empiece, no antes.

### 5.2 Supabase

- Pide al usuario que cree el proyecto en supabase.com y te entregue 2 valores desde Settings > API: la **URL del proyecto** y la **clave anon public**. Nunca pidas ni uses la clave `service_role` en el frontend ni en el repositorio.
- Crea `.env.local` en la raíz:
  ```
  VITE_SUPABASE_URL=https://xxxx.supabase.co
  VITE_SUPABASE_ANON_KEY=eyJ...
  ```
- Agrega `.env.local` y `.env` a `.gitignore` en el mismo paso.
- Crea `src/lib/supabase.js` con el cliente único:
  ```js
  import { createClient } from "@supabase/supabase-js";

  export const supabase = createClient(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_ANON_KEY
  );
  ```
- Todo acceso a datos pasa por este cliente. No crees un segundo `createClient` en ningún otro archivo del frontend.

### 5.3 Git y GitHub

- `git init`, primer commit y creación del repositorio en GitHub (**privado** por defecto, salvo que el usuario diga otra cosa).
- Verifica que `.env.local` no aparezca en `git status` antes del primer push.

### 5.4 Vercel

- Pide al usuario que importe el repositorio en vercel.com (Add New > Project). Vercel detecta Vite solo; no cambies el comando de build ni la carpeta de salida (`dist`).
- Indícale que agregue `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` en Settings > Environment Variables, marcadas para Production, Preview y Development.
- Crea `vercel.json` en la raíz:
  ```json
  {
    "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
  }
  ```
- Confirma con el usuario que la URL de producción carga antes de construir nada más. Ese es el punto de partida verificado.

---

## 6. Estructura de archivos

```
src/
  components/        Componentes reutilizables (Button.jsx, StatusPill.jsx, DataTable.jsx)
  pages/             Vistas completas (Dashboard.jsx, BatchDetail.jsx, ProcedureAudit.jsx)
  hooks/             Hooks personalizados (useSession.js, useBatches.js)
  context/           AuthContext.jsx (sesión + perfil + accesos del usuario)
  lib/
    supabase.js      Cliente único
    validation/      Motor de validación: funciones puras, sin Supabase (sección 7)
    parsing/         Lectura de Excel, CSV y docx → filas normalizadas
    export/          Generación del formato canónico
  services/          Funciones que leen y escriben en Supabase (batches.js, exceptions.js, procedures.js)
  assets/            Imágenes, íconos y fuentes locales
  App.jsx
  index.css
supabase/
  migrations/        SQL numerado: tablas, RLS, funciones y datos de referencia
  functions/         Edge Functions (solo la de IA, cuando se apruebe)
  seed/              Datos sintéticos: empleados, plantas y usuarios de prueba
samples/             Archivos de prueba sintéticos con errores sembrados (Excel y procedimientos)
docs/
  supuestos.md
  specs/             requirements.md, design.md y tasks.md por funcionalidad (sección 15)
  evaluacion.md      Métricas y resultados de las pruebas (sección 10)
vercel.json
.env.local           Nunca se sube al repositorio
```

- Un componente por archivo, con el nombre del archivo igual al del componente. Menos de 150 líneas; si crece más, divídelo.
- Los componentes **no llaman a Supabase directamente**. Llaman a una función de `src/services/`.
- `src/lib/validation/` **no importa React ni Supabase**. Recibe datos y reglas, devuelve hallazgos. Así se puede probar y reutilizar.
- Los archivos de `samples/` son datos sintéticos de demostración y prueba, **no** datos de la app. Esta es la única excepción a la regla de no dejar datos de ejemplo en el repositorio.

---

## 7. Motor de validación (módulo A)

### 7.1 Principio rector

> **La IA interpreta; el código decide.**

Cálculos, topes legales, duplicados, fechas, existencia de empleados y la disposición final del lote son **100 % determinísticos**. La IA no participa en ninguno de ellos.

### 7.2 Catálogo de validaciones

Cada validación tiene un código estable (por ejemplo `V-STR-001`), que se usa en la base de datos, en las pruebas y en el reporte.

| Grupo | Ejemplos | Severidad por defecto |
|---|---|---|
| **Estructura** (`STR`) | Columnas obligatorias faltantes o renombradas, tipos de dato incorrectos, hoja vacía, nombre de archivo fuera de patrón | Bloqueante |
| **Identidad** (`IDN`) | RUT inválido (dígito verificador), empleado inexistente en el maestro, empleado de otra planta, empleado desvinculado antes del periodo | Bloqueante |
| **Periodo** (`PER`) | Fecha fuera del mes declarado, periodo ya cerrado, fecha futura | Bloqueante |
| **Duplicados** (`DUP`) | Misma persona, fecha y concepto repetidos, y lote ya enviado antes | Advertencia o bloqueante |
| **Coherencia** (`COH`) | Vacaciones y horas extra el mismo día, ausencia y horas extra el mismo día, licencia médica cruzada con vacaciones | Advertencia |
| **Legal país** (`LEG`) | Tope diario o semanal de horas extra, saldo de feriado legal, tipo de ausencia no permitido | Según `country_rules` |
| **Concepto** (`CON`) | Código de novedad desconocido o beneficio que no existe en ese país (por ejemplo, un bono por asistencia fuera del país que lo tiene) | Bloqueante |
| **Rango** (`RNG`) | Valores atípicos frente al historial del trabajador o de la planta | Advertencia |

### 7.3 Severidad, responsable y disposición

- Cada código de validación se configura en la tabla `validation_rules` con: `severity` (`blocking`, `warning`, `info`), `owner` (`site` = la planta corrige, `central` = el centro de operaciones corrige) y `country_code` (o `null` si aplica a todos).
- **Disposición del lote:**
  - Hay ≥1 hallazgo bloqueante abierto → **Bloquear**.
  - Solo advertencias abiertas → **Cargar con advertencias**, lo que exige una justificación escrita del analista.
  - Sin hallazgos abiertos → **Cargar**.
- Toda aceptación de una advertencia o anulación de un hallazgo guarda quién lo hizo, cuándo y por qué.

### 7.4 Formato canónico de salida

Como no se conoce el formato de la nómina, la app exporta un formato propio, documentado en `docs/specs/formato-canonico.md`:

`country_code, site_code, period (YYYY-MM), employee_id, national_id, concept_code, date, quantity, unit (hours|days), source_batch_id, approved_by, approved_at`

Los adaptadores por proveedor (ADP u otros) son una fase futura: no los construyas sin aprobación.

### 7.5 Reglas por país como datos

- Las reglas legales viven en `country_rules` (por ejemplo `max_overtime_hours_per_day`, `weekly_hours_limit`, `annual_leave_business_days`), con vigencia `valid_from` / `valid_to`, para soportar cambios de ley.
- Los conceptos viven en `concepts` (código, nombre visible, país, unidad, si requiere respaldo).
- **Chile, valores referenciales iniciales** (a validar por un especialista):
  - Jornada ordinaria máxima de **42 horas semanales** desde el 26-04-2026, por la Ley 21.561. Baja a 40 horas en abril de 2028; carga esa fila con su vigencia futura.
  - Máximo **2 horas extraordinarias por día**, con recargo mínimo del 50 %.
  - Feriado legal de **15 días hábiles** anuales (más feriado progresivo).
- **Agregar un país = insertar filas, no escribir código.** Si una regla nueva no cabe en el modelo, propone el cambio de modelo al usuario antes de hacer un `if (country === ...)`.

### 7.6 Pruebas obligatorias

- Cada validación tiene pruebas en `vitest` con al menos 1 caso que pasa y 1 que falla.
- `samples/` contiene archivos con **errores sembrados y etiquetados** (`samples/expected/*.json` indica qué hallazgos debe producir cada archivo). Una prueba compara lo detectado con lo esperado y reporta la tasa de detección y los falsos positivos.
- No declares terminado un cambio al motor sin correr `npx vitest run`.

---

## 8. Uso de IA

### 8.1 Dónde sí

| Uso | Módulo | Salida |
|---|---|---|
| Sugerir el mapeo de columnas renombradas ("Rut_Empleado" → `national_id`) | A | Sugerencia que el usuario confirma |
| Explicar en lenguaje simple por qué se marcó un hallazgo y cómo corregirlo | A | Texto de apoyo |
| Evaluar un procedimiento contra el checklist, detectar ambigüedades y redactar mejoras | B | Hallazgos con cita textual |

### 8.2 Dónde no

- Nunca para calcular, aplicar topes, decidir la disposición de un lote ni aprobar nada.
- Nunca como barrera de seguridad. "Instrucciones en el prompt" no protegen datos; RLS sí.

### 8.3 Reglas de implementación

- La clave del proveedor de IA es secreta y el frontend expone todo, así que **toda llamada a la IA va por una Edge Function de Supabase** (`supabase/functions/ai-assist`). Proponla como un paso aparte y **no la construyas sin aprobación**.
- **Minimización de datos:** a la IA nunca se envían nombres, RUT ni montos. Se envían encabezados de columnas, códigos de hallazgo, valores seudonimizados o el texto del procedimiento.
- La IA responde en **JSON con un esquema fijo**. Si la respuesta no cumple el esquema, se descarta y se muestra "No fue posible generar la sugerencia".
- Cada salida de la IA muestra un indicador de **confianza** y la marca visible "Sugerencia de IA: requiere revisión".
- **Modo sin IA:** si la Edge Function no existe o falla, la app sigue funcionando completa. El mapeo de columnas cae a un diccionario de sinónimos y el auditor de procedimientos cae a una búsqueda por palabras clave del checklist.
- Cada llamada queda en `audit_log` (usuario, propósito, módulo, sin el contenido sensible).

---

## 9. Checklist del auditor de procedimientos (módulo B)

Se guarda en la tabla `procedure_checklist_items` (editable, con `country_code` opcional). Los criterios base son:

1. Propósito y alcance (qué plantas y qué conceptos cubre)
2. Disparador y calendario (cuándo se captura y fecha de corte)
3. Roles y responsables (quién captura, quién revisa, quién aprueba)
4. Entradas exactas (plantilla, columnas, códigos de concepto)
5. Respaldo requerido (por ejemplo, licencia médica o autorización de horas extra)
6. Reglas legales locales aplicables (vinculadas a `country_rules`)
7. Validaciones antes de enviar
8. Manejo de excepciones y correcciones
9. Escalamiento (a quién y en qué plazo)
10. Salida esperada y canal de envío
11. Accesos y confidencialidad de los datos
12. Dueño del documento y fecha de próxima revisión

Para cada criterio, el resultado es `cumple`, `parcial` o `no encontrado`, con **cita textual** y **pregunta sugerida**. El puntaje se calcula con código (pesos en la tabla), no lo inventa la IA.

---

## 10. Métricas de éxito

La pantalla de reporte y `docs/evaluacion.md` muestran:

| Métrica | Módulo |
|---|---|
| Tasa de detección de errores sembrados | A |
| Tasa de falsos positivos | A |
| % de lotes que se cargan sin intervención | A |
| Tiempo desde la recepción hasta la disposición | A |
| Hallazgos por tipo, planta y periodo | A |
| Concordancia con la revisión humana del checklist | B |
| % de hallazgos con cita textual | B |
| Hallazgos sin respaldo (debe tender a 0) | B |

---

## 11. Datos, autenticación y seguridad

### 11.1 Tablas

- Cada tabla se crea con un archivo SQL numerado en `supabase/migrations/` (por ejemplo `001_create_countries_and_sites.sql`). El usuario lo pega en Supabase > SQL Editor y lo ejecuta. Muéstrale el SQL y explícale en 1 frase qué crea.
- Toda tabla lleva `id uuid primary key default gen_random_uuid()` y `created_at timestamptz default now()`. Si registra autoría, lleva `created_by uuid references auth.users(id)`.
- **Modelo base** (se detalla en el spec correspondiente antes de crearlo):

| Tabla | Para qué |
|---|---|
| `countries`, `sites` | Países y plantas |
| `profiles` | Perfil del usuario y su rol |
| `user_access` | Qué país, planta y proceso puede ver cada usuario |
| `employees` | **Maestro sintético** que simula Workday (nunca datos reales) |
| `concepts` | Códigos de novedad por país |
| `country_rules` | Reglas legales con vigencia |
| `validation_rules` | Severidad y responsable por código de validación |
| `batches` | Lote recibido (origen, periodo, planta, estado, disposición) |
| `batch_rows` | Filas normalizadas de cada lote |
| `findings` | Hallazgos de validación y su ciclo de vida |
| `procedures`, `procedure_audits`, `procedure_findings` | Módulo B |
| `procedure_checklist_items` | Checklist editable |
| `audit_log` | Registro de auditoría (solo inserción) |

### 11.2 Seguridad (RLS)

La política por defecto del proyecto base ("cada usuario ve solo sus filas") **no aplica** aquí, porque el acceso depende de rol, país, planta y proceso. Las reglas de este proyecto son:

- **RLS activo en cada tabla en el mismo SQL que la crea. Sin excepción.**
- **Roles:**

| Rol | Puede |
|---|---|
| `site_supervisor` | Crear y ver lotes y novedades **solo de sus plantas**, y corregir hallazgos con `owner = site` |
| `central_analyst` | Ver y procesar lotes de los **países asignados** en `user_access`, resolver hallazgos `central`, aprobar y exportar. Los 5 analistas comparten este rol, pero cada uno ve solo sus países |
| `process_owner` | Subir procedimientos y ver las auditorías de su país o proceso |
| `admin` | Gestionar países, reglas, conceptos, checklist y accesos. **No** ve las novedades de los empleados salvo que también tenga acceso asignado |

- Las políticas usan **funciones auxiliares** `security definer` en el esquema `private` (por ejemplo `private.has_site_access(site_id)` y `private.has_country_access(country_code)`) que leen `user_access`. Explícale al usuario por qué se usan: evitan repetir lógica y evitan bucles en RLS.
- El rol del usuario **no se guarda en una tabla que el propio usuario pueda editar**. Solo `admin` modifica `profiles.role` y `user_access`.
- `audit_log`: solo `insert` desde funciones; nadie puede editar ni borrar.
- Seguridad a nivel de columna: los `central_analyst` y `site_supervisor` ven `national_id` enmascarado en listados (por ejemplo `12.***.***-K`), mediante una vista. El valor completo solo aparece en la exportación aprobada.
- **Prueba obligatoria de acceso:** con al menos 3 usuarios de prueba (supervisor de la planta A, supervisor de la planta B y un analista con solo Chile asignado), verifica que ninguno ve datos fuera de su alcance, también llamando a la API directamente desde la consola del navegador. Documenta el resultado en `docs/evaluacion.md`.

### 11.3 Autenticación

- Supabase Auth con email y contraseña.
- En Supabase > Authentication > URL Configuration, define la URL de producción de Vercel como Site URL y agrega `https://*.vercel.app/**` a las Redirect URLs.
- La sesión se lee con `supabase.auth.getSession()` al cargar y se escucha con `onAuthStateChange`. `AuthContext` expone sesión, perfil, rol y accesos.
- Las páginas privadas se envuelven en `ProtectedRoute`. Las rutas por rol se envuelven en `RoleRoute`. Ocultar un botón en la interfaz es solo comodidad: **la protección real es RLS**.
- Desactiva el registro público. Los usuarios los crea el `admin`.

### 11.4 Archivos

- Los Excel y procedimientos subidos van a Supabase Storage, en buckets **privados** (`batch-files` y `procedures`) con políticas que replican el acceso por planta y país. Nunca a `src/assets/` ni a URLs públicas.
- La ruta del archivo incluye el país y la planta (`CL/site-001/2026-10/<uuid>.xlsx`) para que las políticas de Storage puedan filtrar.

### 11.5 Datos personales

- **Prohibido usar datos personales reales** en el código, el seed, `samples/`, las capturas de pantalla o los prompts.
- Los empleados sintéticos usan nombres claramente ficticios y RUT con dígito verificador válido pero generados al azar.

### 11.6 Claves y variables de entorno

- Las claves viven en `.env.local` (local), en el panel de Vercel (preview y producción) y, para la IA, en los secrets de Supabase Edge Functions. En ningún otro lugar.
- Prohibido escribir una clave dentro de un archivo `.js`, `.jsx`, `.json` o `.sql` del repositorio.

---

## 12. Rutas y navegación

| Ruta | Página | Roles |
|---|---|---|
| `/login` | Inicio de sesión | Público |
| `/` | Panel: lotes del periodo por estado y planta | Todos |
| `/lotes/nuevo` | Subir Excel o CSV | `site_supervisor`, `central_analyst` |
| `/captura` | Formulario móvil de novedades | `site_supervisor` |
| `/lotes/:id` | Detalle del lote, hallazgos y disposición | Según acceso |
| `/excepciones` | Cola de hallazgos abiertos | `site_supervisor`, `central_analyst` |
| `/exportaciones` | Exportar lotes aprobados | `central_analyst` |
| `/procedimientos` | Subir y listar procedimientos | `process_owner`, `central_analyst` |
| `/procedimientos/:id` | Resultado de la auditoría | Según acceso |
| `/reportes` | Métricas de calidad | `central_analyst`, `admin` |
| `/configuracion` | Países, reglas, conceptos, checklist y usuarios | `admin` |
| `/acerca` | Qué es la app, supuestos y limitaciones | Todos |

- Toda página nueva necesita su entrada en el router, un enlace visible en la navegación (según el rol) y un título propio en la pestaña.
- El `vercel.json` de la sección 5.4 es obligatorio.

---

## 13. Sistema de diseño: reglas duras

El objetivo es que la interfaz parezca una herramienta operativa diseñada con criterio, no una plantilla.

### 13.1 Antes de escribir código

Antes de construir cualquier pantalla, define y muestra al usuario un mini sistema de diseño:

- **Paleta:** 4 a 6 colores con hex, cada uno con nombre y función. Además, define **3 colores semánticos de estado** (cargar, advertencia, bloqueado) que sean distinguibles también para personas con daltonismo: el color siempre va acompañado de un ícono y un texto.
- **Tipografía:** 2 fuentes desde Google Fonts. Una display con carácter para títulos y una de lectura para el cuerpo, con **cifras tabulares** (`font-variant-numeric: tabular-nums`) en tablas y números.
- **Concepto de layout:** 1 frase.
- **Elemento firma:** 1 solo detalle memorable. Sugerencia a evaluar: la forma de mostrar la **disposición del lote** (Cargar / Cargar con advertencias / Bloquear) como un veredicto claro con el conteo de hallazgos que lo explica.

Espera la aprobación del usuario antes de construir. Si el usuario dice "hazlo tú", decide y explica por qué.

### 13.2 Prohibiciones

- Gradientes protagonistas (violeta-azul, violeta-rosado, etc.).
- Fondo crema + serif de alto contraste + acento terracota.
- Fondo casi negro con un solo acento neón.
- **Amarillo y negro como identidad principal**, porque imita la marca Caterpillar.
- Inter, Roboto o la fuente del sistema para títulos.
- Emojis como íconos. Usa `lucide-react`.
- Texto de relleno ("Lorem ipsum", "Potencia tu negocio..."). El copy habla de novedades, lotes, hallazgos, plantas y periodos.
- La grilla de 3 tarjetas iguales con ícono centrado.
- Animar todo. Máximo 1 momento de movimiento por página, respetando `prefers-reduced-motion`.
- Badges tipo "Impulsado por IA" en el encabezado. La IA se señala **donde actúa**, como sugerencia revisable.

### 13.3 Obligaciones

- Escala tipográfica fija definida en `tailwind.config.js` (por ejemplo 12, 14, 16, 20, 28, 40) y espaciado en múltiplos de 4.
- Contraste AA mínimo.
- Estados completos en todo elemento interactivo: hover, focus visible, disabled y loading.
- Toda pantalla que lee de Supabase tiene 3 estados diseñados: **cargando, vacío y error**.
- **Tablas densas y legibles:** la app es de trabajo operativo. Encabezados fijos, alineación numérica a la derecha, filtros por planta, periodo y estado.
- **Mobile primero para `/captura`:** el supervisor la usa en terreno, con botones de al menos 44 px, pocos campos por paso y el teclado adecuado (`inputmode`). Las demás pantallas se verifican en 375, 768 y 1280 px.
- Los botones dicen exactamente lo que hacen: "Validar lote", "Exportar 3 lotes aprobados", "Aceptar advertencia con justificación".
- El panel principal abre con **datos realistas** del periodo actual (sintéticos), no con una frase de bienvenida.

### 13.4 Autocrítica obligatoria

Después de construir cada pantalla, revisa y corrige antes de mostrar:

- ¿Podría pertenecer a cualquier otro producto? Si es así, falta especificidad de RR.HH. y nómina.
- ¿Hay más de 1 protagonista? Quita uno.
- ¿El copy suena a plantilla? Reescríbelo.
- ¿Usé alguna prohibición de 13.2?
- ¿Un usuario de otra planta podría ver algo de esta pantalla que no le corresponde?

---

## 14. Convenciones de código

- Componentes funcionales con hooks. Props desestructuradas en la firma.
- Clases de Tailwind en el JSX. Sin archivos CSS adicionales salvo keyframes.
- Estado local con `useState`. Estado compartido con props o context. Sin Redux ni Zustand.
- Toda llamada a Supabase va en `src/services/` y devuelve `{ data, error }`. Nunca ignores `error`.
- **El procesamiento de archivos ocurre en el navegador** (SheetJS y papaparse). Al servidor se suben el archivo original (a Storage) y las filas normalizadas (a `batch_rows`). Límite inicial: 10 MB y 20.000 filas por archivo. Si se supera, muestra un mensaje claro.
- Sin `console.log` en el código final. Comenta en español solo lo que no es obvio.
- No hardcodees reglas legales, conceptos ni textos por país en el JSX ni en `lib/validation/`: vienen de la base de datos y se pasan como parámetro.

---

## 15. Flujo de trabajo

1. Entiende el pedido. Si es ambiguo, haz como máximo 2 preguntas. Si la respuesta depende del cliente, aplica un supuesto, regístralo en `docs/supuestos.md` y avanza.
2. Propón el plan en 3 a 5 pasos. Si crea tablas, incluye quién puede leer y escribir en cada una.
3. Construye por partes: primero la tabla y sus políticas, luego la estructura, luego el estilo y al final las interacciones.
4. Después de cada parte: commit, push y la URL de preview de Vercel, indicando qué revisar y qué debería verse.
5. Si algo falla, lee el error completo antes de intentar arreglarlo y explica la causa en 1 frase.

### 15.1 Specs obligatorios

Este proyecto usa **modo spec** para toda funcionalidad que toque 3 o más archivos o cree una tabla. Por ejemplo, los módulos A y B, la capa de acceso y la Edge Function de IA llevan spec.

- `docs/specs/<funcionalidad>/requirements.md`: criterios verificables.
- `docs/specs/<funcionalidad>/design.md`: componentes, tablas, RLS y flujo de datos.
- `docs/specs/<funcionalidad>/tasks.md`: pasos ordenados y verificables por separado.

Si el diseño cambia durante la implementación, actualiza el spec primero.

### 15.2 Orden sugerido de construcción

1. Base: proyecto, Supabase, Vercel y login verificados en producción.
2. Modelo de acceso: países, plantas, perfiles, `user_access`, RLS y 3 usuarios de prueba. **Prueba de fuga antes de seguir.**
3. Datos de referencia de Chile: conceptos, reglas, reglas de validación y empleados sintéticos.
4. Motor de validación en `lib/validation/`, con pruebas y `samples/`.
5. Subida de Excel → lote → hallazgos → disposición.
6. Cola de excepciones y exportación canónica.
7. Formulario móvil de captura.
8. Módulo B: subida de procedimiento → checklist → hallazgos (primero en modo sin IA).
9. Edge Function de IA (solo con aprobación) para mapeo, explicaciones y auditoría de procedimientos.
10. Reportes y métricas, más un segundo país de prueba para demostrar la escalabilidad sin cambiar código.

---

## 16. Qué no hacer

- No agregues funcionalidades que el usuario no pidió.
- No cambies el stack por iniciativa propia (nada de Next.js, TypeScript, CSS modules ni otro backend).
- No toques archivos de configuración que ya funcionan salvo necesidad concreta.
- No generes más de 1 pantalla por iteración sin aprobación.
- No uses datos personales reales en ningún lugar.
- No crees tablas sin RLS ni buckets públicos.
- No pongas lógica legal específica de un país en el código.
- No dejes que la IA decida, calcule o apruebe.

---

## 17. Control de versiones y despliegue

- Primer commit apenas el proyecto compile. Push a GitHub antes de la primera pantalla.
- Un commit por funcionalidad operativa, con mensaje en español: "Agrega validación de tope diario de horas extra", no "cambios".
- Ramas por funcionalidad (`feature/modelo-acceso`, `feature/motor-validacion`, `feature/auditor-procedimientos`). Cada rama genera su preview en Vercel; cuando el usuario aprueba, se fusiona a `main`.
- Antes de un cambio grande o riesgoso, commit y push del estado actual.
- Nunca ejecutes `git push --force`, nunca borres `.git` y nunca hagas `git reset --hard` sin confirmación explícita.
- Para volver atrás: muestra `git log --oneline -5` y explica a cuál conviene volver. En Vercel, "Promote to Production" sobre un despliegue anterior es la opción más rápida.

---

## 18. Cuando algo falla y no sale

- Máximo 3 intentos para el mismo error. Al tercero, detente, resume lo que probaste y lo que sospechas, y pide el error completo.
- Si funciona en local y falla en Vercel, revisa primero las variables de entorno en Vercel.
- Si una consulta devuelve una lista vacía sin error, sospecha de RLS o de `user_access` antes que del código.
- Si un Excel no se lee bien, revisa la hoja, la fila de encabezados y la codificación antes de cambiar el parser.
- No reescribas un archivo completo para arreglar un bug puntual.
- Nunca declares algo arreglado sin verificarlo en la URL de Vercel e indica qué debería verse.

---

## 19. Checklist de entrega por pantalla

Antes de dar una pantalla por terminada, verifica:

1. El build de Vercel termina sin errores y la preview carga sin errores ni warnings en la consola.
2. Se ve bien en 375, 768 y 1280 px (en `/captura`, sobre todo en 375 px).
3. Todo elemento interactivo tiene hover y focus visible.
4. Existen los estados cargando, vacío y error.
5. El copy es específico de novedades y remuneraciones, sin relleno.
6. Pasó la autocrítica de la sección 13.4.
7. Los íconos vienen de `lucide-react` y las imágenes tienen `alt` en español.
8. Cada tabla nueva tiene RLS y fue probada con usuarios de **distinto alcance** (otra planta y otro país): ninguno ve datos ajenos, tampoco llamando a la API directamente.
9. No hay claves en el repositorio y las variables están cargadas en Vercel.
10. Si la pantalla usa el motor de validación, `npx vitest run` pasa.
11. Si la pantalla muestra salidas de IA, funciona también con la IA apagada.
12. Hay un commit en GitHub con el estado funcionando y el usuario tiene la URL para revisarlo.
