import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import FullPageStatus from "./components/FullPageStatus";
import Layout from "./components/Layout";
import ProtectedRoute from "./components/ProtectedRoute";
import RoleRoute from "./components/RoleRoute";
import { AuthProvider } from "./context/AuthContext";
import { PeriodProvider } from "./context/PeriodContext";
import Login from "./pages/Login";

// Cada página se carga bajo demanda para que el inicio de sesión sea liviano en el celular.
const Dashboard = lazy(() => import("./pages/Dashboard"));
const NewBatch = lazy(() => import("./pages/NewBatch"));
const BatchDetail = lazy(() => import("./pages/BatchDetail"));
const MobileCapture = lazy(() => import("./pages/MobileCapture"));
const Exceptions = lazy(() => import("./pages/Exceptions"));
const Exports = lazy(() => import("./pages/Exports"));
const Procedures = lazy(() => import("./pages/Procedures"));
const ProcedureAudit = lazy(() => import("./pages/ProcedureAudit"));
const Reports = lazy(() => import("./pages/Reports"));
const Settings = lazy(() => import("./pages/Settings"));
const About = lazy(() => import("./pages/About"));

const SUP_ANALYST = ["site_supervisor", "central_analyst"];

export default function App() {
  return (
    <AuthProvider>
      <PeriodProvider>
        <Suspense fallback={<FullPageStatus message="Cargando…" />}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route element={<ProtectedRoute />}>
              <Route element={<Layout />}>
                <Route index element={<Dashboard />} />
                <Route path="lotes/nuevo" element={<RoleRoute roles={SUP_ANALYST}><NewBatch /></RoleRoute>} />
                <Route path="lotes/:id" element={<RoleRoute roles={SUP_ANALYST}><BatchDetail /></RoleRoute>} />
                <Route path="captura" element={<RoleRoute roles={["site_supervisor"]}><MobileCapture /></RoleRoute>} />
                <Route path="excepciones" element={<RoleRoute roles={SUP_ANALYST}><Exceptions /></RoleRoute>} />
                <Route path="exportaciones" element={<RoleRoute roles={["central_analyst"]}><Exports /></RoleRoute>} />
                <Route path="procedimientos" element={<RoleRoute roles={["process_owner", "central_analyst"]}><Procedures /></RoleRoute>} />
                <Route path="procedimientos/:id" element={<RoleRoute roles={["process_owner", "central_analyst"]}><ProcedureAudit /></RoleRoute>} />
                <Route path="reportes" element={<RoleRoute roles={["central_analyst", "admin"]}><Reports /></RoleRoute>} />
                <Route path="configuracion" element={<RoleRoute roles={["admin"]}><Settings /></RoleRoute>} />
                <Route path="acerca" element={<About />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Route>
          </Routes>
        </Suspense>
      </PeriodProvider>
    </AuthProvider>
  );
}
