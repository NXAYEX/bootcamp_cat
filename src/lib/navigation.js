import { FileCheck2, FileUp, Gauge, Info, LayoutDashboard, Settings, ShieldAlert, Smartphone, FileOutput } from "lucide-react";

export const ROLE_LABELS = {
  site_supervisor: "Supervisor de planta",
  central_analyst: "Analista del centro de operaciones",
  process_owner: "Dueño de proceso",
  admin: "Administración",
};

// Los enlaces se muestran según el rol; la protección real de los datos la hace RLS en la base de datos.
export const NAV_ITEMS = [
  { to: "/", label: "Panel del periodo", icon: LayoutDashboard, roles: null },
  { to: "/lotes/nuevo", label: "Subir lote", icon: FileUp, roles: ["site_supervisor", "central_analyst"] },
  { to: "/captura", label: "Captura en terreno", icon: Smartphone, roles: ["site_supervisor"] },
  { to: "/excepciones", label: "Cola de excepciones", icon: ShieldAlert, roles: ["site_supervisor", "central_analyst"] },
  { to: "/exportaciones", label: "Exportaciones", icon: FileOutput, roles: ["central_analyst"] },
  { to: "/procedimientos", label: "Procedimientos", icon: FileCheck2, roles: ["process_owner", "central_analyst"] },
  { to: "/reportes", label: "Reportes de calidad", icon: Gauge, roles: ["central_analyst", "admin"] },
  { to: "/configuracion", label: "Configuración", icon: Settings, roles: ["admin"] },
  { to: "/acerca", label: "Acerca de", icon: Info, roles: null },
];

export const navForRole = (role) => NAV_ITEMS.filter((i) => !i.roles || i.roles.includes(role));

