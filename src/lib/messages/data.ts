import "server-only";
import { getContext } from "@/lib/context";
import { listThreads } from "@/lib/inbox/data";
import { CAPABILITIES, KIND_LABEL, type Platform, type ThreadKind } from "@/lib/inbox/logic";
import { mailStatus, mergeItems, type UnifiedFilters, type UnifiedItem } from "./unified";

const likeText = (s: string) => s.replace(/[%_,()\\]/g, " ").trim();

/** Cuentas (de correo y de redes) asignadas a un negocio. */
export async function businessAccounts(businessId: string) {
  const { supabase, workspaceId, userId } = await getContext();
  const [{ data: social }, { data: mail }] = await Promise.all([
    supabase.from("social_accounts").select("id, platform, username, scopes, status, last_sync_at, sync_error, inbox_synced_at").eq("workspace_id", workspaceId).eq("business_id", businessId),
    supabase.from("mail_accounts").select("id, email, status").eq("user_id", userId).eq("business_id", businessId),
  ]);
  return { social: social ?? [], mail: mail ?? [] };
}

/** Todo lo de un negocio en una lista: correo, mensajes y comentarios, con filtros por canal, estado y búsqueda. */
export async function listBusinessMessages(businessId: string, f: UnifiedFilters): Promise<{ items: UnifiedItem[]; accounts: Awaited<ReturnType<typeof businessAccounts>> }> {
  const { supabase, userId } = await getContext();
  const accounts = await businessAccounts(businessId);
  const back = encodeURIComponent(`/negocios/${businessId}/mensajes`);

  const social = async (): Promise<UnifiedItem[]> => {
    if (f.canal === "correo") return [];
    const accs = accounts.social.filter((a) => !f.canal || a.platform === f.canal);
    const user = new Map(accs.map((a) => [a.id, a.username ? `@${a.username}` : ""]));
    const threads = await listThreads({ accountIds: accs.map((a) => a.id), estado: f.estado, q: f.q }).catch(() => []);
    return threads.map((t) => ({
      key: `red:${t.id}`, id: t.id, channel: t.platform as Platform, kind: KIND_LABEL[t.kind as ThreadKind] ?? t.kind, account: user.get(t.account_id) ?? "",
      person: t.participant_name || (t.participant_username ? `@${t.participant_username}` : "Alguien"), preview: t.preview ?? "", at: t.last_message_at,
      status: t.status as UnifiedItem["status"], href: `/redes/mensajes/${t.id}?volver=${back}`,
      externalUrl: t.kind === "dm" ? CAPABILITIES[t.platform as Platform].openDmsUrl : t.media_permalink,
    }));
  };

  const mail = async (): Promise<UnifiedItem[]> => {
    if (f.canal && f.canal !== "correo") return [];
    if (!accounts.mail.length) return [];
    const email = new Map(accounts.mail.map((a) => [a.id, a.email]));
    let q = supabase.from("mail_messages").select("id, account_id, from_name, from_address, subject, preview, received_at, is_read, web_link, triage")
      .eq("user_id", userId).in("account_id", accounts.mail.map((a) => a.id)).order("received_at", { ascending: false }).limit(150);
    if (f.estado === "sin_responder") q = q.is("triage", null).eq("is_read", false);
    else if (f.estado !== "todos") q = q.eq("triage", f.estado);
    if (f.q && likeText(f.q)) { const t = `%${likeText(f.q)}%`; q = q.or(`subject.ilike.${t},from_name.ilike.${t},from_address.ilike.${t},preview.ilike.${t}`); }
    const { data, error } = await q;
    if (error) { console.error("[mensajes] correo", error.message); return []; }
    return data.map((m) => ({
      key: `correo:${m.id}`, id: m.id, channel: "correo" as const, kind: "Correo", account: email.get(m.account_id) ?? "",
      person: m.from_name || m.from_address || "Desconocido", preview: [m.subject, m.preview].filter(Boolean).join(" · "), at: m.received_at,
      status: mailStatus(m), href: `/correo?abrir=${m.id}`, externalUrl: m.web_link,
    }));
  };

  const [a, b] = await Promise.all([social(), mail()]);
  // La búsqueda de redes ya se aplicó en la base de datos; la del correo también: se vuelve a comprobar igual en memoria.
  return { items: mergeItems([a, b], { ...f, q: undefined }), accounts };
}

/** Sin responder de un negocio (pestaña «Mensajes»): hilos de sus redes + correos sin leer ni marcar. Nunca lanza. */
export async function countBusinessUnanswered(businessId: string): Promise<number> {
  try {
    const { supabase, workspaceId, userId } = await getContext();
    const accounts = await businessAccounts(businessId);
    const [s, m] = await Promise.all([
      accounts.social.length ? supabase.from("social_threads").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("status", "sin_responder").in("account_id", accounts.social.map((a) => a.id)) : Promise.resolve({ count: 0 }),
      accounts.mail.length ? supabase.from("mail_messages").select("id", { count: "exact", head: true }).eq("user_id", userId).in("account_id", accounts.mail.map((a) => a.id)).is("triage", null).eq("is_read", false) : Promise.resolve({ count: 0 }),
    ]);
    return (s.count ?? 0) + (m.count ?? 0);
  } catch { return 0; }
}

/** Cuentas de Instagram del espacio que no están asignadas a ningún negocio (para avisar en «Mensajes»). */
export async function unassignedInstagram(): Promise<{ id: string; username: string | null }[]> {
  const { supabase, workspaceId } = await getContext();
  const { data } = await supabase.from("social_accounts").select("id, username").eq("workspace_id", workspaceId).eq("platform", "instagram").is("business_id", null);
  return data ?? [];
}

/** ¿Hay algún hilo guardado (en cualquier estado) de estas cuentas? */
export async function hasThreads(accountIds: string[]): Promise<boolean> {
  if (!accountIds.length) return false;
  const { supabase, workspaceId } = await getContext();
  const { count } = await supabase.from("social_threads").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).in("account_id", accountIds);
  return (count ?? 0) > 0;
}
