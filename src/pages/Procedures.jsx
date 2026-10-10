import { FileText, Upload } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Button from "../components/Button";
import { Field, inputClass, Select } from "../components/Field";
import PageHeader from "../components/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "../components/StateBlock";
import { useAuth } from "../context/AuthContext";
import { useAsync } from "../hooks/useAsync";
import { auditProcedure } from "../lib/procedures/audit";
import { extractProcedureText } from "../lib/procedures/extractText";
import { createProcedure, listProcedures, saveProcedureAudit, uploadProcedureFile } from "../services/procedures";
import { getChecklist, getCountryRules, getSites } from "../services/reference";
import { todayISO } from "../lib/dates";

export default function Procedures() {
  const list = useAsync(() => listProcedures(), []);
  return (
    <>
      <PageHeader title="Procedimientos" subtitle="Audita cómo cada país captura y envía sus novedades, contra el checklist de 12 puntos." />
      <UploadProcedure onDone={list.reload} />
      <h2 className="mb-3 mt-8 text-lg font-bold">Procedimientos auditados</h2>
      {list.loading ? (
        <LoadingState label="Cargando procedimientos…" />
      ) : list.error ? (
        <ErrorState message={list.error.message} onRetry={list.reload} />
      ) : list.data.length === 0 ? (
        <EmptyState title="Aún no hay procedimientos">Sube el primer procedimiento en .docx, .md o .txt. Hay 3 de ejemplo en la carpeta samples/procedures del repositorio.</EmptyState>
      ) : (
        <ul className="divide-y divide-linea rounded-lg border border-linea bg-superficie">
          {list.data.map((p) => {
            const last = [...(p.procedure_audits || [])].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
            return (
              <li key={p.id}>
                <Link to={`/procedimientos/${p.id}`} className="flex items-center gap-4 px-4 py-3 hover:bg-papel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-petroleo">
                  <FileText className="h-5 w-5 shrink-0 text-niebla" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-petroleo">{p.title}</p>
                    <p className="text-xs text-niebla">
                      {p.country_code} · {p.sites?.name || "Todas las plantas"} · {new Date(p.created_at).toLocaleDateString("es-CL")}
                    </p>
                  </div>
                  {last && <ScorePill score={Number(last.score)} />}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

export function ScorePill({ score }) {
  const tone = score >= 75 ? "bg-cargar-suave text-cargar" : score >= 45 ? "bg-advertencia-suave text-advertencia" : "bg-bloqueado-suave text-bloqueado";
  return <span className={`tabular whitespace-nowrap rounded px-2 py-1 text-sm font-semibold ${tone}`}>{score.toFixed(1)} / 100</span>;
}

function UploadProcedure({ onDone }) {
  const { countries, access } = useAuth();
  const navigate = useNavigate();
  const sites = useAsync(() => getSites(), []);
  const procCountries = [...new Set(access.filter((a) => a.process === "procedimientos" || a.site_id === null).map((a) => a.country_code))];
  const [countryChoice, setCountry] = useState("");
  // Los accesos pueden llegar después del primer render: se usa el primer país asignado si no hay elección.
  const country = countryChoice || procCountries[0] || countries[0] || "";
  const [siteId, setSiteId] = useState("");
  const [title, setTitle] = useState("");
  const [file, setFile] = useState(null);
  const [step, setStep] = useState(null);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    try {
      setStep("Leyendo el documento…");
      const text = await extractProcedureText(file, file.name);
      if (text.trim().length < 20) throw new Error("El documento no tiene texto legible.");

      setStep("Cargando checklist y reglas del país…");
      const [checklist, rules] = await Promise.all([getChecklist(country), getCountryRules(country)]);
      if (checklist.error || rules.error) throw new Error((checklist.error || rules.error).message);

      setStep("Auditando contra el checklist…");
      const site = (sites.data || []).find((s) => s.id === siteId);
      const upload = await uploadProcedureFile({ countryCode: country, siteCode: site?.code, file });
      if (upload.error) throw new Error(upload.error.message);
      const created = await createProcedure({ countryCode: country, siteId, title: title.trim() || file.name, fileName: file.name, filePath: upload.data.path, content: text });
      if (created.error) throw new Error(created.error.message);

      // El puntaje lo calcula el código, no la IA.
      const result = auditProcedure({ text, checklist: checklist.data, countryRules: rules.data, today: todayISO() });
      const saved = await saveProcedureAudit(created.data, "keywords", result.score, toDbFindings(result.findings, "keywords"));
      if (saved.error) throw new Error(saved.error.message);
      onDone?.();
      navigate(`/procedimientos/${created.data}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setStep(null);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-linea bg-superficie p-4 sm:p-5">
      <h2 className="mb-4 text-lg font-bold">Auditar un procedimiento</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="País" htmlFor="p-country">
          <Select id="p-country" value={country} onChange={(v) => { setCountry(v); setSiteId(""); }}>
            {procCountries.length === 0 && <option value="">Sin países asignados</option>}
            {procCountries.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
        </Field>
        <Field label="Planta (opcional)" htmlFor="p-site">
          <Select id="p-site" value={siteId} onChange={setSiteId}>
            <option value="">Todas las plantas</option>
            {(sites.data || []).filter((s) => s.country_code === country).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
        <Field label="Título" htmlFor="p-title" hint="Si lo dejas vacío, se usa el nombre del archivo.">
          <input id="p-title" value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} maxLength={200} />
        </Field>
        <Field label="Archivo (.docx, .md o .txt, máx. 5 MB)" htmlFor="p-file">
          <input
            id="p-file"
            type="file"
            accept=".docx,.md,.txt"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="block w-full text-sm file:mr-3 file:min-h-[40px] file:rounded-md file:border-0 file:bg-petroleo-suave file:px-3 file:text-sm file:font-medium file:text-petroleo hover:file:bg-petroleo/15"
          />
        </Field>
      </div>
      {error && <p role="alert" className="mt-4 rounded-md bg-bloqueado-suave px-3 py-2 text-sm text-bloqueado">{error}</p>}
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <Button type="submit" icon={Upload} disabled={!file || !country} loading={Boolean(step)} loadingText={step}>Subir y auditar</Button>
        <p className="text-xs text-niebla">El puntaje se calcula con código según los pesos del checklist. Cada hallazgo trae su cita textual o «no encontrado».</p>
      </div>
    </form>
  );
}

export function toDbFindings(findings, source, confidenceByItem = {}) {
  return findings.map((f) => ({
    item_code: f.itemCode,
    result: f.result,
    evidence_quote: f.evidenceQuote,
    question: f.result === "cumple" ? null : f.question,
    suggested_text: f.suggestedText,
    source: f.source || source,
    confidence: confidenceByItem[f.itemCode] ?? null,
  }));
}
