import { Check, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { FIX_HINTS } from "../lib/fixHints";
import Button from "./Button";
import { inputClass } from "./Field";
import { SeverityBadge } from "./Status";

const norm = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

// Formulario de corrección de una fila. El trabajador se elige en un buscador de la planta: así el
// código y el identificador quedan coherentes sin escribir el RUT a mano.
export default function RowEditForm({ rowNumber, draft, setDraft, dirty, findings, employees, concepts, country, saving, onSave, onCancel }) {
  const [query, setQuery] = useState("");
  const [manual, setManual] = useState(false);

  const current = employees.find((e) => e.employee_code === draft.employee_code?.trim().toUpperCase());
  const matches = useMemo(() => {
    const q = norm(query.trim());
    if (q.length < 2) return [];
    return employees.filter((e) => norm(`${e.first_name} ${e.last_name} ${e.employee_code}`).includes(q)).slice(0, 8);
  }, [employees, query]);

  function pick(e) {
    // Se identifica por código; el identificador se deja vacío y la exportación lo toma del maestro.
    setDraft((d) => ({ ...d, employee_code: e.employee_code, national_id: "" }));
    setQuery("");
  }

  const set = (field) => (v) => setDraft((d) => ({ ...d, [field]: v }));

  return (
    <div className="space-y-4">
      <p className="text-base font-semibold">Corregir la fila {rowNumber}</p>

      {findings.length > 0 && (
        <ul className="space-y-2 rounded-md border border-linea bg-superficie p-3 text-sm">
          {findings.map((f) => (
            <li key={f.id} className="flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-3">
              <span className="flex shrink-0 items-center gap-2"><SeverityBadge value={f.severity} /> <span className="font-medium">{f.code}</span></span>
              <span>
                {f.message}
                {FIX_HINTS[f.code] && <span className="block text-niebla">Qué hacer: {FIX_HINTS[f.code]}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}

      <fieldset className="rounded-md border border-linea bg-superficie p-3">
        <legend className="px-1 text-sm font-medium">Trabajador</legend>
        <p className="text-sm">
          {current ? (
            <>
              <span className="font-medium">{current.first_name} {current.last_name}</span>
              <span className="tabular text-niebla"> · {current.employee_code} · {current.national_id_masked}{current.active ? "" : " · desvinculado"}</span>
            </>
          ) : draft.employee_code ? (
            <span className="text-bloqueado">El código «{draft.employee_code}» no corresponde a un trabajador de esta planta.</span>
          ) : (
            <span className="text-niebla">Identificado solo por {country.national_id_label}.</span>
          )}
        </p>
        <label htmlFor="e-search" className="mt-3 block text-sm font-medium">Cambiar trabajador</label>
        <div className="relative mt-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-niebla" aria-hidden="true" />
          <input id="e-search" type="search" autoComplete="off" placeholder="Escribe nombre o código (mín. 2 letras)" value={query} onChange={(e) => setQuery(e.target.value)} className={`${inputClass} pl-9`} />
        </div>
        {query.trim().length >= 2 && (
          matches.length === 0 ? (
            <p className="mt-2 text-sm text-niebla">Ningún trabajador de esta planta coincide.</p>
          ) : (
            <ul className="mt-2 max-h-56 divide-y divide-linea overflow-auto rounded-md border border-linea">
              {matches.map((e) => (
                <li key={e.id}>
                  <button type="button" onClick={() => pick(e)} className="flex min-h-[44px] w-full flex-col justify-center px-3 text-left text-sm hover:bg-papel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-petroleo">
                    <span className="font-medium">{e.first_name} {e.last_name}</span>
                    <span className="tabular text-xs text-niebla">{e.employee_code} · {e.national_id_masked}{e.active ? "" : " · desvinculado"}</span>
                  </button>
                </li>
              ))}
            </ul>
          )
        )}
        <button type="button" onClick={() => setManual((m) => !m)} className="mt-3 text-xs font-medium text-petroleo hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petroleo">
          {manual ? "Ocultar" : "Editar"} {country.national_id_label} y código a mano
        </button>
        {manual && (
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <Input id="e-nid" label={country.national_id_label} value={draft.national_id} onChange={set("national_id")} hint="Déjalo vacío para identificar solo por código." />
            <Input id="e-code" label="Código de empleado" value={draft.employee_code} onChange={set("employee_code")} />
          </div>
        )}
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label htmlFor="e-concept" className="mb-1 block text-sm font-medium">Concepto</label>
          <select id="e-concept" value={draft.concept_code} onChange={(e) => set("concept_code")(e.target.value)} className={inputClass}>
            {!concepts.some((c) => c.code === draft.concept_code) && <option value={draft.concept_code}>{draft.concept_code || "— Sin concepto —"}</option>}
            {concepts.map((c) => <option key={c.code} value={c.code}>{c.code} · {c.name}</option>)}
          </select>
        </div>
        <Input id="e-date" type="date" label="Fecha" value={draft.date} onChange={set("date")} />
        <Input id="e-qty" label="Cantidad" inputMode="decimal" value={draft.quantity} onChange={set("quantity")} />
        <Input id="e-support" label="Respaldo" value={draft.support_ref} onChange={set("support_ref")} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button icon={Check} onClick={onSave} disabled={!dirty} loading={saving} loadingText="Validando…">Guardar y validar de nuevo</Button>
        <Button variant="secondary" icon={X} onClick={onCancel} disabled={saving}>Cancelar</Button>
        {!dirty && <span className="text-xs text-niebla">Cambia algún dato para poder guardar.</span>}
      </div>
    </div>
  );
}

function Input({ id, label, value, onChange, hint, type = "text", inputMode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium">{label}</label>
      <input id={id} type={type} inputMode={inputMode} value={value} onChange={(e) => onChange(e.target.value)} className={inputClass} autoComplete="off" />
      {hint && <p className="mt-1 text-xs text-niebla">{hint}</p>}
    </div>
  );
}
