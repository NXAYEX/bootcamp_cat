import { supabase, supabaseConfigured } from "../lib/supabase";

const NOT_CONFIGURED = { message: "La aplicación no tiene configuradas las variables de Supabase." };

// Ejecuta una consulta y normaliza la respuesta a { data, error } con mensajes en español.
export async function run(buildQuery) {
  if (!supabaseConfigured) return { data: null, error: NOT_CONFIGURED };
  try {
    const { data, error, count } = await buildQuery(supabase);
    if (error) return { data: null, error: { message: translateError(error), raw: error } };
    return { data, count, error: null };
  } catch (e) {
    return { data: null, error: { message: translateError(e), raw: e } };
  }
}

export function translateError(error) {
  const msg = error?.message || String(error);
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return "No hay conexión con el servidor. Revisa tu conexión e intenta de nuevo.";
  if (/Invalid login credentials/i.test(msg)) return "Correo o contraseña incorrectos.";
  if (/Email not confirmed/i.test(msg)) return "El correo aún no está confirmado. Pide al administrador que lo confirme.";
  if (/JWT expired/i.test(msg)) return "Tu sesión expiró. Vuelve a iniciar sesión.";
  if (/permission denied/i.test(msg)) return "No tienes permiso para ver estos datos.";
  return msg;
}
