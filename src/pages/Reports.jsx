import { useEffect, useState } from "react";
import { Field, Select } from "../components/Field";
import PageHeader from "../components/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "../components/StateBlock";
import { DISPOSITION } from "../components/Status";
import { useAuth } from "../context/AuthContext";
import { formatPeriod, usePeriod } from "../context/PeriodContext";
import { useAsync } from "../hooks/useAsync";
import { getQualityMetrics } from "../services/admin";
import { getCountries } from "../services/reference";

const GROUPS = { STR: "Estructura", IDN: "Identidad", PER: "Periodo", DUP: "Duplicados", COH: "Coherencia", LEG: "Reglas legales", CON: "Conceptos", RNG: "Rangos" };

export default function Reports() {
  const { role, countries: myCountries } = useAuth();
  const { period, periodOptions } = usePeriod();
  const countries = useAsync(() => getCountries(), []);
  const available = role === "admin" ? (countries.data || []).map((c) => c.code) : myCountries;
  const [country, setCountry] = useState("");
  const [scope, setScope] = useState("period");
  const effectiveCountry = country || available[0] || "";
  const effectivePeriod = scope === "period" ? period : null;

  useEffect(() => {
    if (country && !available.includes(country)) setCountry("");
  }, [available, country]);

  const metrics = useAsync(
    () => (effectiveCountry ? getQualityMetrics(effectiveCountry, effectivePeriod) : Promise.resolve({ data: null })),
    [effectiveCountry, effectivePeriod]
  );

  return (
    <>
      <PageHeader title="Reportes de calidad" subtitle="Métricas agregadas, sin datos personales. Se calculan en la base de datos." />
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Field label="País" htmlFor="r-country">
          <Select id="r-country" value={effectiveCountry} onChange={setCountry}>
            {available.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
        </Field>
        <Field label="Alcance" htmlFor="r-scope">
          <Select id="r-scope" value={scope} onChange={setScope}>
            <option value="period">Periodo {formatPeriod(period)}</option>
            <option value="all">Todos los periodos ({periodOptions.length})</option>
          </Select>
        </Field>
      </div>

      {metrics.loading ? (
        <LoadingState label="Calculando métricas…" />
      ) : metrics.error ? (
        <ErrorState message={metrics.error.message} onRetry={metrics.reload} />
      ) : !metrics.data ? (
        <EmptyState title="Sin país asignado" />
      ) : (
        <MetricsView m={metrics.data} />
      )}
    </>
  );
}

function Stat({ label, value, hint }) {
  return (
    <div className="border-b border-linea px-4 py-3 sm:border-b-0">
      <dt className="text-xs text-niebla">{label}</dt>
      <dd className="text-lg font-semibold">{value ?? "—"}</dd>
      {hint && <dd className="text-xs text-niebla">{hint}</dd>}
    </div>
  );
}

const pct = (v) => (v === null || v === undefined ? "—" : `${Number(v).toLocaleString("es-CL")} %`);

function MetricsView({ m }) {
  if (!m.batches && !m.procedure_audits) {
    return <EmptyState title="Aún no hay datos para este alcance">Sube lotes o audita procedimientos para ver métricas.</EmptyState>;
  }
  const maxCode = Math.max(1, ...m.findings_by_code.map((f) => f.n));
  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-3 text-lg font-bold">Módulo A · Novedades</h2>
        <dl className="tabular grid grid-cols-2 overflow-hidden rounded-lg border border-linea bg-superficie sm:grid-cols-4 sm:divide-x sm:divide-linea">
          <Stat label="Lotes recibidos" value={m.batches} />
          <Stat label="Cargados sin intervención" value={pct(m.loaded_without_intervention_pct)} hint="Disposición inicial «Cargar» y aprobados" />
          <Stat label="Tiempo medio hasta decisión" value={m.avg_hours_to_decision === null ? "—" : `${Number(m.avg_hours_to_decision).toLocaleString("es-CL")} h`} />
          <Stat label="Hallazgos" value={m.findings} />
        </dl>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Table caption="Disposición inicial de los lotes" head={["Disposición", "Lotes"]} rows={Object.entries(DISPOSITION).map(([k, d]) => [d.label, m.by_initial_disposition[k] ?? 0])} />
          <Table caption="Hallazgos por tipo de error" head={["Grupo", "Hallazgos"]} rows={Object.entries(GROUPS).map(([k, l]) => [`${k} · ${l}`, m.findings_by_group[k] ?? 0])} />
          <Table
            caption="Hallazgos por planta"
            head={["Planta", "Bloqueantes", "Advertencias", "Informativos"]}
            rows={m.findings_by_site.map((s) => [s.site, s.blocking, s.warning, s.info])}
          />
          <Table caption="Hallazgos por periodo" head={["Periodo", "Hallazgos"]} rows={m.findings_by_period.map((p) => [formatPeriod(p.period), p.n])} />
        </div>

        {m.findings_by_code.length > 0 && (
          <div className="mt-4 rounded-lg border border-linea bg-superficie p-4">
            <h3 className="mb-3 font-sans text-base font-semibold [font-stretch:100%]">Códigos más frecuentes</h3>
            <ul className="tabular space-y-2 text-sm">
              {m.findings_by_code.slice(0, 10).map((f) => (
                <li key={f.code} className="grid grid-cols-[72px_1fr_40px] items-center gap-3">
                  <span className="font-medium">{f.code}</span>
                  <span className="h-3 rounded-sm bg-papel" aria-hidden="true">
                    <span className={`block h-3 rounded-sm ${f.severity === "blocking" ? "bg-bloqueado" : f.severity === "warning" ? "bg-advertencia" : "bg-niebla"}`} style={{ width: `${(f.n / maxCode) * 100}%` }} />
                  </span>
                  <span className="text-right">{f.n}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-bold">Módulo B · Procedimientos</h2>
        <dl className="tabular grid grid-cols-2 overflow-hidden rounded-lg border border-linea bg-superficie sm:grid-cols-4 sm:divide-x sm:divide-linea">
          <Stat label="Auditorías" value={m.procedure_audits} />
          <Stat label="Hallazgos con cita textual" value={pct(m.procedure_findings_with_quote_pct)} hint="De los «cumple» y «parcial»" />
          <Stat label="Hallazgos sin sustento" value={m.procedure_unsupported_findings} hint="Debe ser 0" />
          <Stat label="Concordancia con revisión humana" value={pct(m.procedure_concordance_pct)} hint={`${m.procedure_reviewed} hallazgos revisados`} />
        </dl>
      </section>
    </div>
  );
}

function Table({ caption, head, rows }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-linea bg-superficie">
      <table className="tabular w-full text-sm">
        <caption className="px-4 pt-3 text-left font-semibold">{caption}</caption>
        <thead className="text-left text-xs uppercase tracking-wide text-niebla">
          <tr>{head.map((h, i) => <th key={h} scope="col" className={`px-4 py-2 ${i > 0 ? "text-right" : ""}`}>{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-linea">
          {rows.length === 0 ? (
            <tr><td colSpan={head.length} className="px-4 py-3 text-niebla">Sin datos</td></tr>
          ) : (
            rows.map((r) => <tr key={r[0]}>{r.map((c, i) => <td key={i} className={`px-4 py-2 ${i > 0 ? "text-right" : ""}`}>{c}</td>)}</tr>)
          )}
        </tbody>
      </table>
    </div>
  );
}
