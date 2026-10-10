import { FileUp, Smartphone } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Select } from "../components/Field";
import PageHeader from "../components/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "../components/StateBlock";
import { BATCH_STATUS, DispositionBadge } from "../components/Status";
import { useAuth } from "../context/AuthContext";
import { formatPeriod, usePeriod } from "../context/PeriodContext";
import { useAsync } from "../hooks/useAsync";
import { listBatches } from "../services/batches";

const linkButton =
  "inline-flex min-h-[40px] items-center gap-2 rounded-md px-4 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petroleo focus-visible:ring-offset-2";

export default function Dashboard() {
  const { role } = useAuth();
  if (role === "site_supervisor" || role === "central_analyst") return <BatchDashboard />;
  return <OtherDashboard role={role} />;
}

function BatchDashboard() {
  const { role, sites } = useAuth();
  const { period } = usePeriod();
  const [siteId, setSiteId] = useState("");
  const [status, setStatus] = useState("");
  const { data, error, loading, reload } = useAsync(() => listBatches({ period, siteId: siteId || undefined, status: status || undefined }), [period, siteId, status]);

  const summary = useMemo(() => {
    const list = data || [];
    return {
      total: list.length,
      pending: list.filter((b) => b.status === "validated").length,
      blocked: list.filter((b) => b.status === "validated" && b.disposition === "block").length,
      approved: list.filter((b) => b.status === "approved").length,
      exported: list.filter((b) => b.status === "exported").length,
    };
  }, [data]);

  return (
    <>
      <PageHeader
        title={`Panel de ${formatPeriod(period)}`}
        subtitle={role === "site_supervisor" ? "Lotes de novedades de tu planta en el periodo." : "Lotes de novedades de las plantas de tu país en el periodo."}
        actions={
          <>
            <Link to="/lotes/nuevo" className={`${linkButton} bg-petroleo text-white hover:bg-petroleo-hover`}>
              <FileUp className="h-4 w-4" aria-hidden="true" /> Subir lote
            </Link>
            {role === "site_supervisor" && (
              <Link to="/captura" className={`${linkButton} border border-linea bg-superficie hover:bg-papel`}>
                <Smartphone className="h-4 w-4" aria-hidden="true" /> Captura en terreno
              </Link>
            )}
          </>
        }
      />

      <dl className="tabular mb-6 grid grid-cols-2 divide-linea overflow-hidden rounded-lg border border-linea bg-superficie sm:grid-cols-5 sm:divide-x">
        {[
          ["Lotes", summary.total],
          ["Pendientes de decisión", summary.pending],
          ["Bloqueados", summary.blocked],
          ["Aprobados", summary.approved],
          ["Exportados", summary.exported],
        ].map(([label, n]) => (
          <div key={label} className="border-b border-linea px-4 py-3 sm:border-b-0">
            <dt className="text-xs text-niebla">{label}</dt>
            <dd className="text-lg font-semibold">{loading ? "—" : n}</dd>
          </div>
        ))}
      </dl>

      <div className="mb-3 flex flex-col gap-2 sm:flex-row">
        {sites.length > 1 && (
          <div className="sm:w-64">
            <label htmlFor="f-site" className="sr-only">Planta</label>
            <Select id="f-site" value={siteId} onChange={setSiteId}>
              <option value="">Todas las plantas</option>
              {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </div>
        )}
        <div className="sm:w-64">
          <label htmlFor="f-status" className="sr-only">Estado</label>
          <Select id="f-status" value={status} onChange={setStatus}>
            <option value="">Todos los estados</option>
            {Object.entries(BATCH_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </div>
      </div>

      {loading ? (
        <LoadingState label="Cargando lotes…" />
      ) : error ? (
        <ErrorState message={error.message} onRetry={reload} />
      ) : data.length === 0 ? (
        <EmptyState title="No hay lotes en este periodo" action={<Link to="/lotes/nuevo" className={`${linkButton} bg-petroleo text-white hover:bg-petroleo-hover`}>Subir el primer lote</Link>}>
          Sube el archivo de novedades del mes o regístralas desde la captura en terreno.
        </EmptyState>
      ) : (
        <BatchTable batches={data} />
      )}
    </>
  );
}

function BatchTable({ batches }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-linea bg-superficie">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="sticky top-0 bg-pizarra text-left text-xs uppercase tracking-wide text-white">
          <tr>
            <th scope="col" className="px-3 py-2">Planta</th>
            <th scope="col" className="px-3 py-2">Origen</th>
            <th scope="col" className="px-3 py-2 text-right">Filas</th>
            <th scope="col" className="px-3 py-2">Disposición</th>
            <th scope="col" className="px-3 py-2">Estado</th>
            <th scope="col" className="px-3 py-2">Enviado</th>
            <th scope="col" className="px-3 py-2"><span className="sr-only">Abrir</span></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-linea">
          {batches.map((b) => (
            <tr key={b.id} className="hover:bg-papel">
              <td className="px-3 py-2 font-medium">{b.sites?.name}</td>
              <td className="px-3 py-2">
                {b.source === "mobile" ? "Captura en terreno" : <span className="block max-w-[220px] truncate" title={b.file_name}>{b.file_name}</span>}
              </td>
              <td className="px-3 py-2 text-right">{b.row_count}</td>
              <td className="px-3 py-2"><DispositionBadge value={b.disposition} /></td>
              <td className="px-3 py-2">{BATCH_STATUS[b.status]}</td>
              <td className="px-3 py-2 text-niebla">{new Date(b.created_at).toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" })}</td>
              <td className="px-3 py-2 text-right">
                <Link to={`/lotes/${b.id}`} className="rounded px-2 py-1 font-medium text-petroleo hover:bg-petroleo-suave focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petroleo">
                  Ver lote
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OtherDashboard({ role }) {
  const links =
    role === "admin"
      ? [
          ["/configuracion", "Configuración", "Reglas por país, conceptos, reglas de validación, checklist y usuarios."],
          ["/reportes", "Reportes de calidad", "Métricas agregadas por país, sin datos personales."],
        ]
      : role === "process_owner"
        ? [["/procedimientos", "Procedimientos", "Sube un procedimiento y audítalo contra el checklist del país."]]
        : [];
  return (
    <>
      <PageHeader title="Inicio" subtitle="Accesos de tu rol." />
      {links.length === 0 ? (
        <EmptyState title="Aún no tienes un rol asignado">Pídele al administrador que te asigne rol, país y planta.</EmptyState>
      ) : (
        <ul className="divide-y divide-linea rounded-lg border border-linea bg-superficie">
          {links.map(([to, title, desc]) => (
            <li key={to}>
              <Link to={to} className="block px-4 py-4 hover:bg-papel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-petroleo">
                <p className="font-medium text-petroleo">{title}</p>
                <p className="text-sm text-niebla">{desc}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
