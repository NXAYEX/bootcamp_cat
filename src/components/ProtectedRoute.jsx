import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import FullPageStatus from "./FullPageStatus";

export default function ProtectedRoute() {
  const { session, loading } = useAuth();
  const location = useLocation();
  if (loading && !session) return <FullPageStatus message="Verificando tu sesión…" />;
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}
