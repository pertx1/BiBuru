"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getContext } from "@/lib/context";
import { syncWorkspaceNow } from "@/lib/sync/service";

const last = new Map<string, number>();

/** «Actualizar todo». Como mucho una vez por minuto por espacio (para no gastar los límites de las redes). */
export async function refreshAll(): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const { workspaceId, userId } = await getContext();
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return { ok: false, error: "Falta SUPABASE_SERVICE_ROLE_KEY en el servidor." };
  if (Date.now() - (last.get(workspaceId) ?? 0) < 60_000) return { ok: true, message: "Ya estaba actualizado hace menos de un minuto" };
  last.set(workspaceId, Date.now());
  try {
    const r = await syncWorkspaceNow(workspaceId, userId);
    revalidatePath("/redes", "layout"); revalidatePath("/correo"); revalidatePath("/");
    const bits = [`${r.accounts} ${r.accounts === 1 ? "cuenta" : "cuentas"}`, r.messages ? `${r.messages} mensajes nuevos` : "", r.mail ? `${r.mail} correos` : "", r.limited ? `${r.limited} con límite (sigue luego)` : "", r.errors ? `${r.errors} con error` : ""].filter(Boolean);
    return { ok: true, message: `Actualizado: ${bits.join(" · ")}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo actualizar" };
  }
}

const prefsSchema = z.object({ inbox_ai_suggest: z.boolean(), inbox_push_enabled: z.boolean(), social_alerts_enabled: z.boolean() }).partial();

/** Ajustes → Redes y mensajes: IA para sugerir respuesta (apagada), aviso de mensajes nuevos y alertas de seguidores (apagadas). */
export async function setSocialPrefs(input: z.infer<typeof prefsSchema>): Promise<{ ok: boolean; error?: string }> {
  const p = prefsSchema.safeParse(input);
  if (!p.success || !Object.keys(p.data).length) return { ok: false, error: "Ajuste no válido" };
  const { supabase, userId } = await getContext();
  const { error } = await supabase.from("profiles").update(p.data).eq("user_id", userId);
  if (error) return { ok: false, error: "No se pudo guardar" };
  revalidatePath("/ajustes");
  return { ok: true };
}
