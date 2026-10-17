import { CircleCheck, Download, Undo2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import Button from "../components/Button";
import { inputClass } from "../components/Field";
import FindingActions from "../components/FindingActions";
import FindingsTable from "../components/FindingsTable";
import PageHeader from "../components/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "../components/StateBlock";
import { BATCH_STATUS, countOpen, DispositionBadge, Verdict } from "../components/Status";
import { useAuth } from "../context/AuthContext";
import { formatPeriod } from "../context/PeriodContext";
import { useAsync } from "../hooks/useAsync";
import BatchRowsEditor from "../components/BatchRowsEditor";
import { downloadText, toCsv } from "../lib/export/canonical";
import { approveBatch, getBatch, getBatchFileUrl, getBatchFindings, getEditableRows, rejectBatch } from "../services/batches";
import { getCountries, getValidationRules } from "../services/reference";
import { logEvent } from "../services/admin";

export default function BatchDetail() {
  const { id } = useParams();
  const { role } = useAuth();
  const batch = useAsync(() => getBatch(id), [id]);
  const findings = useAsync(() => getBatchFindings(id), [id]);
  const rules = useAsync(() => (batch.data ? getValidationRules(batch.data.country_code) : Promise.resolve({ data: [] })), [batch.data?.country_code]);
  const countries = useAsync(() => getCountries(), []);
  const [params] = useSearchParams();
  const focusRow = Number(params.get("fila")) || null;
  const [tab, setTab] = useState(focusRow ? "rows" : "findings");
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState(null);

  const ruleByCode = useMemo(() => {
    const out = {};
    for (const r of rules.data || []) if (!out[r.code] || r.country_code) out[r.code] = r;
    return out;
  }, [rules.data]);

  if (batch.loading) return <LoadingState label="Cargando lote…" />;
  if (batch.error) return <ErrorState message={batch.error.message} onRetry={batch.reload} />;
  if (!batch.data) return <EmptyState title="Lote no encontrado">Puede que no exista o que pertenezca a una planta fuera de tu alcance.</EmptyState>;

  const b = batch.data;
  const list = findings.data || [];
  const counts = countOpen(list);
  const refresh = () => {
    batch.reload();
    findings.reload();
  };

  const country = (countries.data || []).find((c) => c.code === b.country_code);
  const canEdit = b.status === "validated" && ["site_supervisor", "central_analyst"].includes(role);

  // Archivo con los datos tal como quedaron tras las correcciones, en el formato de la plantilla:
  // se puede volver a subir directamente. El nombre cumple el patrón NOV_<PAÍS>_<PLANTA>_<AAAA-MM>.
  async function downloadCorrected() {
    setDownloading(true);
    setDownloadError(null);
    const res = await getEditableRows(b.id, "download");
    setDownloading(false);
    if (res.error) {
      setDownloadError(res.error.message);
      return;
    }
    // Solo columnas de la plantilla: la marca de corrección va en «observacion», que el motor no valida.
    const columns = ["rut", "codigo_empleado", "concepto", "fecha", "cantidad", "unidad", "respaldo", "observacion"];
    const lines = res.data.map((r) => ({
      rut: r.national_id,
      codigo_empleado: r.employee_code,
      concepto: r.concept_code,
      fecha: r.date,
      cantidad: r.quantity,
      unidad: r.unit,
      respaldo: r.support_ref,
      observacion: r.edited ? "Corregido en el validador" : "",
    }));
    downloadText(`NOV_${b.country_code}_${b.sites?.code}_${b.period}.csv`, toCsv(columns, lines));
  }

  async function downloadOriginal() {
    const res = await getBatchFileUrl(b.file_path);
    if (!res.error) {
      logEvent("read.batch_file", "A", "batches", b.id, {});
      window.open(res.data.signedUrl, "_blank", "noopener");
    }
  }

  return (
    <>
      <PageHeader
        title={`Lote ${b.sites?.name} · ${formatPeriod(b.period)}`}
        subtitle={`${b.source === "mobile" ? "Captura en terreno" : b.file_name} · ${b.row_count} filas · enviado el ${new Date(b.created_at).toLocaleString("es-CL")}`}
        actions={
          <>
            {b.file_path && <Button variant="secondary" icon={Download} onClick={downloadOriginal}>Archivo original</Button>}
            <Button variant="secondary" icon={Download} onClick={downloadCorrected} loading={downloading} loadingText="Preparando…">Descargar archivo corregido</Button>
          </>
        }
      />
      {downloadError && <p role="alert" className="mb-4 rounded-md bg-bloqueado-suave px-3 py-2 text-sm text-bloqueado">{downloadError}</p>}
      <Link to="/" className="mb-4 inline-block text-sm text-petroleo hover:underline">← Volver al panel</Link>

      <div className="mb-6 grid gap-4 lg:grid-cols-[1fr_360px]">
        <Verdict disposition={b.disposition} counts={counts} status={b.status} />
        <DecisionPanel batch={b} role={role} onDone={refresh} />
      </div>

      <div role="tablist" aria-label="Contenido del lote" className="mb-4 flex gap-1 border-b border-linea">
        {[["findings", `Hallazgos (${list.length})`], ["rows", `Filas (${b.row_count})`]].map(([k, l]) => (
          <button
            key={k}
            role="tab"
            type="button"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={`min-h-[40px] border-b-2 px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-petroleo ${tab === k ? "border-petroleo font-medium text-petroleo" : "border-transparent text-niebla hover:text-pizarra"}`}
          >
            {l}
          </button>
        ))}
      </div>

      {tab === "findings" ? (
        findings.loading ? (
          <LoadingState label="Cargando hallazgos…" />
        ) : findings.error ? (
          <ErrorState message={findings.error.message} onRetry={findings.reload} />
        ) : list.length === 0 ? (
          <EmptyState title="Sin hallazgos">El motor no encontró errores ni advertencias en este lote.</EmptyState>
        ) : (
          <FindingsTable findings={list} showStatus renderActions={(f) => <FindingActions finding={f} batchStatus={b.status} rule={ruleByCode[f.code]} onChanged={refresh} correctTo={canEdit && f.row_number ? `/lotes/${b.id}?fila=${f.row_number}` : null} />} />
        )
      ) : (
        country ? <BatchRowsEditor batch={b} country={country} findings={list} canEdit={canEdit} focusRow={focusRow} onSaved={refresh} /> : <LoadingState label="Cargando filas…" />
      )}
    </>
  );
}

function DecisionPanel({ batch, role, onDone }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  if (batch.status !== "validated") {
    return (
      <section className="rounded-lg border border-linea bg-superficie p-4 text-sm">
        <p className="text-xs uppercase tracking-wide text-niebla">Decisión</p>
        <p className="mt-1 font-medium">{BATCH_STATUS[batch.status]}</p>
        {batch.approved_disposition && <div className="mt-2"><DispositionBadge value={batch.approved_disposition} /></div>}
        {batch.decision_note && <p className="mt-2 text-niebla">«{batch.decision_note}»</p>}
        {batch.decided_at && <p className="mt-2 text-xs text-niebla">{new Date(batch.decided_at).toLocaleString("es-CL")}</p>}
      </section>
    );
  }
  if (role !== "central_analyst") {
    return (
      <section className="rounded-lg border border-linea bg-superficie p-4 text-sm">
        <p className="text-xs uppercase tracking-wide text-niebla">Decisión</p>
        <p className="mt-1">Pendiente: el centro de operaciones aprueba o rechaza el lote.</p>
        {batch.disposition === "block" && <p className="mt-2 text-niebla">Corrige los hallazgos que te corresponden y vuelve a enviar el archivo corregido.</p>}
      </section>
    );
  }

  async function act(kind) {
    setBusy(kind);
    setError(null);
    const res = kind === "approve" ? await approveBatch(batch.id, note.trim() || null) : await rejectBatch(batch.id, note.trim());
    setBusy(null);
    if (res.error) setError(res.error.message);
    else onDone();
  }

  const blocked = batch.disposition === "block";
  return (
    <section className="rounded-lg border border-linea bg-superficie p-4">
      <p className="text-xs uppercase tracking-wide text-niebla">Decisión del centro de operaciones</p>
      <label htmlFor="decision-note" className="mt-2 block text-sm font-medium">
        {batch.disposition === "load_with_warnings" ? "Justificación (obligatoria para cargar con advertencias)" : "Nota (obligatoria para rechazar)"}
      </label>
      <textarea id="decision-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} className={`${inputClass} mt-1`} />
      {error && <p role="alert" className="mt-2 text-sm text-bloqueado">{error}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button icon={CircleCheck} onClick={() => act("approve")} disabled={blocked || Boolean(busy)} loading={busy === "approve"} loadingText="Aprobando…">
          {batch.disposition === "load_with_warnings" ? "Cargar con advertencias" : "Aprobar carga"}
        </Button>
        <Button variant="secondary" icon={Undo2} onClick={() => act("reject")} disabled={Boolean(busy)} loading={busy === "reject"} loadingText="Rechazando…">
          Devolver a la planta
        </Button>
      </div>
      {blocked && <p className="mt-2 text-xs text-niebla">No se puede aprobar: quedan hallazgos bloqueantes abiertos.</p>}
    </section>
  );
}
