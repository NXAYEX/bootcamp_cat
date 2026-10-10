import { CircleAlert, Inbox, Loader2, RotateCw } from "lucide-react";

// Estados obligatorios de toda pantalla que lee datos: cargando, vacío y error.
export function LoadingState({ label = "Cargando…", rows = 4 }) {
  return (
    <div role="status" aria-live="polite" className="rounded-lg border border-linea bg-superficie p-4">
      <div className="mb-3 flex items-center gap-2 text-sm text-niebla">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        {label}
      </div>
      <div className="space-y-2" aria-hidden="true">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="h-6 rounded bg-papel" />
        ))}
      </div>
    </div>
  );
}

export function EmptyState({ title, children, action }) {
  return (
    <div className="rounded-lg border border-dashed border-linea bg-superficie px-4 py-8 text-center">
      <Inbox className="mx-auto mb-2 h-6 w-6 text-niebla" aria-hidden="true" />
      <p className="font-medium">{title}</p>
      {children && <p className="mx-auto mt-1 max-w-md text-sm text-niebla">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div role="alert" className="flex flex-col gap-3 rounded-lg border border-bloqueado/30 bg-bloqueado-suave p-4 sm:flex-row sm:items-center">
      <CircleAlert className="h-5 w-5 shrink-0 text-bloqueado" aria-hidden="true" />
      <div className="flex-1 text-sm">
        <p className="font-medium text-bloqueado">No se pudieron cargar los datos</p>
        <p className="text-pizarra">{message}</p>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex min-h-[40px] items-center gap-2 rounded-md border border-bloqueado/40 bg-superficie px-3 text-sm font-medium text-bloqueado hover:bg-papel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petroleo"
        >
          <RotateCw className="h-4 w-4" aria-hidden="true" /> Reintentar
        </button>
      )}
    </div>
  );
}
