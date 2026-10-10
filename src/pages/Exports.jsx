import { Download, FileOutput } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Button from "../components/Button";
import PageHeader from "../components/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "../components/StateBlock";
import { DispositionBadge } from "../components/Status";
import { formatPeriod, usePeriod } from "../context/PeriodContext";
import { useAsync } from "../hooks/useAsync";
import { downloadText, toCanonicalCsv } from "../lib/export/canonical";
import { exportBatches, exportRows, listBatches, listExports } from "../services/batches";

export default function Exports() {
  const { period } = usePeriod();
  const approved = useAsync(() => listBatches({ period, status: "approved" }), [period]);
  const history = useAsync(() => listExports(), []);
  const [selected, setSelected] = useState([]);
  const [busy, setBusy] = useState(null);
  const [message, setMessage] = useState(null);

  const batches = useMemo(() => approved.data || [], [approved.data]);
  const country = batches.find((b) => b.id === selected[0])?.country_code;

  function toggle(id) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  async function handleExport() {
    setBusy("export");
    setMessage(null);
    const res = await exportBatches(selected);
    setBusy(null);
    if (res.error) {
      setMessage({ type: "error", text: res.error.message });
      return;
    }
    const exportId = res.data[0]?.export_id;
    downloadText(`NOMINA_${country}_${period}_${String(exportId).slice(0, 8)}.csv`, toCanonicalCsv(res.data));
    setMessage({ type: "ok", text: `Exportación generada con ${res.data.length} filas. Los lotes quedaron marcados como exportados.` });
    setSelected([]);
    approved.reload();
    history.reload();
  }

  async function redownload(x) {
    setBusy(x.id);
    const res = await exportRows(x.id);
    setBusy(null);
    if (res.error) setMessage({ type: "error", text: res.error.message });
    else downloadText(`NOMINA_${x.country_code}_${x.period}_${x.id.slice(0, 8)}.csv`, toCanonicalCsv(res.data));
  }

  return (
    <>
      <PageHeader title="Exportaciones" subtitle={`Solo los lotes aprobados de ${formatPeriod(period)} se exportan a nómina, en el formato canónico común a todos los países.`} />

      {message && (
        <p role={message.type === "error" ? "alert" : "status"} className={`mb-4 rounded-md px-3 py-2 text-sm ${message.type === "error" ? "bg-bloqueado-suave text-bloqueado" : "bg-cargar-suave text-cargar"}`}>
          {message.text}
        </p>
      )}

      <section className="mb-8">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-bold">Lotes aprobados por exportar</h2>
          <Button icon={FileOutput} onClick={handleExport} disabled={selected.length === 0} loading={busy === "export"} loadingText="Exportando…">
            Exportar {selected.length > 0 ? `${selected.length} lote${selected.length > 1 ? "s" : ""}` : "seleccionados"}
          </Button>
        </div>
        {approved.loading ? (
          <LoadingState label="Cargando lotes aprobados…" />
        ) : approved.error ? (
          <ErrorState message={approved.error.message} onRetry={approved.reload} />
        ) : batches.length === 0 ? (
          <EmptyState title="No hay lotes aprobados pendientes de exportar">Aprueba lotes desde su detalle; los bloqueados nunca llegan aquí.</EmptyState>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-linea bg-superficie">
            <table className="w-full min-w-[640px] text-sm">
              <caption className="sr-only">Lotes aprobados</caption>
              <thead className="sticky top-0 bg-pizarra text-left text-xs uppercase tracking-wide text-white">
                <tr>
                  <th scope="col" className="w-10 px-3 py-2"><span className="sr-only">Seleccionar</span></th>
                  <th scope="col" className="px-3 py-2">Planta</th>
                  <th scope="col" className="px-3 py-2 text-right">Filas</th>
                  <th scope="col" className="px-3 py-2">Aprobado como</th>
                  <th scope="col" className="px-3 py-2">Aprobado el</th>
                  <th scope="col" className="px-3 py-2"><span className="sr-only">Ver</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-linea">
                {batches.map((b) => {
                  const otherCountry = country && b.country_code !== country;
                  return (
                    <tr key={b.id} className="hover:bg-papel">
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          aria-label={`Seleccionar lote de ${b.sites?.name}`}
                          checked={selected.includes(b.id)}
                          disabled={otherCountry}
                          onChange={() => toggle(b.id)}
                          className="h-5 w-5 accent-petroleo"
                        />
                      </td>
                      <td className="px-3 py-2 font-medium">{b.sites?.name}</td>
                      <td className="px-3 py-2 text-right">{b.row_count}</td>
                      <td className="px-3 py-2"><DispositionBadge value={b.approved_disposition} /></td>
                      <td className="px-3 py-2 text-niebla">{b.decided_at ? new Date(b.decided_at).toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" }) : "—"}</td>
                      <td className="px-3 py-2 text-right"><Link to={`/lotes/${b.id}`} className="font-medium text-petroleo hover:underline">Ver lote</Link></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-bold">Historial de exportaciones</h2>
        {history.loading ? (
          <LoadingState label="Cargando historial…" rows={2} />
        ) : history.error ? (
          <ErrorState message={history.error.message} onRetry={history.reload} />
        ) : history.data.length === 0 ? (
          <EmptyState title="Aún no hay exportaciones" />
        ) : (
          <ul className="divide-y divide-linea rounded-lg border border-linea bg-superficie">
            {history.data.map((x) => (
              <li key={x.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="tabular text-sm">
                  <p className="font-medium">{x.country_code} · {formatPeriod(x.period)} · {x.row_count} filas · {x.batch_ids.length} lote{x.batch_ids.length > 1 ? "s" : ""}</p>
                  <p className="text-xs text-niebla">{new Date(x.created_at).toLocaleString("es-CL")} · id {x.id.slice(0, 8)}</p>
                </div>
                <Button variant="secondary" icon={Download} onClick={() => redownload(x)} loading={busy === x.id} loadingText="Descargando…">Descargar de nuevo</Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
