import { Pencil } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAsync } from "../hooks/useAsync";
import { formatDate } from "../lib/dates";
import { maskNationalId } from "../lib/validation";
import { getBatchRows, getEditableRows, listRowEdits } from "../services/batches";
import { listSiteEmployees } from "../services/employees";
import { getConcepts } from "../services/reference";
import { saveCorrections } from "../services/validationFlow";
import Button from "./Button";
import RowEditForm from "./RowEditForm";
import { EmptyState, ErrorState, LoadingState } from "./StateBlock";
import { DISPOSITION } from "./Status";

const PAGE = 200;
const UNIT = { hours: ["hora", "horas"], days: ["día", "días"] };
const unitLabel = (unit, qty) => (UNIT[unit] ? UNIT[unit][Number(qty) === 1 ? 0 : 1] : "");
const EDITABLE = ["national_id", "employee_code", "concept_code", "date", "quantity", "support_ref"];
const FIELD_LABEL = { national_id: "Identificador", employee_code: "Código", concept_code: "Concepto", date: "Fecha", quantity: "Cantidad", support_ref: "Respaldo" };
const OPEN = ["open", "in_correction"];

const text = (v) => (v === null || v === undefined ? "" : String(v).trim());
const sameValue = (field, a, b) =>
  field === "quantity" ? a === b || (a !== "" && b !== "" && Number(a) === Number(b.replace(",", "."))) : field === "employee_code" ? a.toUpperCase() === b.toUpperCase() : a === b;

// Pestaña «Filas»: corrige una fila, vuelve a validar todo el lote y deja registro de cada cambio.
export default function BatchRowsEditor({ batch, country, findings, canEdit, focus, onSaved }) {
  const rows = useAsync(() => getBatchRows(batch.id), [batch.id, batch.revision]);
  const edits = useAsync(() => listRowEdits(batch.id), [batch.id, batch.revision]);
  const concepts = useAsync(() => getConcepts(batch.country_code), [batch.country_code]);
  const employees = useAsync(() => (canEdit ? listSiteEmployees(batch.site_id) : Promise.resolve({ data: [] })), [batch.site_id, canEdit]);

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
  const noticeRef = useRef(null);
  // Versión del lote conocida por este editor: se adelanta al guardar para poder seguir corrigiendo
  // sin esperar a que la página termine de recargar el lote.
  const [revision, setRevision] = useState(batch.revision);
  useEffect(() => setRevision(batch.revision), [batch.revision]);

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

  // Cambios del borrador frente a la fila guardada (el identificador siempre se registra enmascarado).
  const changes = useMemo(() => {
    const old = editing !== null && full?.find((r) => r.row_number === editing);
    if (!old) return [];
    const mask = (field, v) => (field === "national_id" && v ? maskNationalId(v, country.national_id_validator) : v || null);
    return EDITABLE.filter((field) => !sameValue(field, text(old[field]), text(draft[field]))).map((field) => ({
      row_number: editing,
      field,
      old_value: mask(field, text(old[field])),
      new_value: mask(field, text(draft[field])),
    }));
  }, [editing, full, draft, country.national_id_validator]);

  async function startEdit(rowNumber) {
    setError(null);
    setNotice(null);
    setBusy("load");
    // Siempre se leen las filas guardadas más recientes, para no editar sobre datos viejos.
    const res = await getEditableRows(batch.id, "edit");
    setBusy(null);
    if (res.error) {
      setError(res.error.message);
      return;
    }
    if (res.data.some((r) => !r.national_id && r.national_id_masked)) {
      setError("Este lote se envió antes de habilitar la corrección en la app y no guardó el identificador completo. Descarga el archivo original, corrígelo y vuelve a subirlo.");
      return;
    }
    const row = res.data.find((r) => r.row_number === rowNumber);
    if (!row) {
      setError("No se encontró la fila.");
      return;
    }
    setFull(res.data);
    setDraft(Object.fromEntries(EDITABLE.map((f) => [f, text(row[f])])));
    setEditing(rowNumber);
  }

  // Al llegar desde un hallazgo («Corregir fila») se abre directamente esa fila.
  useEffect(() => {
    if (!focus || !canEdit || !rows.data || handledFocus.current === focus) return;
    handledFocus.current = focus;
    setOnlyFindings(false);
    const idx = rows.data.findIndex((r) => r.row_number === focus.row);
    if (idx >= PAGE) setLimit(idx + 1);
    startEdit(focus.row);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, canEdit, rows.data]);

  useEffect(() => {
    if (editing !== null) editorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [editing]);
  useEffect(() => {
    if (notice) noticeRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [notice]);

  function close() {
    setEditing(null);
    setFull(null);
    setError(null);
  }

  async function save() {
    if (changes.length === 0) return;
    setError(null);
    const rowNumber = editing;
    const updated = full.map((r) => (r.row_number === rowNumber ? { ...r, ...Object.fromEntries(EDITABLE.map((f) => [f, text(draft[f]) || null])) } : r));
    setBusy("save");
    const res = await saveCorrections({ batch: { ...batch, revision }, country, site: { id: batch.site_id, code: batch.sites?.code }, rows: updated, edits: changes, findings });
    setBusy(null);
    if (res.error) {
      setError(res.error.message);
      if (/Otra persona/.test(res.error.message)) {
        close();
        onSaved();
      }
      return;
    }
    setRevision((r) => r + 1);
    close();
    const remaining = res.data.findings.filter((f) => f.rowNumber === rowNumber && f.severity !== "info");
    setNotice({ rowNumber, remaining, disposition: res.data.disposition, counts: res.data.counts });
    onSaved();
  }

  if ((rows.loading && !rows.data) || (concepts.loading && !concepts.data)) return <LoadingState label="Cargando filas…" />;
  if (rows.error) return <ErrorState message={rows.error.message} onRetry={rows.reload} />;
  if (!rows.data.length) return <EmptyState title="El lote no tiene filas" />;

  const visible = rows.data.filter((r) => !onlyFindings || findingsByRow.has(r.row_number));
  const shown = visible.slice(0, limit);

  return (
    <div>
      <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <label className="inline-flex min-h-[40px] items-center gap-2 text-sm">
          <input type="checkbox" checked={onlyFindings} onChange={(e) => setOnlyFindings(e.target.checked)} className="h-5 w-5 accent-petroleo" />
          Solo filas con hallazgos
        </label>
        <p className="tabular text-xs text-niebla">{visible.length} de {rows.data.length} filas{editedRows.size > 0 ? ` · ${editedRows.size} modificadas` : ""}</p>
      </div>
      {notice && <SaveNotice ref={noticeRef} notice={notice} onCorrectAgain={() => startEdit(notice.rowNumber)} />}
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
              const rowFindings = (findingsByRow.get(r.row_number) || []).filter((f) => f.severity !== "info");
              const blocked = rowFindings.some((f) => f.severity === "blocking" && OPEN.includes(f.status));
              if (editing === r.row_number) {
                return (
                  <tr key={r.id} ref={editorRef} className="bg-petroleo-suave/40">
                    <td colSpan={9} className="px-3 py-4">
                      <RowEditForm
                        rowNumber={r.row_number}
                        draft={draft}
                        setDraft={setDraft}
                        dirty={changes.length > 0}
                        findings={rowFindings}
                        employees={employees.data || []}
                        concepts={(concepts.data || []).filter((c) => c.active)}
                        country={country}
                        saving={busy === "save"}
                        onSave={save}
                        onCancel={close}
                      />
                    </td>
                  </tr>
                );
              }
              return (
                <tr key={r.id} className={`hover:bg-papel ${blocked ? "bg-bloqueado-suave/30" : ""}`}>
                  <td className="px-3 py-2 text-right">{r.row_number}</td>
                  <td className="px-3 py-2">{r.employee_code || "—"}</td>
                  <td className="px-3 py-2">{r.national_id_masked || "—"}</td>
                  <td className="px-3 py-2">{r.concept_code || "—"}</td>
                  <td className="px-3 py-2">{formatDate(r.date)}</td>
                  <td className="px-3 py-2 text-right">{r.quantity === null ? "—" : `${r.quantity} ${unitLabel(r.unit, r.quantity)}`}</td>
                  <td className="px-3 py-2">{r.support_ref || "—"}</td>
                  <td className="px-3 py-2">
                    {rowFindings.length > 0 ? rowFindings.map((f) => f.code).join(", ") : <span className="text-cargar">Sin hallazgos</span>}
                    {editedRows.has(r.row_number) && <span className="ml-1 rounded bg-petroleo-suave px-1.5 py-0.5 text-xs font-medium text-petroleo">Modificada</span>}
                  </td>
                  {canEdit && (
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => startEdit(r.row_number)}
                        disabled={busy !== null || editing !== null}
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

// Resultado de guardar: si la fila quedó limpia lo dice; si no, lista lo que falta y ofrece seguir corrigiendo.
function SaveNotice({ ref, notice, onCorrectAgain }) {
  const { rowNumber, remaining, disposition, counts } = notice;
  const clean = remaining.length === 0;
  return (
    <div ref={ref} role="status" className={`mb-3 rounded-md px-3 py-3 text-sm ${clean ? "bg-cargar-suave text-cargar" : "bg-advertencia-suave text-advertencia"}`}>
      <p className="font-medium">
        {clean ? `Fila ${rowNumber} corregida: ya no tiene hallazgos.` : `Fila ${rowNumber} guardada, pero todavía tiene ${remaining.length} hallazgo${remaining.length > 1 ? "s" : ""}:`}
      </p>
      {!clean && (
        <ul className="mt-1 list-disc pl-5 text-pizarra">
          {remaining.map((f, i) => <li key={`${f.code}-${i}`}><span className="font-medium">{f.code}</span> · {f.message}</li>)}
        </ul>
      )}
      <p className="mt-1 text-pizarra">
        Lote validado de nuevo: <span className="font-medium">{DISPOSITION[disposition].label}</span> ({counts.blocking} bloqueantes, {counts.warning} advertencias).
      </p>
      {!clean && (
        <button type="button" onClick={onCorrectAgain} className="mt-2 inline-flex min-h-[36px] items-center rounded bg-petroleo px-3 text-xs font-medium text-white hover:bg-petroleo-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petroleo focus-visible:ring-offset-1">
          Seguir corrigiendo la fila {rowNumber}
        </button>
      )}
    </div>
  );
}
