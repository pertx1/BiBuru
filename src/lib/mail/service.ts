import "server-only";
import { decryptSecret, encryptSecret } from "@/lib/favorites/crypto";
import type { AdminClient } from "@/lib/supabase/admin";
import { deltaPass, GraphError, initialDeltaUrl, refreshMsToken, type GraphMessage } from "./graph";

export type MailAccountRow = { id: string; user_id: string; workspace_id: string; email: string; refresh_token_enc: string; delta_link: string | null; status: string };

/** Token de acceso de una cuenta. Guarda el refresh token nuevo si Microsoft lo rota; si lo retiró, marca la cuenta. */
export async function accessTokenFor(admin: AdminClient, acc: Pick<MailAccountRow, "id" | "refresh_token_enc">, f: typeof fetch = fetch): Promise<string | null> {
  try {
    const t = await refreshMsToken(decryptSecret(acc.refresh_token_enc), f);
    if (t.refreshToken) await admin.from("mail_accounts").update({ refresh_token_enc: encryptSecret(t.refreshToken) }).eq("id", acc.id);
    return t.accessToken;
  } catch (e) {
    const revoked = e instanceof GraphError && e.revoked;
    await admin.from("mail_accounts").update({ status: revoked ? "revoked" : "error", last_error: (e instanceof Error ? e.message : "Error de Microsoft").slice(0, 300) }).eq("id", acc.id);
    return null;
  }
}

/** Fila de cabecera a partir de un mensaje de Graph (solo remitente, asunto, fecha y vista previa). */
export function headerRow(acc: Pick<MailAccountRow, "id" | "user_id" | "workspace_id">, m: GraphMessage) {
  const web = m.webLink && m.webLink.startsWith("https://") ? m.webLink.slice(0, 2000) : null;
  return {
    account_id: acc.id, user_id: acc.user_id, workspace_id: acc.workspace_id, graph_id: m.id.slice(0, 400),
    from_name: m.from?.emailAddress?.name?.slice(0, 200) ?? null, from_address: m.from?.emailAddress?.address?.slice(0, 320).toLowerCase() ?? null,
    subject: m.subject?.slice(0, 500) ?? null, preview: m.bodyPreview?.replace(/\s+/g, " ").trim().slice(0, 300) ?? null,
    received_at: m.receivedDateTime ?? new Date().toISOString(), is_read: !!m.isRead, has_attachments: !!m.hasAttachments, web_link: web,
  };
}

/**
 * Sincroniza una cuenta con consultas incrementales (delta): la primera vez, los últimos 30 días; después, solo cambios.
 * Los cambios de «leído» también llegan por delta. Nunca guarda el cuerpo.
 */
export async function syncMailAccount(admin: AdminClient, acc: MailAccountRow, f: typeof fetch = fetch, now = new Date()) {
  const token = await accessTokenFor(admin, acc, f);
  if (!token) return { ok: false as const, error: "Sin acceso a Microsoft" };
  try {
    let r;
    try { r = await deltaPass(token, acc.delta_link ?? initialDeltaUrl(now), f); }
    catch (e) {
      if (!(e instanceof GraphError && e.status === 410)) throw e;
      r = await deltaPass(token, initialDeltaUrl(now), f); // el enlace caducó: se empieza de nuevo (sin duplicar: upsert)
    }
    if (r.changed.length) {
      const { error } = await admin.from("mail_messages").upsert(r.changed.map((m) => headerRow(acc, m)), { onConflict: "account_id,graph_id" });
      if (error) throw new Error(error.message);
    }
    if (r.removed.length) await admin.from("mail_messages").delete().eq("account_id", acc.id).in("graph_id", r.removed);
    await admin.from("mail_accounts").update({ delta_link: r.next, last_sync_at: now.toISOString(), status: "ok", last_error: null }).eq("id", acc.id);
    return { ok: true as const, changed: r.changed.length, removed: r.removed.length };
  } catch (e) {
    const error = (e instanceof Error ? e.message : "Error al sincronizar").slice(0, 300);
    await admin.from("mail_accounts").update({ status: e instanceof GraphError && e.revoked ? "revoked" : "error", last_error: error, last_sync_at: now.toISOString() }).eq("id", acc.id);
    return { ok: false as const, error };
  }
}

/** Cron: cuentas que llevan más de `staleMinutes` sin sincronizar (también las que dieron error, por si era temporal). */
export async function syncDueMailAccounts(admin: AdminClient, o: { limit?: number; staleMinutes?: number; userId?: string } = {}) {
  const cutoff = new Date(Date.now() - (o.staleMinutes ?? 8) * 60_000).toISOString();
  let q = admin.from("mail_accounts").select("id, user_id, workspace_id, email, refresh_token_enc, delta_link, status")
    .neq("status", "revoked").or(`last_sync_at.is.null,last_sync_at.lt.${cutoff}`).order("last_sync_at", { ascending: true, nullsFirst: true }).limit(o.limit ?? 10);
  if (o.userId) q = q.eq("user_id", o.userId);
  const { data } = await q;
  let ok = 0, failed = 0;
  for (const acc of data ?? []) ((await syncMailAccount(admin, acc)).ok ? ok++ : failed++);
  return { accounts: data?.length ?? 0, ok, failed };
}
