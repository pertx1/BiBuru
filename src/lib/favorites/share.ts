import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { Actor } from "@/lib/ai/actors";
import { hasGeminiKey } from "@/lib/ai/gemini";
import type { AdminClient } from "@/lib/supabase/admin";
import { addVideoByUrl, analyzeSoon } from "./service";
import { allUrls } from "./url";

/**
 * Atajo de iPhone «Compartir → BiBuru»: el atajo manda el enlace con una clave personal y se guarda en Favoritos
 * (y se analiza solo) sin abrir la app. Solo se guarda el hash de la clave.
 */
export const hashShareToken = (token: string) => createHash("sha256").update(token).digest("hex");
export function newShareToken() {
  const token = `bb_${randomBytes(24).toString("base64url")}`;
  return { token, hash: hashShareToken(token) };
}

export type ShareResult = { added: number; duplicates: number; invalid: number; title?: string };

/** Guarda los enlaces de un texto compartido (máx. 20). null = clave no válida. */
export async function saveShared(admin: AdminClient, token: string, text: string): Promise<ShareResult | null> {
  const { data: t } = await admin.from("share_tokens").select("id, user_id, workspace_id, uses").eq("token_hash", hashShareToken(token)).maybeSingle();
  if (!t) return null;
  const { data: p } = await admin.from("profiles").select("timezone").eq("user_id", t.user_id).maybeSingle();
  const a: Actor = { supabase: admin, workspaceId: t.workspace_id, userId: t.user_id, timezone: p?.timezone ?? "Europe/Madrid" };
  const out: ShareResult = { added: 0, duplicates: 0, invalid: 0 };
  const urls = allUrls(text).slice(0, 20);
  if (!urls.length) out.invalid++;
  for (const u of urls) {
    const r = await addVideoByUrl(a, u);
    if (!r.ok) { out.invalid++; continue; }
    if (r.duplicate) { out.duplicates++; continue; }
    out.added++;
    if (!out.title) out.title = (await admin.from("saved_videos").select("title").eq("id", r.id).maybeSingle()).data?.title ?? undefined;
    if (!r.unavailable && hasGeminiKey()) analyzeSoon(a.userId, a.workspaceId, r.id);
  }
  await admin.from("share_tokens").update({ last_used_at: new Date().toISOString(), uses: t.uses + 1 }).eq("id", t.id);
  return out;
}

/** Texto corto para la notificación del atajo. */
export function shareMessage(r: ShareResult): string {
  if (r.added) return `Guardado en BiBuru ✔${r.title && r.added === 1 ? ` · ${r.title.slice(0, 60)}` : r.added > 1 ? ` (${r.added} vídeos)` : ""}. Se analiza solo.`;
  if (r.duplicates) return "Ya estaba en tus Favoritos de BiBuru.";
  return "No he encontrado ningún enlace de vídeo en lo que has compartido.";
}
