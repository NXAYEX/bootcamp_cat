import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getAccess, getProfile, getSession, onAuthChange, signIn as apiSignIn, signOut as apiSignOut } from "../services/auth";
import { getSites } from "../services/reference";

const AuthContext = createContext(null);

// Sesión + perfil + accesos. Ocultar navegación según el rol es solo comodidad: la protección real es RLS.
export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [access, setAccess] = useState([]);
  const [allSites, setAllSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadUser = useCallback(async (nextSession) => {
    setSession(nextSession);
    if (!nextSession) {
      setProfile(null);
      setAccess([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const [p, a, s] = await Promise.all([getProfile(nextSession.user.id), getAccess(nextSession.user.id), getSites()]);
    setError(p.error || a.error || s.error || null);
    setProfile(p.data);
    setAccess(a.data || []);
    setAllSites(s.data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    let active = true;
    getSession().then(({ data }) => active && loadUser(data?.session ?? null));
    const unsubscribe = onAuthChange((next) => {
      if (!active) return;
      setSession((prev) => {
        if (prev?.user?.id !== next?.user?.id) loadUser(next);
        return next;
      });
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [loadUser]);

  const value = useMemo(() => {
    const novedades = access.filter((a) => a.process === "novedades");
    const sites = allSites.filter((s) =>
      novedades.some((a) => a.country_code === s.country_code && (a.site_id === null || a.site_id === s.id))
    );
    const countries = [...new Set(access.map((a) => a.country_code))];
    return {
      session,
      user: session?.user ?? null,
      profile,
      role: profile?.role ?? null,
      access,
      sites,
      countries,
      loading,
      error,
      signIn: async (email, password) => {
        const res = await apiSignIn(email, password);
        if (!res.error) await loadUser(res.data.session);
        return res;
      },
      signOut: async () => {
        await apiSignOut();
        await loadUser(null);
      },
      refresh: () => loadUser(session),
    };
  }, [session, profile, access, allSites, loading, error, loadUser]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return ctx;
}
