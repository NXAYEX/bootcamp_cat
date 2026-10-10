import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "./AuthContext";
import { getPeriods } from "../services/reference";

const PeriodContext = createContext(null);
const STORAGE_KEY = "validador.periodo";

function readStored() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

// Periodo de trabajo (AAAA-MM) visible en toda la app. Por defecto, el periodo abierto más antiguo.
export function PeriodProvider({ children }) {
  const { session } = useAuth();
  const [periods, setPeriods] = useState([]);
  const [period, setPeriodState] = useState(readStored);

  useEffect(() => {
    if (!session) return;
    getPeriods().then(({ data }) => {
      const list = data || [];
      setPeriods(list);
      const known = [...new Set(list.map((p) => p.period))];
      setPeriodState((current) => {
        if (current && known.includes(current)) return current;
        const open = list.filter((p) => p.status === "open").map((p) => p.period).sort();
        return open[0] || known[0] || null;
      });
    });
  }, [session]);

  const value = useMemo(
    () => ({
      period,
      periods,
      periodOptions: [...new Set(periods.map((p) => p.period))].sort().reverse(),
      isClosed: (countryCode, p = period) =>
        periods.some((x) => x.country_code === countryCode && x.period === p && x.status === "closed"),
      setPeriod: (p) => {
        setPeriodState(p);
        try {
          localStorage.setItem(STORAGE_KEY, p);
        } catch {
          // Almacenamiento no disponible: el periodo se mantiene solo en memoria.
        }
      },
    }),
    [period, periods]
  );

  return <PeriodContext.Provider value={value}>{children}</PeriodContext.Provider>;
}

export function usePeriod() {
  const ctx = useContext(PeriodContext);
  if (!ctx) throw new Error("usePeriod debe usarse dentro de PeriodProvider");
  return ctx;
}

export function formatPeriod(p) {
  if (!p) return "—";
  const [y, m] = p.split("-").map(Number);
  const name = new Date(y, m - 1, 1).toLocaleDateString("es-CL", { month: "long", year: "numeric" });
  return name.charAt(0).toUpperCase() + name.slice(1);
}
