import "server-only";
import { getContext } from "@/lib/context";
import type { Database } from "@/lib/supabase/database.types";
import type { InboxFilters } from "./logic";
export { parseInboxFilters } from "./logic";

export type ThreadRow = Database["public"]["Tables"]["social_threads"]["Row"];
export type MessageRow = Database["public"]["Tables"]["social_messages"]["Row"];

/** Hilos de la bandeja con los filtros de la URL (máx. 200; los más recientes primero). */
export async function listThreads(f: InboxFilters & { accountIds: string[] }): Promise<ThreadRow[]> {
  if (!f.accountIds.length) return [];
  const { supabase, workspaceId } = await getContext();
  let q = supabase.from("social_threads").select("*").eq("workspace_id", workspaceId).in("account_id", f.cuenta ? [f.cuenta] : f.accountIds);
  if (f.red) q = q.eq("platform", f.red);
  if (f.tipo) q = q.eq("kind", f.tipo);
  if (f.estado && f.estado !== "todos") q = q.eq("status", f.estado);
  if (f.etiqueta) q = q.contains("labels", [f.etiqueta]);
  if (f.q) {
    const like = `%${f.q.replace(/[%_,()]/g, " ")}%`;
    q = q.or(`participant_name.ilike.${like},participant_username.ilike.${like},preview.ilike.${like},customer_name.ilike.${like}`);
  }
  const { data, error } = await q.order("last_message_at", { ascending: false }).limit(200);
  if (error) throw new Error(error.message);
  return data;
}

/** Un hilo con sus mensajes (orden cronológico). null si no existe o es de otro espacio. */
export async function getThread(id: string): Promise<{ thread: ThreadRow; messages: MessageRow[] } | null> {
  const { supabase, workspaceId } = await getContext();
  const { data: thread } = await supabase.from("social_threads").select("*").eq("id", id).eq("workspace_id", workspaceId).maybeSingle();
  if (!thread) return null;
  const { data: messages } = await supabase.from("social_messages").select("*").eq("thread_id", id).eq("workspace_id", workspaceId).order("sent_at").limit(500);
  return { thread, messages: messages ?? [] };
}

/** Sin responder (contador de la navegación y widget). Nunca lanza: si la tabla no existe todavía, 0. */
export async function countUnanswered(businessId?: string): Promise<number> {
  try {
    const { supabase, workspaceId } = await getContext();
    let accIds: string[] | null = null;
    if (businessId) {
      const { data } = await supabase.from("social_accounts").select("id").eq("workspace_id", workspaceId).eq("business_id", businessId);
      accIds = (data ?? []).map((a) => a.id);
      if (!accIds.length) return 0;
    }
    let q = supabase.from("social_threads").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("status", "sin_responder");
    if (accIds) q = q.in("account_id", accIds);
    const { count } = await q;
    return count ?? 0;
  } catch { return 0; }
}

export async function listSavedReplies(businessId: string | null) {
  const { supabase, workspaceId } = await getContext();
  let q = supabase.from("social_saved_replies").select("id, title, body, business_id").eq("workspace_id", workspaceId).order("title");
  q = businessId ? q.or(`business_id.is.null,business_id.eq.${businessId}`) : q.is("business_id", null);
  const { data } = await q.limit(100);
  return data ?? [];
}
