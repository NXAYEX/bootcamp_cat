import { useMemo, useState } from "react";
import { Select } from "./Field";
import { FINDING_STATUS, OWNER, SeverityBadge } from "./Status";

const SEV_ORDER = { blocking: 0, warning: 1, info: 2 };

// Tabla de hallazgos con filtros por severidad y responsable. `renderActions` agrega acciones por fila.
export default function FindingsTable({ findings, renderActions, showStatus = false, caption = "Hallazgos del lote" }) {
  const [severity, setSeverity] = useState("");
  const [owner, setOwner] = useState("");
  const list = useMemo(
    () =>
      findings
        .filter((f) => (!severity || f.severity === severity) && (!owner || f.owner === owner))
        .sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity] || (a.row_number ?? a.rowNumber ?? 0) - (b.row_number ?? b.rowNumber ?? 0)),
    [findings, severity, owner]
  );

  return (
    <div>
      <div className="mb-2 flex flex-col gap-2 sm:flex-row">
        <div className="sm:w-56">
          <label htmlFor="ft-sev" className="sr-only">Severidad</label>
          <Select id="ft-sev" value={severity} onChange={setSeverity}>
            <option value="">Todas las severidades</option>
            <option value="blocking">Bloqueantes</option>
            <option value="warning">Advertencias</option>
            <option value="info">Informativos</option>
          </Select>
        </div>
        <div className="sm:w-56">
          <label htmlFor="ft-owner" className="sr-only">Responsable</label>
          <Select id="ft-owner" value={owner} onChange={setOwner}>
            <option value="">Todos los responsables</option>
            <option value="site">Corrige la planta</option>
            <option value="central">Corrige el centro de operaciones</option>
          </Select>
        </div>
        <p className="tabular self-center text-xs text-niebla sm:ml-auto">{list.length} de {findings.length} hallazgos</p>
      </div>
      <div className="max-h-[70vh] overflow-auto rounded-lg border border-linea bg-superficie">
        <table className="w-full min-w-[760px] text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead className="sticky top-0 z-10 bg-pizarra text-left text-xs uppercase tracking-wide text-white">
            <tr>
              <th scope="col" className="px-3 py-2 text-right">Fila</th>
              <th scope="col" className="px-3 py-2">Código</th>
              <th scope="col" className="px-3 py-2">Severidad</th>
              <th scope="col" className="px-3 py-2">Detalle</th>
              <th scope="col" className="px-3 py-2">Corrige</th>
              {showStatus && <th scope="col" className="px-3 py-2">Estado</th>}
              {renderActions && <th scope="col" className="px-3 py-2"><span className="sr-only">Acciones</span></th>}
            </tr>
          </thead>
          <tbody className="tabular divide-y divide-linea">
            {list.length === 0 ? (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-niebla">No hay hallazgos con estos filtros.</td></tr>
            ) : (
              list.map((f, i) => (
                <tr key={f.id ?? `${f.code}-${f.rowNumber}-${i}`} className="align-top hover:bg-papel">
                  <td className="px-3 py-2 text-right">{f.row_number ?? f.rowNumber ?? <span className="text-niebla">Lote</span>}</td>
                  <td className="whitespace-nowrap px-3 py-2 font-medium">{f.code}</td>
                  <td className="px-3 py-2"><SeverityBadge value={f.severity} /></td>
                  <td className="px-3 py-2">
                    {f.message}
                    {f.resolution_note && <p className="mt-1 text-xs text-niebla">Nota: {f.resolution_note}</p>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">{OWNER[f.owner]}</td>
                  {showStatus && <td className="whitespace-nowrap px-3 py-2">{FINDING_STATUS[f.status]}</td>}
                  {renderActions && <td className="px-3 py-2 text-right">{renderActions(f)}</td>}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
