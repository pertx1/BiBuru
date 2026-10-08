import "server-only";
import { getContext } from "@/lib/context";
import { mailStatus, mergeItems, type UnifiedFilters, type UnifiedItem } from "./unified";

const likeText = (s: string) => s.replace(/[%_,()\\]/g, " ").trim();

/** Cuentas de correo asignadas a un negocio. */
export async function businessMailAccounts(businessId: string) {
  const { supabase, userId } = await getContext();
  const { data } = await supabase.from("mail_accounts").select("id, email, status").eq("user_id", userId).eq("business_id", businessId);
  return data ?? [];
}

/** Mensajes del negocio: el correo de sus cuentas de Outlook, con filtros por estado y búsqueda. */
export async function listBusinessMessages(businessId: string, f: UnifiedFilters): Promise<{ items: UnifiedItem[]; accounts: { mail: Awaited<ReturnType<typeof businessMailAccounts>> } }> {
  const { supabase, userId } = await getContext();
  const mail = await businessMailAccounts(businessId);
  if (!mail.length) return { items: [], accounts: { mail } };
  const email = new Map(mail.map((a) => [a.id, a.email]));
  let q = supabase.from("mail_messages").select("id, account_id, from_name, from_address, subject, preview, received_at, is_read, web_link, triage")
    .eq("user_id", userId).in("account_id", mail.map((a) => a.id)).order("received_at", { ascending: false }).limit(150);
  if (f.estado === "sin_responder") q = q.is("triage", null).eq("is_read", false);
  else if (f.estado !== "todos") q = q.eq("triage", f.estado);
  if (f.q && likeText(f.q)) { const t = `%${likeText(f.q)}%`; q = q.or(`subject.ilike.${t},from_name.ilike.${t},from_address.ilike.${t},preview.ilike.${t}`); }
  const { data, error } = await q;
  if (error) { console.error("[mensajes] correo", error.message); return { items: [], accounts: { mail } }; }
  const items: UnifiedItem[] = data.map((m) => ({
    key: `correo:${m.id}`, id: m.id, channel: "correo", kind: "Correo", account: email.get(m.account_id) ?? "",
    person: m.from_name || m.from_address || "Desconocido", preview: [m.subject, m.preview].filter(Boolean).join(" · "), at: m.received_at,
    status: mailStatus(m), href: `/correo?abrir=${m.id}`, externalUrl: m.web_link,
  }));
  return { items: mergeItems([items], { ...f, q: undefined }), accounts: { mail } };
}

/** Correos sin responder de un negocio (pestaña «Mensajes»): sin leer ni marcar. Nunca lanza. */
export async function countBusinessUnanswered(businessId: string): Promise<number> {
  try {
    const { supabase, userId } = await getContext();
    const mail = await businessMailAccounts(businessId);
    if (!mail.length) return 0;
    const { count } = await supabase.from("mail_messages").select("id", { count: "exact", head: true }).eq("user_id", userId).in("account_id", mail.map((a) => a.id)).is("triage", null).eq("is_read", false);
    return count ?? 0;
  } catch { return 0; }
}
