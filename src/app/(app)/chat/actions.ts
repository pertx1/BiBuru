"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ActionError } from "@/lib/ai/actors";
import { applyPendingAction, runChatTurn, toJson, type ChatLink } from "@/lib/ai/chat";
import { AiBlockedError } from "@/lib/ai/run";
import { sessionAiActorContext } from "@/lib/ai/session";
import { isPendingAction } from "@/lib/ai/tools";
import { getContext } from "@/lib/context";

const uuid = z.uuid();

export type ChatMessage = {
  id: string; role: "user" | "assistant"; content: string; links: ChatLink[];
  pending: { type: string; summary: string } | null; actionStatus: "pending" | "done" | "cancelled" | null;
};

const toMessage = (r: { id: string; role: string; content: string; links: unknown; pending_action: unknown; action_status: string | null }): ChatMessage => ({
  id: r.id, role: r.role as "user" | "assistant", content: r.content, links: Array.isArray(r.links) ? (r.links as ChatLink[]) : [],
  pending: isPendingAction(r.pending_action) ? { type: r.pending_action.type, summary: r.pending_action.summary } : null,
  actionStatus: r.action_status as ChatMessage["actionStatus"],
});

/** Envía un mensaje: el modelo consulta/actúa con herramientas y responde. Todo queda guardado en el historial. */
export async function sendChat(conversationId: string, text: string): Promise<{ ok: true; user: ChatMessage; assistant: ChatMessage; blocked?: boolean } | { ok: false; error: string }> {
  const p = z.object({ conversationId: uuid, text: z.string().trim().min(1).max(4000) }).safeParse({ conversationId, text });
  if (!p.success) return { ok: false, error: "Escribe un mensaje" };
  let ctx;
  try { ctx = await sessionAiActorContext(); } catch (e) { return { ok: false, error: e instanceof AiBlockedError ? e.message : "No se pudo iniciar la IA" }; }
  const { supabase, workspaceId, userId } = ctx;

  const { data: past } = await supabase.from("chat_messages").select("role, content").eq("workspace_id", workspaceId).eq("user_id", userId).eq("conversation_id", p.data.conversationId).order("created_at", { ascending: false }).limit(10);
  const history = (past ?? []).reverse().filter((m) => m.content).map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

  const turn = await runChatTurn(ctx, history, p.data.text);
  const base = { workspace_id: workspaceId, user_id: userId, conversation_id: p.data.conversationId };
  const { data: u } = await supabase.from("chat_messages").insert({ ...base, role: "user", content: p.data.text }).select("*").single();
  const { data: a } = await supabase.from("chat_messages").insert({
    ...base, role: "assistant", content: turn.content, links: turn.links.length ? toJson(turn.links) : null,
    pending_action: turn.pending ? toJson(turn.pending) : null, action_status: turn.pending ? "pending" : null,
  }).select("*").single();
  if (!u || !a) return { ok: false, error: "No se pudo guardar la conversación" };
  revalidatePath("/chat");
  return { ok: true, user: toMessage(u), assistant: toMessage(a), blocked: turn.blocked };
}

/** Confirma una tarjeta de gasto o pedido. Se vuelve a validar en el servidor con lo que ESTE guardó. */
export async function confirmChatAction(messageId: string): Promise<{ ok: true; link: ChatLink } | { ok: false; error: string }> {
  if (!uuid.safeParse(messageId).success) return { ok: false, error: "Mensaje no válido" };
  const { supabase, workspaceId, userId, timezone } = await getContext();
  const { data: m } = await supabase.from("chat_messages").select("id, pending_action, action_status, links").eq("id", messageId).eq("workspace_id", workspaceId).eq("user_id", userId).maybeSingle();
  if (!m || m.action_status !== "pending" || !isPendingAction(m.pending_action)) return { ok: false, error: "Esta acción ya no está pendiente" };
  // Se reserva antes de ejecutar: un doble toque no crea dos gastos.
  const { data: claimed } = await supabase.from("chat_messages").update({ action_status: "done" }).eq("id", messageId).eq("action_status", "pending").select("id");
  if (!claimed?.length) return { ok: false, error: "Esta acción ya se ha procesado" };
  try {
    const created = await applyPendingAction({ supabase, workspaceId, userId, timezone }, m.pending_action);
    const link: ChatLink = { kind: created.kind, id: created.id, label: created.label, href: created.href };
    await supabase.from("chat_messages").update({ links: toJson([...(Array.isArray(m.links) ? m.links : []), link]) }).eq("id", messageId);
    revalidatePath("/negocios", "layout");
    revalidatePath("/chat");
    return { ok: true, link };
  } catch (e) {
    await supabase.from("chat_messages").update({ action_status: "pending" }).eq("id", messageId);
    return { ok: false, error: e instanceof ActionError ? e.message : "No se pudo guardar" };
  }
}

export async function cancelChatAction(messageId: string): Promise<{ ok: boolean }> {
  if (!uuid.safeParse(messageId).success) return { ok: false };
  const { supabase, workspaceId, userId } = await getContext();
  const { error } = await supabase.from("chat_messages").update({ action_status: "cancelled" }).eq("id", messageId).eq("workspace_id", workspaceId).eq("user_id", userId).eq("action_status", "pending");
  revalidatePath("/chat");
  return { ok: !error };
}
