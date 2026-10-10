import { CircleCheck, Info, OctagonX, TriangleAlert } from "lucide-react";

// Color nunca solo: cada estado lleva ícono de forma distinta + texto.
export const DISPOSITION = {
  load: { label: "Cargar", icon: CircleCheck, text: "text-cargar", bg: "bg-cargar-suave", border: "border-cargar" },
  load_with_warnings: { label: "Cargar con advertencias", icon: TriangleAlert, text: "text-advertencia", bg: "bg-advertencia-suave", border: "border-advertencia" },
  block: { label: "Bloquear", icon: OctagonX, text: "text-bloqueado", bg: "bg-bloqueado-suave", border: "border-bloqueado" },
};

export const SEVERITY = {
  blocking: { label: "Bloqueante", icon: OctagonX, text: "text-bloqueado", bg: "bg-bloqueado-suave" },
  warning: { label: "Advertencia", icon: TriangleAlert, text: "text-advertencia", bg: "bg-advertencia-suave" },
  info: { label: "Informativo", icon: Info, text: "text-niebla", bg: "bg-papel" },
};

export const FINDING_STATUS = {
  open: "Abierto",
  in_correction: "En corrección",
  resolved: "Resuelto",
  accepted: "Aceptado",
};

export const BATCH_STATUS = {
  validated: "Pendiente de decisión",
  approved: "Aprobado",
  rejected: "Rechazado",
  exported: "Exportado",
};

export const OWNER = { site: "Planta", central: "Centro de operaciones" };

export function DispositionBadge({ value }) {
  const d = DISPOSITION[value];
  if (!d) return null;
  const Icon = d.icon;
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium ${d.bg} ${d.text}`}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" /> {d.label}
    </span>
  );
}

export function SeverityBadge({ value }) {
  const s = SEVERITY[value];
  if (!s) return null;
  const Icon = s.icon;
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium ${s.bg} ${s.text}`}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" /> {s.label}
    </span>
  );
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// Elemento firma: el veredicto del lote, con la cuenta y la regla que lo explican.
export function Verdict({ disposition, counts, status }) {
  const d = DISPOSITION[disposition];
  if (!d) return null;
  const Icon = d.icon;
  const reason =
    disposition === "block"
      ? `Hay ${plural(counts.blocking, "hallazgo bloqueante abierto", "hallazgos bloqueantes abiertos")}: el lote no puede cargarse hasta corregirlos.`
      : disposition === "load_with_warnings"
        ? `No hay bloqueantes, pero quedan ${plural(counts.warning, "advertencia abierta", "advertencias abiertas")}: se carga solo con justificación.`
        : "Sin hallazgos bloqueantes ni advertencias abiertas: el lote puede cargarse.";
  return (
    <section aria-label="Veredicto del lote" className={`animate-timbrado rounded-lg border-l-[6px] ${d.border} bg-superficie p-4 shadow-sm sm:p-5`}>
      <div className="flex items-start gap-4">
        <Icon className={`mt-1 h-9 w-9 shrink-0 ${d.text}`} aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-niebla">Veredicto{status ? ` · ${BATCH_STATUS[status]}` : ""}</p>
          <p className={`font-display text-xl font-bold uppercase leading-tight [font-stretch:112%] sm:text-2xl ${d.text}`}>{d.label}</p>
          <p className="tabular mt-2 text-sm font-medium">
            {plural(counts.blocking, "bloqueante", "bloqueantes")} · {plural(counts.warning, "advertencia", "advertencias")} · {plural(counts.info, "informativo", "informativos")}
          </p>
          <p className="mt-1 text-sm text-niebla">{reason}</p>
        </div>
      </div>
    </section>
  );
}

export function countOpen(findings) {
  const open = findings.filter((f) => f.status === undefined || f.status === "open" || f.status === "in_correction");
  return {
    blocking: open.filter((f) => f.severity === "blocking").length,
    warning: open.filter((f) => f.severity === "warning").length,
    info: findings.filter((f) => f.severity === "info").length,
  };
}
