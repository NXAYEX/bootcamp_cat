import { FileSpreadsheet, Send, ShieldCheck, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Button from "../components/Button";
import { Field, Select } from "../components/Field";
import FindingsTable from "../components/FindingsTable";
import PageHeader from "../components/PageHeader";
import { ErrorState } from "../components/StateBlock";
import { Verdict } from "../components/Status";
import { useAuth } from "../context/AuthContext";
import { formatPeriod, usePeriod } from "../context/PeriodContext";
import { useAsync } from "../hooks/useAsync";
import { applyMapping, computeMissingFields, MAPPABLE_FIELDS, normalizeHeader, readTabularFile, suggestMapping, TEMPLATE_HEADERS } from "../lib/parsing";
import { FIELD_LABELS } from "../lib/validation";
import { aiMapColumns } from "../services/ai";
import { getColumnAliases, getCountries } from "../services/reference";
import { sendBatch, validateRows } from "../services/validationFlow";

const REQUIRED = new Set(["concept_code", "date", "quantity"]);

export default function NewBatch() {
  const navigate = useNavigate();
  const { sites } = useAuth();
  const { period, periodOptions } = usePeriod();
  const countries = useAsync(() => getCountries(), []);

  const [siteId, setSiteId] = useState("");
  const [batchPeriod, setBatchPeriod] = useState("");
  const [file, setFile] = useState(null);
  const [parsed, setParsed] = useState(null);
  const [mapping, setMapping] = useState({});
  const [aiConfidence, setAiConfidence] = useState({});
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  const site = sites.find((s) => s.id === (siteId || (sites.length === 1 ? sites[0].id : "")));
  const country = (countries.data || []).find((c) => c.code === site?.country_code);
  const effectivePeriod = batchPeriod || period;

  function resetFrom(step) {
    if (step <= 1) setParsed(null);
    setResult(null);
    setError(null);
    if (step <= 1) setAiConfidence({});
  }

  async function handleRead(e) {
    e.preventDefault();
    resetFrom(1);
    setBusy("Leyendo el archivo…");
    try {
      const data = await readTabularFile(file, file.name);
      const aliases = await getColumnAliases(country.code);
      if (aliases.error) throw new Error(aliases.error.message);
      const sug = suggestMapping(
        data.headers,
        aliases.data.map((a) => ({ field: a.field, alias: a.alias, countryCode: a.country_code })),
        { countryCode: country.code }
      );
      setParsed(data);
      setMapping(sug.mapping);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  async function handleAiMapping() {
    setBusy("Consultando a la IA…");
    setError(null);
    const res = await aiMapColumns(
      parsed.headers,
      MAPPABLE_FIELDS.map((f) => ({ field: f, label: FIELD_LABELS[f] }))
    );
    setBusy(null);
    if (res.error) {
      setError(`${res.error.message} Se mantiene el mapeo por sinónimos.`);
      return;
    }
    setMapping((m) => ({ ...res.data.mapping, ...m }));
    setAiConfidence(res.data.confidence);
  }

  const missing = useMemo(() => computeMissingFields(mapping), [mapping]);

  async function handleValidate() {
    setBusy("Validando…");
    setError(null);
    const rows = applyMapping(parsed.rows, mapping);
    // Toda columna asignada que no tenga el nombre de la plantilla se informa como renombrada (STR-002).
    const templateRenamed = Object.entries(mapping)
      .filter(([field, header]) => header && normalizeHeader(header) !== normalizeHeader(TEMPLATE_HEADERS[field]))
      .map(([field, header]) => ({ header, field }));
    const res = await validateRows({
      rows,
      structure: { fileName: file.name, headers: parsed.headers, missingFields: missing, renamed: templateRenamed },
      country,
      site,
      period: effectivePeriod,
    });
    setBusy(null);
    if (res.error) setError(res.error.message);
    else setResult(res.data);
  }

  async function handleSend() {
    setBusy("Enviando lote…");
    setError(null);
    const res = await sendBatch({ result, country, site, period: effectivePeriod, source: "file", file });
    setBusy(null);
    if (res.error) setError(res.error.message);
    else navigate(`/lotes/${res.data}`);
  }

  return (
    <>
      <PageHeader title="Subir lote de novedades" subtitle="Archivo .xlsx o .csv con una fila por trabajador, fecha y concepto. Máximo 10 MB y 20.000 filas." />

      <ol className="space-y-6">
        <li>
          <form onSubmit={handleRead} className="rounded-lg border border-linea bg-superficie p-4 sm:p-5">
            <h2 className="mb-4 text-lg font-bold">1. Planta, periodo y archivo</h2>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Planta" htmlFor="nb-site">
                <Select id="nb-site" value={site?.id || ""} onChange={(v) => { setSiteId(v); resetFrom(1); }} disabled={sites.length <= 1}>
                  {sites.length === 0 && <option value="">Sin plantas asignadas</option>}
                  {sites.length > 1 && <option value="">Elige una planta…</option>}
                  {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </Select>
              </Field>
              <Field label="Periodo declarado" htmlFor="nb-period">
                <Select id="nb-period" value={effectivePeriod || ""} onChange={(v) => { setBatchPeriod(v); resetFrom(2); }}>
                  {periodOptions.map((p) => <option key={p} value={p}>{formatPeriod(p)}</option>)}
                </Select>
              </Field>
              <Field label="Archivo" htmlFor="nb-file" hint="Nombre esperado: NOV_CL_CL-STG_2026-09.xlsx">
                <input
                  id="nb-file"
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={(e) => { setFile(e.target.files?.[0] || null); resetFrom(1); }}
                  className="block w-full text-sm file:mr-3 file:min-h-[40px] file:rounded-md file:border-0 file:bg-petroleo-suave file:px-3 file:text-sm file:font-medium file:text-petroleo hover:file:bg-petroleo/15"
                />
              </Field>
            </div>
            <Button type="submit" icon={FileSpreadsheet} className="mt-4" disabled={!file || !site || !country} loading={busy === "Leyendo el archivo…"} loadingText="Leyendo el archivo…">
              Leer archivo
            </Button>
          </form>
        </li>

        {parsed && (
          <li className="rounded-lg border border-linea bg-superficie p-4 sm:p-5">
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-lg font-bold">2. Confirma las columnas</h2>
                <p className="tabular text-sm text-niebla">{parsed.rows.length} filas · {parsed.headers.length} columnas en «{file.name}»</p>
              </div>
              <Button variant="secondary" icon={Sparkles} onClick={handleAiMapping} loading={busy === "Consultando a la IA…"} loadingText="Consultando a la IA…" disabled={Boolean(busy)}>
                Sugerir con IA
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {MAPPABLE_FIELDS.map((field) => (
                <Field
                  key={field}
                  htmlFor={`map-${field}`}
                  label={`${field === "national_id" ? country.national_id_label : FIELD_LABELS[field]}${REQUIRED.has(field) ? " *" : ""}`}
                  hint={aiConfidence[field] !== undefined ? `Sugerencia de IA: requiere revisión · confianza ${Math.round(aiConfidence[field] * 100)} %` : undefined}
                >
                  <Select id={`map-${field}`} value={mapping[field] || ""} onChange={(v) => { setMapping((m) => ({ ...m, [field]: v || undefined })); setResult(null); }}>
                    <option value="">— Sin columna —</option>
                    {parsed.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                  </Select>
                </Field>
              ))}
            </div>
            <p className="mt-3 text-xs text-niebla">* Obligatorio. Además se necesita {country.national_id_label} o código de empleado. Si falta una columna obligatoria, el lote se bloqueará (STR-001).</p>
            <Button icon={ShieldCheck} className="mt-4" onClick={handleValidate} loading={busy === "Validando…"} loadingText="Validando…" disabled={Boolean(busy)}>
              Validar lote
            </Button>
          </li>
        )}

        {result && (
          <li className="space-y-4">
            <h2 className="text-lg font-bold">3. Resultado de la validación</h2>
            <Verdict disposition={result.disposition} counts={result.counts} />
            <FindingsTable findings={result.findings} caption="Hallazgos antes de enviar" />
            <div className="flex flex-col gap-2 rounded-lg border border-linea bg-superficie p-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-niebla">
                Al enviar, el lote y sus hallazgos quedan registrados y el archivo original se guarda en almacenamiento privado.
                {result.disposition === "block" && " Un lote bloqueado no puede cargarse: corrige el archivo y vuelve a subirlo, o envíalo para que conste el intento."}
              </p>
              <Button icon={Send} onClick={handleSend} loading={busy === "Enviando lote…"} loadingText="Enviando lote…" disabled={Boolean(busy)}>
                Enviar lote
              </Button>
            </div>
          </li>
        )}
      </ol>

      {error && <div className="mt-6"><ErrorState title="No se pudo completar el paso" message={error} /></div>}
    </>
  );
}
