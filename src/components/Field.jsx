export const inputClass =
  "block w-full rounded-md border border-linea bg-superficie px-3 py-2 text-sm text-pizarra focus-visible:border-petroleo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petroleo/40 disabled:cursor-not-allowed disabled:bg-papel disabled:opacity-60";

export function Field({ label, htmlFor, hint, error, children, className = "" }) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium">{label}</label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-niebla">{hint}</p>}
      {error && <p role="alert" className="mt-1 text-xs text-bloqueado">{error}</p>}
    </div>
  );
}

export function Select({ id, value, onChange, children, disabled, className = "", label }) {
  return (
    <select id={id} aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} className={`${inputClass} ${className}`}>
      {children}
    </select>
  );
}
