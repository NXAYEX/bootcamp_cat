import { LogOut } from "lucide-react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { formatPeriod, usePeriod } from "../context/PeriodContext";
import { navForRole, ROLE_LABELS } from "../lib/navigation";

export default function Sidebar({ onNavigate }) {
  const { profile, role, signOut, countries } = useAuth();
  const { period, periodOptions, setPeriod } = usePeriod();

  return (
    <div className="flex h-full flex-col bg-pizarra text-white">
      <div className="border-b border-white/10 px-4 py-4">
        <p className="font-display text-base font-bold [font-stretch:112%]">Validador de Novedades</p>
        <p className="text-xs text-white/70">Remuneraciones · antes de la nómina</p>
      </div>

      <div className="border-b border-white/10 px-4 py-3">
        <label htmlFor="periodo" className="text-xs uppercase tracking-wide text-white/70">Periodo en proceso</label>
        <select
          id="periodo"
          value={period || ""}
          onChange={(e) => setPeriod(e.target.value)}
          className="mt-1 w-full rounded-md border border-white/20 bg-white/10 px-2 py-2 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          {periodOptions.length === 0 && <option value="">Sin periodos</option>}
          {periodOptions.map((p) => (
            <option key={p} value={p} className="text-pizarra">{formatPeriod(p)}</option>
          ))}
        </select>
      </div>

      <nav aria-label="Navegación principal" className="flex-1 overflow-y-auto px-2 py-3">
        <ul className="space-y-1">
          {navForRole(role).map(({ to, label, icon: Icon }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={to === "/"}
                onClick={onNavigate}
                className={({ isActive }) =>
                  `flex min-h-[40px] items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${
                    isActive ? "bg-white font-medium text-pizarra" : "text-white/85 hover:bg-white/10"
                  }`
                }
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="border-t border-white/10 px-4 py-3 text-sm">
        <p className="truncate font-medium" title={profile?.email}>{profile?.full_name || profile?.email}</p>
        <p className="text-xs text-white/70">
          {ROLE_LABELS[role] || "Sin rol asignado"}
          {countries.length > 0 && ` · ${countries.join(", ")}`}
        </p>
        <button
          type="button"
          onClick={signOut}
          className="mt-3 inline-flex min-h-[40px] w-full items-center justify-center gap-2 rounded-md border border-white/25 px-3 text-sm hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" /> Cerrar sesión
        </button>
      </div>
    </div>
  );
}
