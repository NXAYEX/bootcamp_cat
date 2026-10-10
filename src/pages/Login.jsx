import { LogIn, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import Button from "../components/Button";
import { useAuth } from "../context/AuthContext";
import { usePageTitle } from "../hooks/usePageTitle";
import { supabaseConfigured } from "../lib/supabase";

const inputClass =
  "mt-1 block w-full rounded-md border border-linea bg-superficie px-3 py-2 text-base focus-visible:border-petroleo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petroleo/40";

export default function Login() {
  usePageTitle("Iniciar sesión");
  const { session, signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  if (session) return <Navigate to={location.state?.from || "/"} replace />;

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const { error: err } = await signIn(email.trim(), password);
    setSubmitting(false);
    if (err) setError(err.message);
    else navigate(location.state?.from || "/", { replace: true });
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_480px]">
      <section className="hidden flex-col justify-between bg-pizarra p-10 text-white lg:flex">
        <p className="font-display text-lg font-bold [font-stretch:112%]">Validador de Novedades</p>
        <div className="max-w-lg">
          <h1 className="text-2xl font-bold leading-tight">Cada hora extraordinaria, feriado y ausencia revisada antes de llegar a la nómina.</h1>
          <p className="mt-4 text-white/75">
            Las plantas envían sus novedades del mes, el validador aplica las reglas del país y el centro de operaciones decide si el lote se carga, se carga con advertencias o se bloquea.
          </p>
        </div>
        <p className="text-xs text-white/60">Prototipo académico con datos sintéticos. No es un producto oficial de la compañía.</p>
      </section>

      <section className="flex items-center justify-center px-4 py-10">
        <form onSubmit={handleSubmit} className="w-full max-w-sm" noValidate>
          <h2 className="text-xl font-bold lg:hidden">Validador de Novedades</h2>
          <p className="mt-1 text-sm text-niebla lg:mt-0">Ingresa con la cuenta que te entregó el administrador.</p>

          {!supabaseConfigured && (
            <p role="alert" className="mt-4 flex gap-2 rounded-md bg-advertencia-suave p-3 text-sm text-advertencia">
              <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
              Faltan las variables VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en este despliegue.
            </p>
          )}

          <label className="mt-6 block text-sm font-medium" htmlFor="email">Correo</label>
          <input id="email" type="email" autoComplete="username" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />

          <label className="mt-4 block text-sm font-medium" htmlFor="password">Contraseña</label>
          <input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />

          {error && <p role="alert" className="mt-4 rounded-md bg-bloqueado-suave px-3 py-2 text-sm text-bloqueado">{error}</p>}

          <Button type="submit" icon={LogIn} loading={submitting} loadingText="Ingresando…" disabled={!email || !password || !supabaseConfigured} className="mt-6 w-full">
            Ingresar
          </Button>
          <p className="mt-6 text-xs text-niebla">No hay registro público: las cuentas las crea el administrador.</p>
        </form>
      </section>
    </div>
  );
}
