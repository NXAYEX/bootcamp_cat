import { Check, Pencil, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAsync } from "../hooks/useAsync";
import { formatDate } from "../lib/dates";
import { maskNationalId } from "../lib/validation";
import { getBatchRows, getEditableRows, listRowEdits } from "../services/batches";
import { getConcepts } from "../services/reference";
import { saveCorrections } from "../services/validationFlow";
import Button from "./Button";
import { inputClass } from "./Field";
import { EmptyState, ErrorState, LoadingState } from "./StateBlock";
import { DISPOSITION } from "./Status";

const PAGE = 200;
const UNIT = { hours: "horas", days: "días" };
const EDITABLE = ["national_id", "employee_code", "concept_code", "date", "quantity", "support_ref"];
const FIELD_LABEL = { national_id: "Identificador", employee_code: "Código", concept_code: "Concepto", date: "Fecha", quantity: "Cantidad", support_ref: "Respaldo" };

const text = (v) => (v === null || v === undefined ? "" : String(v).trim());

// Pestaña «Filas»: permite corregir una fila, volver a validar todo el lote y dejar registro de cada cambio.
export default function BatchRowsEditor({ batch, country, findings, canEdit, focus, onSaved }) {
  const rows = useAsync(() => getBatchRows(batch.id), [batch.id, batch.revision]);
  const edits = useAsync(() => listRowEdits(batch.id), [batch.id, batch.revision]);
  const concepts = useAsync(() => getConcepts(batch.country_code), [batch.country_code]);

  const [full, setFull] = useState(null);
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState({});
  const [onlyFindings, setOnlyFindings] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const handledFocus = useRef(null);
  const editorRef = useRef(null);

  const findingsByRow = useMemo(() => {
    const map = new Map();
    for (const f of findings) {
      if (f.row_number === null || f.row_number === undefined) continue;
      if (!map.has(f.row_number)) map.set(f.row_number, []);
      map.get(f.row_number).push(f);
    }
    return map;
  }, [findings]);
  const editedRows = useMemo(() => new Set((edits.data || []).map((e) => e.row_number)), [edits.data]);

  async function startEdit(rowNumber) {
    setError(null);
    setNotice(null);
    setBusy("load");
    let source = full;
    if (!source) {
      const res = await getEditableRows(batch.id, "edit");
      if (res.error) {
        setBusy(null);
        setError(res.error.message);
        return;
      }
      source = res.data;
      if (source.some((r) => !r.national_id && r.national_id_masked)) {
        setBusy(null);
        setError("Este lote se envió antes de habilitar la corrección en la app y no guardó el identificador completo. Descarga el archivo original, corrígelo y vuelve a subirlo.");
        return;
      }
      setFull(source);
    }
    setBusy(null);
    const row = source.find((r) => r.row_number === rowNumber);
    if (!row) {
      setError("No se encontró la fila.");
      return;
    }
    setDraft({
      national_id: text(row.national_id),
      employee_code: text(row.employee_code),
      concept_code: text(row.concept_code),
      date: text(row.date),
      quantity: text(row.quantity),
      support_ref: text(row.support_ref),
    });
    setEditing(rowNumber);
  }

  // Al llegar desde un hallazgo (?fila=N) se abre directamente esa fila.
  useEffect(() => {
    if (!focus || !canEdit || !rows.data || handledFocus.current === focus) return;
    handledFocus.current = focus;
    setOnlyFindings(false);
    const idx = rows.data.findIndex((r) => r.row_number === focus.row);
    if (idx >= PAGE) setLimit(idx + 1);
    startEdit(focus.row);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, canEdit, rows.data]);

  // Lleva la vista al formulario de corrección al abrirlo.
  useEffect(() => {
    if (editing !== null) editorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [editing]);

  async function save() {
    setError(null);
    const old = full.find((r) => r.row_number === editing);
    const changes = [];
    for (const field of EDITABLE) {
      const before = text(old[field]);
      const after = text(draft[field]);
      const same = field === "quantity" ? before === after || (before !== "" && after !== "" && Number(before) === Number(after.replace(",", "."))) : before === after;
      if (same) continue;
      const mask = (v) => (field === "national_id" && v ? maskNationalId(v, country.national_id_validator) : v || null);
      changes.push({ row_number: editing, field, old_value: mask(before), new_value: mask(after) });
    }
    if (changes.length === 0) {
      setError("No cambiaste ningún dato.");
      return;
    }
    const updated = full.map((r) => (r.row_number === editing ? { ...r, ...Object.fromEntries(EDITABLE.map((f) => [f, draft[f] === "" ? null : draft[f]])) } : r));
    setBusy("save");
    const res = await saveCorrections({ batch, country, site: { id: batch.site_id, code: batch.sites?.code }, rows: updated, edits: changes, findings });
    setBusy(null);
    if (res.error) {
      setError(res.error.message);
      // Si otra persona guardó antes, se descartan los datos en memoria para no volver a pisar su cambio.
      if (/Otra persona/.test(res.error.message)) {
        setFull(null);
        setEditing(null);
        onSaved();
      }
      return;
    }
    setFull(null);
    setEditing(null);
    const n = res.data.counts;
    setNotice(`Fila ${changes[0].row_number} corregida y lote validado de nuevo: ${DISPOSITION[res.data.disposition].label} (${n.blocking} bloqueantes, ${n.warning} advertencias).`);
    onSaved();
  }

  if (rows.loading || concepts.loading) return <LoadingState label="Cargando filas…" />;
  if (rows.error) return <ErrorState message={rows.error.message} onRetry={rows.reload} />;
  if (!rows.data.length) return <EmptyState title="El lote no tiene filas" />;

  const visible = rows.data.filter((r) => !onlyFindings || findingsByRow.has(r.row_number));
  const shown = visible.slice(0, limit);
  const conceptOptions = (concepts.data || []).filter((c) => c.active);

  return (
    <div>
      <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <label className="inline-flex min-h-[40px] items-center gap-2 text-sm">
          <input type="checkbox" checked={onlyFindings} onChange={(e) => setOnlyFindings(e.target.checked)} className="h-5 w-5 accent-petroleo" />
          Solo filas con hallazgos
        </label>
        <p className="tabular text-xs text-niebla">{visible.length} de {rows.data.length} filas{editedRows.size > 0 ? ` · ${editedRows.size} modificadas` : ""}</p>
      </div>
      {notice && <p role="status" className="mb-2 rounded-md bg-cargar-suave px-3 py-2 text-sm text-cargar">{notice}</p>}
      {error && <p role="alert" className="mb-2 rounded-md bg-bloqueado-suave px-3 py-2 text-sm text-bloqueado">{error}</p>}

      <div className="max-h-[70vh] overflow-auto rounded-lg border border-linea bg-superficie">
        <table className="tabular w-full min-w-[860px] text-sm">
          <caption className="sr-only">Filas del lote</caption>
          <thead className="sticky top-0 z-10 bg-pizarra text-left text-xs uppercase tracking-wide text-white">
            <tr>
              <th scope="col" className="px-3 py-2 text-right">Fila</th>
              <th scope="col" className="px-3 py-2">Código</th>
              <th scope="col" className="px-3 py-2">Identificador</th>
              <th scope="col" className="px-3 py-2">Concepto</th>
              <th scope="col" className="px-3 py-2">Fecha</th>
              <th scope="col" className="px-3 py-2 text-right">Cantidad</th>
              <th scope="col" className="px-3 py-2">Respaldo</th>
              <th scope="col" className="px-3 py-2">Hallazgos</th>
              {canEdit && <th scope="col" className="px-3 py-2"><span className="sr-only">Corregir</span></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-linea">
            {shown.map((r) => {
              const rowFindings = findingsByRow.get(r.row_number) || [];
              if (editing === r.row_number) {
                return (
                  <tr key={r.id} ref={editorRef} className="bg-petroleo-suave/40">
                    <td colSpan={9} className="px-3 py-3">
                      <p className="mb-2 text-sm font-medium">Corregir la fila {r.row_number}</p>
                      {rowFindings.length > 0 && (
                        <ul className="mb-3 space-y-1 text-xs">
                          {rowFindings.map((f) => <li key={f.id}><span className="font-medium">{f.code}</span> · {f.message}</li>)}
                        </ul>
                      )}
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        <Input id="e-nid" label={country.national_id_label} value={draft.national_id} onChange={(v) => setDraft((d) => ({ ...d, national_id: v }))} hint="Se guarda completo, pero solo se muestra enmascarado." />
                        <Input id="e-code" label="Código de empleado" value={draft.employee_code} onChange={(v) => setDraft((d) => ({ ...d, employee_code: v }))} />
                        <div>
                          <label htmlFor="e-concept" className="mb-1 block text-sm font-medium">Concepto</label>
                          <select id="e-concept" value={draft.concept_code} onChange={(e) => setDraft((d) => ({ ...d, concept_code: e.target.value }))} className={inputClass}>
                            {!conceptOptions.some((c) => c.code === draft.concept_code) && <option value={draft.concept_code}>{draft.concept_code || "— Sin concepto —"}</option>}
                            {conceptOptions.map((c) => <option key={c.code} value={c.code}>{c.code} · {c.name}</option>)}
                          </select>
                        </div>
                        <Input id="e-date" type="date" label="Fecha" value={draft.date} onChange={(v) => setDraft((d) => ({ ...d, date: v }))} />
                        <Input id="e-qty" label="Cantidad" inputMode="decimal" value={draft.quantity} onChange={(v) => setDraft((d) => ({ ...d, quantity: v }))} />
                        <Input id="e-support" label="Respaldo" value={draft.support_ref} onChange={(v) => setDraft((d) => ({ ...d, support_ref: v }))} />
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button icon={Check} onClick={save} loading={busy === "save"} loadingText="Validando…">Guardar y validar de nuevo</Button>
                        <Button variant="secondary" icon={X} onClick={() => { setEditing(null); setError(null); }} disabled={busy === "save"}>Cancelar</Button>
                      </div>
                    </td>
                  </tr>
                );
              }
              return (
                <tr key={r.id} className={`hover:bg-papel ${rowFindings.some((f) => f.severity === "blocking" && ["open", "in_correction"].includes(f.status)) ? "bg-bloqueado-suave/30" : ""}`}>
                  <td className="px-3 py-2 text-right">{r.row_number}</td>
                  <td className="px-3 py-2">{r.employee_code || "—"}</td>
                  <td className="px-3 py-2">{r.national_id_masked || "—"}</td>
                  <td className="px-3 py-2">{r.concept_code || "—"}</td>
                  <td className="px-3 py-2">{formatDate(r.date)}</td>
                  <td className="px-3 py-2 text-right">{r.quantity === null ? "—" : `${r.quantity} ${UNIT[r.unit] || ""}`}</td>
                  <td className="px-3 py-2">{r.support_ref || "—"}</td>
                  <td className="px-3 py-2">
                    {rowFindings.length > 0 ? rowFindings.map((f) => f.code).join(", ") : <span className="text-niebla">—</span>}
                    {editedRows.has(r.row_number) && <span className="ml-1 rounded bg-petroleo-suave px-1.5 py-0.5 text-xs font-medium text-petroleo">Modificada</span>}
                  </td>
                  {canEdit && (
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => startEdit(r.row_number)}
                        disabled={busy === "load" || editing !== null}
                        aria-label={`Corregir la fila ${r.row_number}`}
                        className="inline-flex min-h-[36px] items-center gap-1 rounded border border-linea bg-superficie px-2 text-xs font-medium hover:bg-papel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petroleo disabled:opacity-50"
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Corregir
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {visible.length > shown.length && (
        <div className="mt-2 text-center">
          <Button variant="secondary" onClick={() => setLimit((l) => l + PAGE)}>Mostrar {Math.min(PAGE, visible.length - shown.length)} filas más</Button>
        </div>
      )}

      {edits.data?.length > 0 && (
        <details className="mt-6 rounded-lg border border-linea bg-superficie p-4">
          <summary className="cursor-pointer text-sm font-medium">Historial de cambios ({edits.data.length})</summary>
          <ul className="tabular mt-3 space-y-1 text-sm">
            {edits.data.map((e) => (
              <li key={e.id}>
                <span className="text-niebla">{new Date(e.created_at).toLocaleString("es-CL")} · </span>
                Fila {e.row_number}, {FIELD_LABEL[e.field] || e.field}: «{e.old_value || "vacío"}» → «{e.new_value || "vacío"}»
              </li>
            ))}
          </ul>
        </details>
      )}
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
