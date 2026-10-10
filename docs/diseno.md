# Sistema de diseño — Validador de Novedades

Decidido por el agente con autorización del usuario (excepción 3 a CLAUDE.md §13.1). Respeta todas las prohibiciones de §13.2.

## Concepto de layout

**Una mesa de control de nómina:** barra lateral fija color pizarra con el periodo activo siempre visible, y un área de trabajo clara con tablas densas, donde el veredicto del lote es lo único que grita.

## Paleta

| Nombre | Hex | Función |
|---|---|---|
| Pizarra | `#1B2A33` | Texto principal, barra lateral, encabezados de tabla fijos |
| Niebla | `#56656D` | Texto secundario, etiquetas, metadatos (contraste 5,9:1 sobre Papel) |
| Papel | `#F3F5F4` | Fondo de la aplicación (gris frío, no crema) |
| Superficie | `#FFFFFF` | Tablas, paneles y formularios |
| Línea | `#D3DAD8` | Bordes y separadores de filas |
| Petróleo | `#155E75` | Acento: acciones primarias, enlaces, anillo de foco (contraste 7,2:1 sobre blanco) |

### Colores semánticos de estado

Nunca van solos: siempre llevan **ícono + texto**. Además difieren en forma del ícono y en luminosidad, para que se distingan con deuteranopía o protanopía.

| Estado | Texto | Fondo suave | Ícono lucide | Texto visible |
|---|---|---|---|---|
| Cargar | `#17603D` | `#E3F1E9` | `CircleCheck` (círculo) | "Cargar" |
| Advertencia | `#8A4B08` | `#FBEEDC` | `TriangleAlert` (triángulo) | "Cargar con advertencias" |
| Bloqueado | `#A3231A` | `#FBE5E2` | `OctagonX` (octágono) | "Bloquear" |

El ámbar es tostado (no amarillo) y no se combina con negro: evita la identidad visual de Caterpillar.

## Tipografía (Google Fonts)

- **Display — Archivo** (600/700, ancho expandido 112 %): grotesca industrial con ancho variable; da carácter de planta y de planilla de turno sin caer en Inter/Roboto.
- **Lectura — IBM Plex Sans** (400/500/600): muy legible en tablas densas y con cifras tabulares (`tabular-nums`), que se aplican a toda tabla, conteo y número.

Escala fija (en `tailwind.config.js`): 12, 14, 16, 20, 28, 40 px. Espaciado en múltiplos de 4 (escala por defecto de Tailwind).

## Elemento firma: el veredicto del lote

Bloque ancho con borde izquierdo grueso del color del estado, ícono grande, la disposición escrita en Archivo expandido en mayúsculas ("BLOQUEAR") y, debajo, la **cuenta que lo explica** en cifras tabulares: `3 bloqueantes · 5 advertencias · 2 informativos`, más la regla que decidió ("Hay 3 hallazgos bloqueantes abiertos: el lote no puede cargarse"). Es el único momento de movimiento de la pantalla del lote (aparece con un leve "timbrado" de 180 ms, desactivado con `prefers-reduced-motion`).

## Reglas de aplicación

- Tablas: encabezado fijo (`sticky`), números a la derecha con `tabular-nums`, filtros por planta, periodo y estado sobre la tabla.
- Estados obligatorios en elementos interactivos: hover, `focus-visible` (anillo Petróleo de 2 px con separación), disabled (opacidad 50 % + cursor) y loading (spinner `Loader2` + texto "Validando…").
- Pantallas con datos: estados de carga (esqueleto), vacío (qué falta y qué hacer) y error (mensaje + "Reintentar").
- Las sugerencias de IA se señalan donde actúan con la marca "Sugerencia de IA: requiere revisión" y su confianza; nunca en el encabezado.
- `/captura`: mobile primero, botones ≥ 44 px, un paso por pantalla, `inputmode="decimal"` en cantidades.

## Justificación frente a §13.2

- Sin gradientes, sin fondo crema/serif/terracota, sin fondo oscuro con neón, sin amarillo+negro, sin Inter/Roboto en títulos, sin emojis, sin grilla de 3 tarjetas iguales, sin badge "Impulsado por IA", un solo movimiento por página.
