import { CircleCheck, CircleDashed, CircleHelp, Copy, RotateCw } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Button from "../components/Button";
import PageHeader from "../components/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "../components/StateBlock";
import { useAsync } from "../hooks/useAsync";
import { todayISO } from "../lib/dates";
import { auditProcedure, computeScore } from "../lib/procedures/audit";
import { aiAuditProcedure } from "../services/ai";
import { getLatestAudit, getProcedure, reviewProcedureFinding, saveProcedureAudit } from "../services/procedures";
import { getChecklist, getCountryRules } from "../services/reference";
import { ScorePill, toDbFindings } from "./Procedures";

const RESULT = {
  cumple: { label: "Cumple", icon: CircleCheck, tone: "text-cargar bg-cargar-suave" },
  parcial: { label: "Parcial", icon: CircleDashed, tone: "text-advertencia bg-advertencia-suave" },
  no_encontrado: { label: "No encontrado", icon: CircleHelp, tone: "text-bloqueado bg-bloqueado-suave" },
};

export default function ProcedureAudit() {
  const { id } = useParams();
  const proc = useAsync(() => getProcedure(id), [id]);
  const audit = useAsync(() => getLatestAudit(id), [id]);
  const checklist = useAsync(() => (proc.data ? getChecklist(proc.data.country_code) : Promise.resolve({ data: [] })), [proc.data?.country_code]);
  const [running, setRunning] = useState(null);
  const [notice, setNotice] = useState(null);

  const items = useMemo(() => {
    const byCode = Object.fromEntries((checklist.data || []).map((c) => [c.code, c]));
    return [...(audit.data?.procedure_findings || [])]
      .map((f) => ({ ...f, item: byCode[f.item_code] }))
      .sort((a, b) => (a.item?.sort_order ?? 99) - (b.item?.sort_order ?? 99));
  }, [audit.data, checklist.data]);

  if (proc.loading) return <LoadingState label="Cargando procedimiento…" />;
  if (proc.error) return <ErrorState message={proc.error.message} onRetry={proc.reload} />;
  if (!proc.data) return <EmptyState title="Procedimiento no encontrado">Puede que no exista o que no tengas acceso a su país.</EmptyState>;

  async function reaudit(useAi) {
    setRunning(useAi ? "Consultando a la IA…" : "Auditando…");
    setNotice(null);
    const [cl, rules] = await Promise.all([getChecklist(proc.data.country_code), getCountryRules(proc.data.country_code)]);
    if (cl.error || rules.error) {
      setRunning(null);
      setNotice({ type: "error", text: (cl.error || rules.error).message });
      return;
    }
    const base = auditProcedure({ text: proc.data.content_text, checklist: cl.data, countryRules: rules.data, today: todayISO() });
    let findings = base.findings;
    let method = "keywords";
    let confidence = {};
    if (useAi) {
      const ai = await aiAuditProcedure({ text: proc.data.content_text, checklist: cl.data, baseline: base });
      if (ai.error) {
        setNotice({ type: "warning", text: `${ai.error.message} Se usó la auditoría por palabras clave.` });
      } else {
        findings = ai.data.findings;
        confidence = ai.data.confidence;
        method = "ai";
      }
    }
    // El puntaje lo calcula el código con los pesos, también cuando los resultados vienen de la IA.
    const score = computeScore(findings);
    const res = await saveProcedureAudit(id, method, score, toDbFindings(findings, method, confidence));
    setRunning(null);
    if (res.error) setNotice({ type: "error", text: res.error.message });
    else audit.reload();
  }

  return (
    <>
      <PageHeader
        title={proc.data.title}
        subtitle={`${proc.data.country_code} · ${proc.data.sites?.name || "Todas las plantas"} · ${proc.data.file_name}`}
        actions={
          <>
            <Button variant="secondary" icon={RotateCw} onClick={() => reaudit(false)} loading={running === "Auditando…"} disabled={Boolean(running)}>Volver a auditar</Button>
            <Button variant="secondary" onClick={() => reaudit(true)} loading={running === "Consultando a la IA…"} loadingText="Consultando a la IA…" disabled={Boolean(running)}>Auditar con IA</Button>
          </>
        }
      />
      <Link to="/procedimientos" className="mb-4 inline-block text-sm text-petroleo hover:underline">← Volver a procedimientos</Link>
      {notice && (
        <p role="alert" className={`mb-4 rounded-md px-3 py-2 text-sm ${notice.type === "error" ? "bg-bloqueado-suave text-bloqueado" : "bg-advertencia-suave text-advertencia"}`}>{notice.text}</p>
      )}

      {audit.loading ? (
        <LoadingState label="Cargando auditoría…" />
      ) : audit.error ? (
        <ErrorState message={audit.error.message} onRetry={audit.reload} />
      ) : !audit.data ? (
        <EmptyState title="Este procedimiento aún no se audita" action={<Button onClick={() => reaudit(false)}>Auditar ahora</Button>} />
      ) : (
        <>
          <section className="mb-6 flex flex-col gap-3 rounded-lg border border-linea bg-superficie p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-niebla">Puntaje de calidad (calculado con código)</p>
              <div className="mt-1"><ScorePill score={Number(audit.data.score)} /></div>
            </div>
            <dl className="tabular grid grid-cols-3 gap-4 text-sm">
              {Object.entries(RESULT).map(([k, r]) => (
                <div key={k}>
                  <dt className="text-xs text-niebla">{r.label}</dt>
                  <dd className="font-semibold">{items.filter((i) => i.result === k).length}</dd>
                </div>
              ))}
            </dl>
            <p className="text-xs text-niebla">
              Método: {audit.data.method === "ai" ? "IA con revisión obligatoria" : "palabras clave (sin IA)"} · {new Date(audit.data.created_at).toLocaleString("es-CL")}
            </p>
          </section>

          <ol className="space-y-3">
            {items.map((f) => <FindingCard key={f.id} finding={f} onReviewed={audit.reload} />)}
          </ol>
        </>
      )}
    </>
  );
}

function FindingCard({ finding, onReviewed }) {
  const r = RESULT[finding.result];
  const Icon = r.icon;
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  async function review(value) {
    setSaving(true);
    await reviewProcedureFinding(finding.id, value);
    setSaving(false);
    onReviewed();
  }

  return (
    <li className="rounded-lg border border-linea bg-superficie p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs text-niebla">{finding.item_code} · peso {finding.item?.weight ?? "—"}</p>
          <h3 className="font-sans text-base font-semibold [font-stretch:100%]">{finding.item?.title || finding.item_code}</h3>
        </div>
        <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium ${r.tone}`}>
          <Icon className="h-3.5 w-3.5" aria-hidden="true" /> {r.label}
        </span>
      </div>

      {finding.source === "ai" && (
        <p className="mt-2 text-xs font-medium text-advertencia">
          Sugerencia de IA: requiere revisión{finding.confidence !== null && finding.confidence !== undefined ? ` · confianza ${Math.round(finding.confidence * 100)} %` : ""}
        </p>
      )}

      {finding.evidence_quote ? (
        <blockquote className="mt-3 border-l-4 border-linea bg-papel px-3 py-2 text-sm italic">«{finding.evidence_quote}»</blockquote>
      ) : (
        <p className="mt-3 text-sm text-niebla">No encontrado en el documento.</p>
      )}

      {finding.result !== "cumple" && finding.question && (
        <p className="mt-3 text-sm"><span className="font-medium">Pregunta para el dueño del proceso:</span> {finding.question}</p>
      )}
      {finding.result !== "cumple" && finding.suggested_text && (
        <div className="mt-2 rounded-md bg-petroleo-suave/60 p-3 text-sm">
          <p className="mb-1 font-medium">Texto sugerido</p>
          <p>{finding.suggested_text}</p>
          <button
            type="button"
            onClick={() => navigator.clipboard?.writeText(finding.suggested_text).then(() => setCopied(true))}
            className="mt-2 inline-flex min-h-[36px] items-center gap-1 rounded px-2 text-xs font-medium text-petroleo hover:bg-petroleo-suave focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petroleo"
          >
            <Copy className="h-3.5 w-3.5" aria-hidden="true" /> {copied ? "Copiado" : "Copiar texto"}
          </button>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-linea pt-3 text-xs">
        <span className="text-niebla">Revisión humana:</span>
        {Object.entries(RESULT).map(([k, v]) => (
          <button
            key={k}
            type="button"
            disabled={saving}
            aria-pressed={finding.human_result === k}
            onClick={() => review(k)}
            className={`min-h-[32px] rounded border px-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petroleo disabled:opacity-50 ${
              finding.human_result === k ? "border-pizarra bg-pizarra text-white" : "border-linea hover:bg-papel"
            }`}
          >
            {v.label}
          </button>
        ))}
        {finding.human_result && finding.human_result !== finding.result && <span className="text-advertencia">Discrepa del resultado automático</span>}
      </div>
    </li>
  );
}
