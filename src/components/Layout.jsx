import { Menu, X } from "lucide-react";
import { useState } from "react";
import { Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Sidebar from "./Sidebar";

export default function Layout() {
  const [open, setOpen] = useState(false);
  const { role, error, loading } = useAuth();

  return (
    <div className="min-h-screen lg:pl-64">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 lg:block">
        <Sidebar />
      </aside>

      <div className="sticky top-0 z-20 flex items-center justify-between bg-pizarra px-4 py-2 text-white lg:hidden">
        <span className="font-display text-sm font-bold [font-stretch:112%]">Validador de Novedades</span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Abrir menú"
          className="inline-flex h-11 w-11 items-center justify-center rounded-md hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menú">
          <div className="absolute inset-0 bg-pizarra/60" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw]">
            <Sidebar onNavigate={() => setOpen(false)} />
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Cerrar menú"
              className="absolute right-2 top-3 inline-flex h-11 w-11 items-center justify-center rounded-md text-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {error && <p role="alert" className="mb-4 rounded-md bg-bloqueado-suave px-3 py-2 text-sm text-bloqueado">{error.message}</p>}
        {!loading && !role && !error && (
          <p role="status" className="mb-4 rounded-md bg-advertencia-suave px-3 py-2 text-sm text-advertencia">
            Tu usuario aún no tiene rol asignado. El administrador debe asignarlo.
          </p>
        )}
        <Outlet />
      </main>
    </div>
  );
}
