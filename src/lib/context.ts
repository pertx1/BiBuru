import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Contexto de la petición: cliente de Supabase con la sesión del usuario (RLS
 * aplicada), su id y el workspace por defecto. Se calcula una vez por petición.
 */
export const getContext = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("default_workspace_id, timezone, display_name")
    .eq("user_id", userId)
    .maybeSingle();
  if (!profile?.default_workspace_id) redirect("/login?error=perfil");

  return {
    supabase,
    userId,
    workspaceId: profile.default_workspace_id,
    timezone: profile.timezone,
    displayName: profile.display_name,
  };
});
