import "server-only";
import { getContext } from "@/lib/context";
import { microsoftConfig } from "./graph";

export type MailFilters = { account?: string; business?: string; unread?: boolean; q?: string };
const UUID = /^[0-9a-f-]{36}$/i;

export async function listMailAccounts() {
  const { supabase, userId } = await getContext();
  const { data } = await supabase.from("mail_accounts").select("id, email, display_name, business_id, status, last_sync_at, last_error, notify_new").eq("user_id", userId).order("created_at");
  return data ?? [];
}

/** Bandeja unificada (todas las cuentas), con filtros por cuenta, negocio, no leídos y búsqueda. */
export async function listMail(f: MailFilters, limit = 50) {
  const { supabase, userId } = await getContext();
  const accounts = await listMailAccounts();
  let ids = accounts.map((a) => a.id);
  if (f.account && UUID.test(f.account)) ids = ids.filter((id) => id === f.account);
  if (f.business && UUID.test(f.business)) ids = accounts.filter((a) => a.business_id === f.business && ids.includes(a.id)).map((a) => a.id);
  if (!ids.length) return { accounts, messages: [], unread: 0 };
  let q = supabase.from("mail_messages").select("id, account_id, from_name, from_address, subject, preview, received_at, is_read, has_attachments, web_link")
    .eq("user_id", userId).in("account_id", ids).order("received_at", { ascending: false }).limit(limit);
  if (f.unread) q = q.eq("is_read", false);
  if (f.q?.trim()) q = q.textSearch("fts", f.q.trim().split(/\s+/).map((w) => `${w.replace(/[^\p{L}\p{N}@.]/gu, "")}:*`).filter((w) => w.length > 2).join(" & ") || "x", { config: "spanish" });
  const [{ data }, { count }] = await Promise.all([q, supabase.from("mail_messages").select("id", { count: "exact", head: true }).eq("user_id", userId).in("account_id", ids).eq("is_read", false)]);
  return { accounts, messages: data ?? [], unread: count ?? 0 };
}

export const mailConfigured = () => !!microsoftConfig() && !!process.env.TOKEN_ENCRYPTION_KEY;
