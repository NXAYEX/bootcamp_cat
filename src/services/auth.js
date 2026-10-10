import { supabase, supabaseConfigured } from "../lib/supabase";
import { run } from "./client";

export async function signIn(email, password) {
  return run((sb) => sb.auth.signInWithPassword({ email, password }));
}

export async function signOut() {
  return run((sb) => sb.auth.signOut());
}

export async function getSession() {
  return run((sb) => sb.auth.getSession());
}

export function onAuthChange(callback) {
  if (!supabaseConfigured) return () => {};
  const { data } = supabase.auth.onAuthStateChange((_event, session) => callback(session));
  return () => data.subscription.unsubscribe();
}

export async function getProfile(userId) {
  return run((sb) => sb.from("profiles").select("id, email, full_name, role").eq("id", userId).maybeSingle());
}

export async function getAccess(userId) {
  return run((sb) =>
    sb
      .from("user_access")
      .select("id, country_code, site_id, process, sites(code, name)")
      .eq("user_id", userId)
  );
}
