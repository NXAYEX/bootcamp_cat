import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Select } from "../components/Field";
import FindingActions from "../components/FindingActions";
import PageHeader from "../components/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "../components/StateBlock";
import { FINDING_STATUS, OWNER, SeverityBadge } from "../components/Status";
import { useAuth } from "../context/AuthContext";
import { formatPeriod, usePeriod } from "../context/PeriodContext";
import { useAsync } from "../hooks/useAsync";
import { listOpenFindings } from "../services/batches";
import { getValidationRules } from "../services/reference";

export default function Exceptions() {
  const { role, sites } = useAuth();
  const { period } = usePeriod();
  const [siteId, setSiteId] = useState("");
  const [severity, setSeverity] = useState("");
  const [owner, setOwner] = useState(role === "site_supervisor" ? "site" : "");
  const [status, setStatus] = useState("");
  const q = useAsync(
    () => listOpenFindings({ period, siteId: siteId || undefined, severity: severity || undefined, owner: owner || undefined, status: status || undefined }),
    [period, siteId, severity, owner, status]
  );
  const rules = useAsync(() => getValidationRules(), []);
  const ruleByCode = useMemo(() => {
    const out = {};
    for (const r of rules.data || []) if (!out[r.code] || r.country_code) out[r.code] = r;
    return out;
  }, [rules.data]);

  return (
    <>
      <PageHeader
        title="Cola de excepciones"
        subtitle={`Hallazgos bloqueantes y advertencias de lotes pendientes de decisión en ${formatPeriod(period)}. Los bloqueantes se corrigen; las advertencias pueden aceptarse con justificación.`}
      />
      <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {sites.length > 1 && (
          <Select id="ex-site" label="Planta" value={siteId} onChange={setSiteId}>
            <option value="">Todas las plantas</option>
            {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        )}
        <Select id="ex-sev" label="Severidad" value={severity} onChange={setSeverity}>
          <option value="">Bloqueantes y advertencias</option>
          <option value="blocking">Solo bloqueantes</option>
          <option value="warning">Solo advertencias</option>
        </Select>
        <Select id="ex-owner" label="Responsable" value={owner} onChange={setOwner}>
          <option value="">Cualquier responsable</option>
          <option value="site">Corrige la planta</option>
          <option value="central">Corrige el centro de operaciones</option>
        </Select>
        <Select id="ex-status" label="Estado" value={status} onChange={setStatus}>
          <option value="">Abiertos y en corrección</option>
          {Object.entries(FINDING_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
      </div>

      {q.loading ? (
        <LoadingState label="Cargando excepciones…" />
      ) : q.error ? (
        <ErrorState message={q.error.message} onRetry={q.reload} />
      ) : q.data.length === 0 ? (
        <EmptyState title="No hay excepciones con estos filtros">Cuando un lote tenga bloqueantes o advertencias abiertas, aparecerán aquí.</EmptyState>
      ) : (
        <ul className="space-y-2">
          {q.data.map((f) => (
            <li key={f.id} className="flex flex-col gap-3 rounded-lg border border-linea bg-superficie p-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <SeverityBadge value={f.severity} />
                  <span className="font-medium">{f.code}</span>
                  <span className="text-niebla">{FINDING_STATUS[f.status]} · corrige {OWNER[f.owner].toLowerCase()}</span>
                </div>
                <p className="mt-1 text-sm">{f.message}</p>
                <p className="tabular mt-1 text-xs text-niebla">
                  {f.batches?.sites?.name} · {f.row_number ? `fila ${f.row_number}` : "todo el lote"} ·{" "}
                  <Link to={`/lotes/${f.batch_id}`} className="font-medium text-petroleo hover:underline">
                    {f.batches?.source === "mobile" ? "captura en terreno" : f.batches?.file_name}
                  </Link>
                </p>
                {f.resolution_note && <p className="mt-1 text-xs text-niebla">Nota: {f.resolution_note}</p>}
              </div>
              <FindingActions finding={f} batchStatus={f.batches?.status} rule={ruleByCode[f.code]} onChanged={q.reload} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
