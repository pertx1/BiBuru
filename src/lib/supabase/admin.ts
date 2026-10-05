import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getPublicEnv } from "@/lib/env";
import type { Database } from "./database.types";

/**
 * Cliente con la clave de servicio (salta RLS). SOLO para tareas del servidor sin usuario (cron).
 * Nunca se importa desde código de cliente ni se expone al navegador.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY");
  return createClient<Database>(getPublicEnv().NEXT_PUBLIC_SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
export type AdminClient = ReturnType<typeof createAdminClient>;
