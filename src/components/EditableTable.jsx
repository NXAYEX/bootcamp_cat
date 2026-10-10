import { Check, Pencil, Plus, X } from "lucide-react";
import { useState } from "react";
import Button from "./Button";
import { inputClass } from "./Field";

// Tabla de configuración con edición en línea. columns: [{ key, label, type: text|number|date|bool|select|list, options, editable, align }]
export default function EditableTable({ caption, columns, rows, onSave, onCreate, newRowDefaults }) {
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const start = (row) => {
    setEditingId(row?.id ?? "new");
    setDraft(row ? { ...row } : { ...newRowDefaults });
    setError(null);
  };
  const cancel = () => {
    setEditingId(null);
    setError(null);
  };

  async function save() {
    setSaving(true);
    const changes = {};
    for (const c of columns) {
      if (c.editable === false && editingId !== "new") continue;
      changes[c.key] = parseValue(c, draft[c.key]);
    }
    const res = editingId === "new" ? await onCreate({ ...newRowDefaults, ...changes }) : await onSave(editingId, changes);
    setSaving(false);
    if (res.error) setError(res.error.message);
    else setEditingId(null);
  }

  return (
    <div>
      {onCreate && (
        <div className="mb-2 flex justify-end">
          <Button variant="secondary" icon={Plus} onClick={() => start(null)} disabled={editingId !== null}>Agregar</Button>
        </div>
      )}
      {error && <p role="alert" className="mb-2 rounded-md bg-bloqueado-suave px-3 py-2 text-sm text-bloqueado">{error}</p>}
      <div className="overflow-x-auto rounded-lg border border-linea bg-superficie">
        <table className="w-full min-w-[760px] text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead className="sticky top-0 bg-pizarra text-left text-xs uppercase tracking-wide text-white">
            <tr>
              {columns.map((c) => <th key={c.key} scope="col" className={`px-3 py-2 ${c.align === "right" ? "text-right" : ""}`}>{c.label}</th>)}
              <th scope="col" className="px-3 py-2"><span className="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-linea">
            {editingId === "new" && <EditRow columns={columns} draft={draft} setDraft={setDraft} onSave={save} onCancel={cancel} saving={saving} isNew />}
            {rows.map((row) =>
              editingId === row.id ? (
                <EditRow key={row.id} columns={columns} draft={draft} setDraft={setDraft} onSave={save} onCancel={cancel} saving={saving} />
              ) : (
                <tr key={row.id} className="hover:bg-papel">
                  {columns.map((c) => <td key={c.key} className={`px-3 py-2 align-top ${c.align === "right" ? "text-right" : ""}`}>{display(c, row[c.key])}</td>)}
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => start(row)}
                      disabled={editingId !== null}
                      aria-label={`Editar ${row.code || row.rule_key || row.period || ""}`}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-md text-petroleo hover:bg-petroleo-suave focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petroleo disabled:opacity-40"
                    >
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EditRow({ columns, draft, setDraft, onSave, onCancel, saving, isNew }) {
  return (
    <tr className="bg-petroleo-suave/50">
      {columns.map((c) => (
        <td key={c.key} className="px-2 py-2 align-top">
          {c.editable === false && !isNew ? display(c, draft[c.key]) : <Input column={c} value={draft[c.key]} onChange={(v) => setDraft((d) => ({ ...d, [c.key]: v }))} />}
        </td>
      ))}
      <td className="whitespace-nowrap px-2 py-2 text-right">
        <button type="button" onClick={onSave} disabled={saving} aria-label="Guardar" className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-petroleo text-white hover:bg-petroleo-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petroleo focus-visible:ring-offset-1 disabled:opacity-50">
          <Check className="h-4 w-4" aria-hidden="true" />
        </button>
        <button type="button" onClick={onCancel} disabled={saving} aria-label="Cancelar" className="ml-1 inline-flex h-9 w-9 items-center justify-center rounded-md border border-linea bg-superficie hover:bg-papel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petroleo disabled:opacity-50">
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </td>
    </tr>
  );
}

function Input({ column, value, onChange }) {
  const label = column.label;
  if (column.type === "bool") {
    return <input type="checkbox" aria-label={label} checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} className="h-5 w-5 accent-petroleo" />;
  }
  if (column.type === "select") {
    return (
      <select aria-label={label} value={value ?? ""} onChange={(e) => onChange(e.target.value)} className={inputClass}>
        {column.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    );
  }
  if (column.type === "textarea") {
    return <textarea aria-label={label} rows={3} value={value ?? ""} onChange={(e) => onChange(e.target.value)} className={`${inputClass} min-w-[220px]`} />;
  }
  return (
    <input
      aria-label={label}
      type={column.type === "number" ? "number" : column.type === "date" ? "date" : "text"}
      step={column.type === "number" ? "any" : undefined}
      value={column.type === "list" ? (value || []).join(", ") : value ?? ""}
      onChange={(e) => onChange(column.type === "list" ? e.target.value.split(",").map((s) => s.trim()) : e.target.value)}
      className={`${inputClass} ${column.type === "number" ? "w-24" : "min-w-[120px]"}`}
    />
  );
}

function parseValue(column, value) {
  if (column.type === "number") return value === "" || value === null || value === undefined ? null : Number(value);
  if (column.type === "date") return value || null;
  if (column.type === "list") return (value || []).map((s) => String(s).trim()).filter(Boolean);
  if (column.type === "text" || column.type === "textarea") return value === "" ? null : value;
  return value;
}

function display(column, value) {
  if (column.type === "bool") return value ? "Sí" : "No";
  if (column.type === "select") return column.options.find(([v]) => v === value)?.[1] ?? value ?? "—";
  if (column.type === "list") return value?.length ? <span className="text-xs">{value.join(", ")}</span> : "—";
  if (value === null || value === undefined || value === "") return <span className="text-niebla">—</span>;
  if (column.type === "textarea") return <span className="line-clamp-2 block max-w-xs text-xs">{value}</span>;
  return String(value);
}
