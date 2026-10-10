import { Sparkles } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { aiExplainFinding } from "../services/ai";
import { updateFindingStatus } from "../services/batches";
import Button from "./Button";
import { inputClass } from "./Field";

// Acciones del ciclo de vida de un hallazgo según rol y responsable. La base de datos vuelve a validar cada regla.
export default function FindingActions({ finding, batchStatus, onChanged, rule, correctTo }) {
  const { role } = useAuth();
  const [open, setOpen] = useState(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [explanation, setExplanation] = useState(null);

  if (finding.severity === "info") return <Explain finding={finding} rule={rule} explanation={explanation} setExplanation={setExplanation} />;
  const editable = batchStatus === "validated";
  const canWork = (role === "site_supervisor" && finding.owner === "site") || (role === "central_analyst" && finding.owner === "central");
  const canAccept = role === "central_analyst" && finding.severity === "warning";

  const options = [];
  if (editable && finding.status === "open" && canWork) options.push(["in_correction", "Marcar en corrección"]);
  // Un bloqueante no se resuelve con una nota: se corrige el dato y el lote se valida de nuevo.
  if (editable && ["open", "in_correction"].includes(finding.status) && canWork && finding.severity === "warning") options.push(["resolved", "Resolver"]);
  if (editable && ["open", "in_correction"].includes(finding.status) && canAccept) options.push(["accepted", "Aceptar con justificación"]);
  if (editable && ["resolved", "accepted", "in_correction"].includes(finding.status) && (canWork || canAccept)) options.push(["open", "Reabrir"]);

  async function apply(status) {
    if ((status === "resolved" || status === "accepted") && note.trim().length < 10) {
      setError("Escribe una justificación de al menos 10 caracteres.");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await updateFindingStatus(finding.id, status, note.trim() || null);
    setBusy(false);
    if (res.error) setError(res.error.message);
    else {
      setOpen(null);
      setNote("");
      onChanged?.();
    }
  }

  return (
    <div className="flex min-w-[180px] flex-col items-end gap-1">
      <div className="flex flex-wrap justify-end gap-1">
        {options.map(([status, label]) =>
          status === "resolved" || status === "accepted" ? (
            <button key={status} type="button" onClick={() => setOpen(open === status ? null : status)} className={smallBtn}>{label}</button>
          ) : (
            <button key={status} type="button" disabled={busy} onClick={() => apply(status)} className={smallBtn}>{label}</button>
          )
        )}
        {correctTo && ["open", "in_correction"].includes(finding.status) && (
          <Link to={correctTo} className={`${smallBtn} inline-flex items-center bg-petroleo text-white hover:bg-petroleo-hover`}>Corregir fila</Link>
        )}
        <Explain finding={finding} rule={rule} explanation={explanation} setExplanation={setExplanation} inline />
      </div>
      {open && (
        <div className="w-full max-w-xs text-left">
          <label htmlFor={`note-${finding.id}`} className="text-xs font-medium">{open === "accepted" ? "Justificación para aceptar" : "Cómo se resolvió"}</label>
          <textarea id={`note-${finding.id}`} rows={2} value={note} onChange={(e) => setNote(e.target.value)} className={`${inputClass} mt-1`} />
          <Button className="mt-1 w-full" onClick={() => apply(open)} loading={busy} loadingText="Guardando…">Confirmar</Button>
        </div>
      )}
      {error && <p role="alert" className="max-w-xs text-xs text-bloqueado">{error}</p>}
      {explanation && <ExplanationBox explanation={explanation} />}
    </div>
  );
}

const smallBtn =
  "min-h-[32px] rounded border border-linea bg-superficie px-2 text-xs font-medium hover:bg-papel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petroleo disabled:opacity-50";

function Explain({ finding, rule, explanation, setExplanation, inline }) {
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true);
    // Solo se envía el código, la regla y la plantilla: nunca el valor ni datos del trabajador.
    const res = await aiExplainFinding({
      code: finding.code,
      rule: rule?.name,
      severity: finding.severity,
      owner: finding.owner,
      field: finding.field,
      template: rule?.message_template,
    });
    setBusy(false);
    setExplanation(res.error ? { error: res.error.message } : res.data);
  }
  const button = (
    <button type="button" onClick={run} disabled={busy} className={`${smallBtn} inline-flex items-center gap-1 text-petroleo`} aria-label={`Explicar hallazgo ${finding.code}`}>
      <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> {busy ? "Explicando…" : "Explicar"}
    </button>
  );
  if (inline) return button;
  return (
    <div className="flex flex-col items-end gap-1">
      {button}
      {explanation && <ExplanationBox explanation={explanation} />}
    </div>
  );
}

function ExplanationBox({ explanation }) {
  if (explanation.error) return <p className="max-w-xs text-left text-xs text-niebla">{explanation.error}</p>;
  return (
    <div className="max-w-xs rounded-md bg-petroleo-suave/60 p-2 text-left text-xs">
      <p className="font-medium text-advertencia">Sugerencia de IA: requiere revisión · confianza {Math.round(explanation.confidence * 100)} %</p>
      <p className="mt-1">{explanation.explanation}</p>
      <p className="mt-1"><span className="font-medium">Cómo corregir:</span> {explanation.suggested_fix}</p>
    </div>
  );
}
