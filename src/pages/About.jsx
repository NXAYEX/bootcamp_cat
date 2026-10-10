import PageHeader from "../components/PageHeader";

const SECTIONS = [
  {
    title: "Qué hace",
    items: [
      "Módulo A: recibe las novedades mensuales de remuneraciones (horas extraordinarias, feriado legal y ausencias) por Excel/CSV o desde la captura en terreno, las valida con las reglas del país y decide si el lote se carga, se carga con advertencias o se bloquea antes de la nómina.",
      "Módulo B: audita los procedimientos con que cada país captura y envía esas novedades, contra un checklist de 12 puntos, con cita textual o «no encontrado» en cada hallazgo.",
      "Agregar un país es cargar datos (conceptos, reglas con vigencia, reglas de validación, plantas y periodos), sin cambiar código. Valdoria, un país ficticio, lo demuestra.",
    ],
  },
  {
    title: "Cómo se decide",
    items: [
      "Con al menos un hallazgo bloqueante abierto: Bloquear. Solo advertencias abiertas: Cargar con advertencias (requiere justificación). Sin ninguno: Cargar.",
      "Los bloqueantes nunca se aceptan: se corrigen y el lote se vuelve a enviar. La base de datos recalcula la disposición con la misma regla del motor.",
      "La IA, cuando está activa, solo sugiere (mapeo de columnas, explicación de hallazgos, resultados del checklist) y siempre se marca para revisión. Nunca decide ni calcula.",
    ],
  },
  {
    title: "Supuestos principales",
    items: [
      "Todos los datos son sintéticos: 200 trabajadores de Chile en 3 plantas y 30 de Valdoria. No hay datos reales.",
      "Reglas de Chile (referenciales): máximo 2 horas extraordinarias diarias; tope semanal de 12 horas (supuesto de diseño); jornada de 42 horas desde el 26-04-2026 y 40 horas desde el 26-04-2028; 15 días hábiles de feriado legal.",
      "Las novedades se informan una fila por trabajador, fecha y concepto. Los valores atípicos se miden contra 6 meses de historial sintético.",
    ],
  },
  {
    title: "Limitaciones",
    items: [
      "Las reglas legales están simplificadas y deben ser validadas por un especialista laboral antes de un uso real. No se modelan feriados nacionales, turnos especiales ni el feriado progresivo.",
      "No hay integración real con Workday ni con el sistema de nómina: la salida es un CSV en formato canónico.",
      "La validación se ejecuta en el navegador; la base de datos recalcula la disposición, pero no vuelve a ejecutar las reglas. Mejora pendiente: ejecutar el mismo motor en el servidor.",
      "La auditoría sin IA se basa en palabras clave y puede no reconocer sinónimos.",
    ],
  },
  {
    title: "Seguridad y privacidad",
    items: [
      "Cada tabla tiene seguridad a nivel de fila: un supervisor solo ve su planta, un analista solo sus países y el administrador no ve novedades individuales.",
      "El RUT completo no es legible por la API: solo aparece enmascarado y, en la exportación aprobada, tomado del maestro.",
      "Los archivos originales se guardan en almacenamiento privado y cada acción relevante queda en el registro de auditoría.",
    ],
  },
];

export default function About() {
  return (
    <>
      <PageHeader title="Acerca del validador" subtitle="Prototipo académico. No es un producto oficial de la compañía." />
      <div className="max-w-3xl space-y-6">
        {SECTIONS.map((s) => (
          <section key={s.title} className="rounded-lg border border-linea bg-superficie p-5">
            <h2 className="mb-3 text-lg font-bold">{s.title}</h2>
            <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed">
              {s.items.map((i) => <li key={i}>{i}</li>)}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
