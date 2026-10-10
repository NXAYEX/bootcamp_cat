import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import Button from "../components/Button";
import { Select } from "../components/Field";
import { EmptyState, ErrorState, LoadingState } from "../components/StateBlock";
import { useAuth } from "../context/AuthContext";
import { useAsync } from "../hooks/useAsync";
import { ROLE_LABELS } from "../lib/navigation";
import { addAccess, listAuditLog, listUsers, removeAccess, updateUserRole } from "../services/admin";
import { getCountries, getSites } from "../services/reference";

const PROCESS_LABELS = { novedades: "Novedades", procedimientos: "Procedimientos" };

export function UsersPanel() {
  const { user } = useAuth();
  const users = useAsync(() => listUsers(), []);
  const countries = useAsync(() => getCountries(), []);
  const sites = useAsync(() => getSites(), []);
  const [message, setMessage] = useState(null);

  if (users.loading) return <LoadingState label="Cargando usuarios…" />;
  if (users.error) return <ErrorState message={users.error.message} onRetry={users.reload} />;
  if (!users.data.length) return <EmptyState title="No hay usuarios">Crea los usuarios en Supabase &gt; Authentication y vuelve aquí para asignarles rol y accesos.</EmptyState>;

  async function act(fn) {
    setMessage(null);
    const res = await fn();
    if (res.error) setMessage({ type: "error", text: res.error.message });
    else users.reload();
  }

  return (
    <>
      <p className="mb-3 text-sm text-niebla">
        Los usuarios se crean en Supabase &gt; Authentication (no hay registro público). Aquí se asigna su rol y su alcance: país, planta (vacío = todo el país) y proceso.
      </p>
      {message && <p role="alert" className="mb-3 rounded-md bg-bloqueado-suave px-3 py-2 text-sm text-bloqueado">{message.text}</p>}
      <ul className="space-y-3">
        {users.data.map((u) => (
          <li key={u.id} className="rounded-lg border border-linea bg-superficie p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium">{u.email}</p>
                <p className="text-xs text-niebla">{u.full_name || "Sin nombre"}</p>
              </div>
              <div className="sm:w-72">
                <label htmlFor={`role-${u.id}`} className="sr-only">Rol de {u.email}</label>
                <Select id={`role-${u.id}`} value={u.role || ""} disabled={u.id === user.id} onChange={(role) => act(() => updateUserRole(u.id, role || null))}>
                  <option value="">Sin rol</option>
                  {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </Select>
                {u.id === user.id && <p className="mt-1 text-xs text-niebla">No puedes cambiar tu propio rol.</p>}
              </div>
            </div>
            <AccessList user={u} countries={countries.data || []} sites={sites.data || []} onAct={act} />
          </li>
        ))}
      </ul>
    </>
  );
}

function AccessList({ user, countries, sites, onAct }) {
  const [country, setCountry] = useState("");
  const [siteId, setSiteId] = useState("");
  const [process, setProcess] = useState("novedades");
  const countrySites = sites.filter((s) => s.country_code === country);

  return (
    <div className="mt-3 border-t border-linea pt-3">
      {user.user_access.length === 0 ? (
        <p className="text-sm text-niebla">Sin accesos: este usuario no ve datos.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {user.user_access.map((a) => (
            <li key={a.id} className="inline-flex items-center gap-1 rounded-md border border-linea bg-papel py-1 pl-2 pr-1 text-xs">
              {a.country_code} · {a.sites?.code || "todo el país"} · {PROCESS_LABELS[a.process]}
              <button
                type="button"
                onClick={() => onAct(() => removeAccess(a.id))}
                aria-label={`Quitar acceso ${a.country_code} ${a.sites?.code || "todo el país"} ${a.process}`}
                className="inline-flex h-7 w-7 items-center justify-center rounded text-bloqueado hover:bg-bloqueado-suave focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petroleo"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
        <Select id={`c-${user.id}`} label="País" value={country} onChange={(v) => { setCountry(v); setSiteId(""); }}>
          <option value="">País…</option>
          {countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
        </Select>
        <Select id={`s-${user.id}`} label="Planta" value={siteId} onChange={setSiteId} disabled={!country}>
          <option value="">Todo el país</option>
          {countrySites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
        <Select id={`p-${user.id}`} label="Proceso" value={process} onChange={setProcess}>
          {Object.entries(PROCESS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
        <Button
          variant="secondary"
          icon={Plus}
          disabled={!country}
          onClick={() => onAct(() => addAccess({ user_id: user.id, country_code: country, site_id: siteId || null, process }))}
        >
          Dar acceso
        </Button>
      </div>
    </div>
  );
}

export function AuditLogPanel() {
  const q = useAsync(() => listAuditLog(200), []);
  if (q.loading) return <LoadingState label="Cargando registro…" />;
  if (q.error) return <ErrorState message={q.error.message} onRetry={q.reload} />;
  if (!q.data.length) return <EmptyState title="Sin eventos registrados" />;
  return (
    <div className="overflow-x-auto rounded-lg border border-linea bg-superficie">
      <table className="w-full min-w-[720px] text-sm">
        <caption className="sr-only">Últimos 200 eventos de auditoría</caption>
        <thead className="sticky top-0 bg-pizarra text-left text-xs uppercase tracking-wide text-white">
          <tr>
            <th scope="col" className="px-3 py-2">Fecha</th>
            <th scope="col" className="px-3 py-2">Acción</th>
            <th scope="col" className="px-3 py-2">Entidad</th>
            <th scope="col" className="px-3 py-2">Detalle</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-linea">
          {q.data.map((e) => (
            <tr key={e.id} className="align-top">
              <td className="whitespace-nowrap px-3 py-2 text-niebla">{new Date(e.created_at).toLocaleString("es-CL")}</td>
              <td className="px-3 py-2 font-medium">{e.action}</td>
              <td className="px-3 py-2">{e.entity}</td>
              <td className="max-w-md px-3 py-2"><code className="line-clamp-2 break-all text-xs text-niebla">{JSON.stringify(e.details)}</code></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
