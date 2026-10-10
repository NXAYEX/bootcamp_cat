import { ShieldX } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { usePageTitle } from "../hooks/usePageTitle";

// Solo comodidad de navegación: aunque alguien entre a la ruta, RLS no le devuelve datos ajenos.
export default function RoleRoute({ roles, children }) {
  const { role } = useAuth();
  usePageTitle(roles.includes(role) ? null : "Sin acceso");
  if (roles.includes(role)) return children;
  return (
    <div className="mx-auto max-w-lg rounded-lg border border-linea bg-superficie p-6 text-center">
      <ShieldX className="mx-auto mb-3 h-8 w-8 text-niebla" aria-hidden="true" />
      <h1 className="text-lg font-bold">Esta sección no corresponde a tu rol</h1>
      <p className="mt-2 text-sm text-niebla">Si necesitas acceso, pídele al administrador que lo asigne en Configuración.</p>
      <Link to="/" className="mt-4 inline-block rounded-md px-3 py-2 text-sm font-medium text-petroleo hover:bg-petroleo-suave focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petroleo">
        Volver al panel
      </Link>
    </div>
  );
}
