"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createNote, createTask } from "@/lib/ai/actors";
import { geminiProvider, getModelNames, hasGeminiKey } from "@/lib/ai/gemini";
import { getAiContext, runAi } from "@/lib/ai/run";
import { getContext } from "@/lib/context";
import { decryptSecret } from "@/lib/favorites/crypto";
import { CAPABILITIES, replyWindow, type Platform } from "@/lib/inbox/logic";
import { igHideComment, igPrivateReply, igReplyComment, igSendDm } from "@/lib/social/instagram";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActionResult } from "@/lib/schemas";

/**
 * Bandeja: responder (nada se envía solo: cada respuesta la mando yo), estados, etiquetas y acciones (tarea, nota, pedido).
 * El hilo se comprueba siempre con la sesión (RLS); el token solo lo lee el servidor con la clave de servicio.
 */
const uuid = z.uuid();
const refresh = (id?: string) => { revalidatePath("/redes"); if (id) revalidatePath(`/redes/mensajes/${id}`); revalidatePath("/", "layout"); };

async function ownThread(id: string) {
  if (!uuid.safeParse(id).success) return null;
  const ctx = await getContext();
  const { data } = await ctx.supabase.from("social_threads").select("*").eq("id", id).eq("workspace_id", ctx.workspaceId).maybeSingle();
  return data ? { ctx, thread: data } : null;
}

async function accountToken(accountId: string) {
  const admin = createAdminClient();
  const { data } = await admin.from("social_accounts").select("external_id, access_token_enc, status, platform").eq("id", accountId).maybeSingle();
  if (!data || data.status === "expired") return null;
  return { igUserId: data.external_id, token: decryptSecret(data.access_token_enc), platform: data.platform as Platform };
}

type SendMode = "dm" | "public" | "private";

/** Envía de verdad un mensaje ya guardado como «enviando» y marca enviado o error. */
async function deliver(messageId: string): Promise<ActionResult> {
  const admin = createAdminClient();
  const { data: m } = await admin.from("social_messages").select("id, thread_id, body, send_mode").eq("id", messageId).maybeSingle();
  if (!m) return { ok: false, error: "Mensaje no encontrado" };
  const { data: t } = await admin.from("social_threads").select("id, account_id, kind, external_id, participant_id").eq("id", m.thread_id).maybeSingle();
  if (!t) return { ok: false, error: "Conversación no encontrada" };
  const acc = await accountToken(t.account_id);
  const fail = async (error: string) => { await admin.from("social_messages").update({ send_status: "error", error: error.slice(0, 500) }).eq("id", m.id); return { ok: false as const, error }; };
  if (!acc) return fail("La conexión con la red caducó: vuelve a conectarla en Redes.");
  try {
    let external = "";
    if (m.send_mode === "dm") external = await igSendDm(acc.token, acc.igUserId, t.participant_id!, m.body);
    else if (m.send_mode === "public") external = await igReplyComment(acc.token, t.external_id, m.body);
    else external = await igPrivateReply(acc.token, acc.igUserId, t.external_id, m.body);
    await admin.from("social_messages").update({ send_status: "enviado", error: null, ...(external ? { external_id: external } : {}) }).eq("id", m.id);
    await admin.from("social_threads").update({ status: "respondido", unread: false, last_message_at: new Date().toISOString(), preview: m.body.slice(0, 300) }).eq("id", t.id);
    return { ok: true };
  } catch (e) {
    return fail(e instanceof Error ? e.message.replace(/^Instagram: /, "Instagram dice: ") : "No se pudo enviar");
  }
}

/** Responder: «dm» (mensaje directo, dentro de 24 h), «public» (respuesta al comentario) o «private» (respuesta privada al comentario). */
export async function replyThread(threadId: string, text: string, mode: SendMode): Promise<ActionResult> {
  const body = z.string().trim().min(1, "Escribe la respuesta").max(1000, "Máximo 1000 caracteres").safeParse(text);
  if (!body.success) return { ok: false, error: body.error.issues[0].message };
  const own = await ownThread(threadId);
  if (!own) return { ok: false, error: "Conversación no encontrada" };
  const { ctx, thread } = own;
  const cap = CAPABILITIES[thread.platform as Platform];
  if (thread.kind === "mention") return { ok: false, error: "Las menciones se responden desde Instagram." };
  if (thread.kind === "dm" && mode !== "dm") return { ok: false, error: "Datos no válidos" };
  if (thread.kind === "comment" && mode === "dm") return { ok: false, error: "Datos no válidos" };
  if ((mode === "dm" && !cap.replyDm) || (mode === "public" && !cap.replyComment) || (mode === "private" && !cap.privateReply)) return { ok: false, error: "Esta red no deja responder desde aquí." };
  if (mode === "dm" && !replyWindow(thread.last_inbound_at).open) return { ok: false, error: "Pasaron 24 h desde su último mensaje: Instagram solo deja responder desde su app." };
  const { data: msg, error } = await ctx.supabase.from("social_messages").insert({
    workspace_id: ctx.workspaceId, user_id: ctx.userId, thread_id: thread.id, external_id: `local:${crypto.randomUUID()}`, direction: "out",
    body: body.data, send_status: "enviando", send_mode: mode, author_name: "Yo",
  }).select("id").single();
  if (error) return { ok: false, error: "No se pudo guardar la respuesta" };
  const r = await deliver(msg.id);
  refresh(thread.id);
  return r;
}

/** Reintentar un envío con error. */
export async function retrySend(messageId: string): Promise<ActionResult> {
  if (!uuid.safeParse(messageId).success) return { ok: false, error: "Datos no válidos" };
  const { supabase, workspaceId } = await getContext();
  const { data: m } = await supabase.from("social_messages").select("id, thread_id, send_status").eq("id", messageId).eq("workspace_id", workspaceId).maybeSingle();
  if (!m || m.send_status !== "error") return { ok: false, error: "No hay nada que reintentar" };
  await supabase.from("social_messages").update({ send_status: "enviando", error: null }).eq("id", m.id);
  const r = await deliver(m.id);
  refresh(m.thread_id);
  return r;
}

export async function setThreadStatus(threadId: string, status: "sin_responder" | "respondido" | "archivado"): Promise<ActionResult> {
  if (!["sin_responder", "respondido", "archivado"].includes(status)) return { ok: false, error: "Estado no válido" };
  const own = await ownThread(threadId);
  if (!own) return { ok: false, error: "Conversación no encontrada" };
  await own.ctx.supabase.from("social_threads").update({ status, unread: false }).eq("id", threadId).eq("workspace_id", own.ctx.workspaceId);
  refresh(threadId);
  return { ok: true };
}

export async function markThreadRead(threadId: string): Promise<void> {
  const own = await ownThread(threadId);
  if (own?.thread.unread) await own.ctx.supabase.from("social_threads").update({ unread: false }).eq("id", threadId).eq("workspace_id", own.ctx.workspaceId);
}

/** Etiquetas: las fijas (cliente, pedido, colaboración, spam) y las mías (texto corto). */
export async function setThreadLabels(threadId: string, labels: string[]): Promise<ActionResult> {
  const p = z.array(z.string().trim().toLowerCase().min(1).max(30)).max(10).safeParse(labels);
  if (!p.success) return { ok: false, error: "Etiquetas no válidas (máx. 10, 30 letras)" };
  const own = await ownThread(threadId);
  if (!own) return { ok: false, error: "Conversación no encontrada" };
  await own.ctx.supabase.from("social_threads").update({ labels: [...new Set(p.data)] }).eq("id", threadId).eq("workspace_id", own.ctx.workspaceId);
  refresh(threadId);
  return { ok: true };
}

/** Ocultar o volver a mostrar un comentario (Instagram). */
export async function hideComment(messageId: string, hide: boolean): Promise<ActionResult> {
  if (!uuid.safeParse(messageId).success) return { ok: false, error: "Datos no válidos" };
  const { supabase, workspaceId } = await getContext();
  const { data: m } = await supabase.from("social_messages").select("id, external_id, thread_id, social_threads!inner(account_id, kind, platform)").eq("id", messageId).eq("workspace_id", workspaceId).maybeSingle();
  const t = m?.social_threads as unknown as { account_id: string; kind: string; platform: string } | undefined;
  if (!m || !t || t.kind !== "comment" || !m.external_id || m.external_id.startsWith("local:")) return { ok: false, error: "Solo se pueden ocultar comentarios" };
  const acc = await accountToken(t.account_id);
  if (!acc) return { ok: false, error: "La conexión caducó: vuelve a conectarla" };
  try { await igHideComment(acc.token, m.external_id, hide); } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "No se pudo" }; }
  await supabase.from("social_messages").update({ hidden: hide }).eq("id", m.id);
  refresh(m.thread_id);
  return { ok: true };
}

/** Vincular a un cliente (nombre) o a un pedido. */
export async function linkThread(threadId: string, o: { customerName?: string | null; orderId?: string | null }): Promise<ActionResult> {
  const own = await ownThread(threadId);
  if (!own) return { ok: false, error: "Conversación no encontrada" };
  const patch: Record<string, unknown> = {};
  if (o.customerName !== undefined) patch.customer_name = o.customerName?.trim().slice(0, 200) || null;
  if (o.orderId !== undefined) {
    if (o.orderId && !uuid.safeParse(o.orderId).success) return { ok: false, error: "Pedido no válido" };
    patch.order_id = o.orderId;
  }
  const { error } = await own.ctx.supabase.from("social_threads").update(patch as never).eq("id", threadId).eq("workspace_id", own.ctx.workspaceId);
  if (error) return { ok: false, error: "No se pudo vincular (¿el pedido es de este espacio?)" };
  refresh(threadId);
  return { ok: true };
}

const who = (t: { participant_username: string | null; participant_name: string | null; customer_name: string | null }) => t.customer_name ?? (t.participant_username ? `@${t.participant_username}` : t.participant_name ?? "alguien");
const lastIn = async (threadId: string) => {
  const { supabase, workspaceId } = await getContext();
  const { data } = await supabase.from("social_messages").select("body").eq("thread_id", threadId).eq("workspace_id", workspaceId).eq("direction", "in").order("sent_at", { ascending: false }).limit(1).maybeSingle();
  return data?.body ?? "";
};

export async function threadToTask(threadId: string): Promise<ActionResult & { href?: string }> {
  const own = await ownThread(threadId);
  if (!own) return { ok: false, error: "Conversación no encontrada" };
  const { ctx, thread } = own;
  const { data: acc } = await ctx.supabase.from("social_accounts").select("business_id").eq("id", thread.account_id).maybeSingle();
  try {
    const c = await createTask(ctx, { title: `Responder a ${who(thread)}`.slice(0, 200), date: null, business: acc?.business_id ?? null, notes: `${(await lastIn(threadId)).slice(0, 1500)}\n\nDesde Redes: /redes/mensajes/${threadId}` });
    return { ok: true, href: c.href };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "No se pudo crear la tarea" }; }
}

export async function threadToNote(threadId: string): Promise<ActionResult & { href?: string }> {
  const own = await ownThread(threadId);
  if (!own) return { ok: false, error: "Conversación no encontrada" };
  const { ctx, thread } = own;
  const { data: msgs } = await ctx.supabase.from("social_messages").select("direction, author_name, body, sent_at").eq("thread_id", threadId).order("sent_at").limit(100);
  const body = (msgs ?? []).map((m) => `**${m.direction === "out" ? "Yo" : m.author_name ?? who(thread)}** (${m.sent_at.slice(0, 16).replace("T", " ")}): ${m.body}`).join("\n\n");
  try {
    const c = await createNote(ctx, { title: `Conversación con ${who(thread)}`.slice(0, 200), body: body.slice(0, 20000) });
    return { ok: true, href: c.href };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "No se pudo guardar la nota" }; }
}

/** «Crear pedido»: abre el alta de pedidos del negocio de la cuenta con el cliente rellenado. */
export async function threadOrderLink(threadId: string): Promise<ActionResult & { href?: string }> {
  const own = await ownThread(threadId);
  if (!own) return { ok: false, error: "Conversación no encontrada" };
  const { ctx, thread } = own;
  const { data: acc } = await ctx.supabase.from("social_accounts").select("business_id").eq("id", thread.account_id).maybeSingle();
  if (!acc?.business_id) return { ok: false, error: "Asigna primero un negocio a esta cuenta (en Redes)." };
  return { ok: true, href: `/negocios/${acc.business_id}/pedidos?crear=1&para=${encodeURIComponent(who(thread).replace(/^@/, ""))}&via=${encodeURIComponent(thread.platform === "tiktok" ? "TikTok" : "Instagram")}&hilo=${threadId}` };
}

// ---------------------------------------------------------------- respuestas guardadas
const replySchema = z.object({ id: uuid.optional(), title: z.string().trim().min(1, "Ponle un nombre").max(80), body: z.string().trim().min(1, "Escribe el texto").max(1000), businessId: uuid.nullable() });
export async function saveReply(input: z.input<typeof replySchema>): Promise<ActionResult> {
  const p = replySchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0].message };
  const { supabase, workspaceId, userId } = await getContext();
  const row = { title: p.data.title, body: p.data.body, business_id: p.data.businessId };
  const { error } = p.data.id
    ? await supabase.from("social_saved_replies").update(row).eq("id", p.data.id).eq("workspace_id", workspaceId)
    : await supabase.from("social_saved_replies").insert({ ...row, workspace_id: workspaceId, user_id: userId });
  if (error) return { ok: false, error: "No se pudo guardar" };
  refresh();
  return { ok: true };
}
export async function deleteReply(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "Datos no válidos" };
  const { supabase, workspaceId } = await getContext();
  await supabase.from("social_saved_replies").delete().eq("id", id).eq("workspace_id", workspaceId);
  refresh();
  return { ok: true };
}

/** «Sugerir respuesta» con IA: solo si está activado en Ajustes. No envía nada: rellena el cuadro para que lo revise y lo mande yo. */
export async function suggestReply(threadId: string): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const own = await ownThread(threadId);
  if (!own) return { ok: false, error: "Conversación no encontrada" };
  const { ctx, thread } = own;
  const { data: p } = await ctx.supabase.from("profiles").select("inbox_ai_suggest").eq("user_id", ctx.userId).maybeSingle();
  if (!p?.inbox_ai_suggest) return { ok: false, error: "Activa «Sugerir respuesta con IA» en Ajustes › Redes y mensajes para usar esto." };
  if (!hasGeminiKey()) return { ok: false, error: "La IA no está configurada." };
  const [{ data: msgs }, { data: acc }] = await Promise.all([
    ctx.supabase.from("social_messages").select("direction, body").eq("thread_id", threadId).order("sent_at", { ascending: false }).limit(12),
    ctx.supabase.from("social_accounts").select("username, business_id, businesses(name, description)").eq("id", thread.account_id).maybeSingle(),
  ]);
  const biz = acc?.businesses as unknown as { name?: string; description?: string } | null;
  const convo = [...(msgs ?? [])].reverse().map((m) => `${m.direction === "out" ? "Yo" : "Cliente"}: ${m.body}`).join("\n").slice(0, 6000);
  try {
    const ai = await getAiContext(geminiProvider(), getModelNames());
    // Cuenta como «chat» en el gasto de IA.
    const res = await runAi(ai, "chat", {
      model: ai.models.fast, maxOutputTokens: 300, temperature: 0.4,
      system: `Eres quien lleva la cuenta @${acc?.username ?? ""}${biz?.name ? ` del negocio «${biz.name}»${biz.description ? ` (${biz.description})` : ""}` : ""}. Escribe UNA respuesta breve, amable y natural en español de España a lo último que dice el cliente, como un ${thread.kind === "comment" ? "comentario público" : "mensaje directo"}. No inventes precios, plazos ni datos que no estén en la conversación: si faltan, pregunta o di que lo compruebas. Solo el texto de la respuesta.`,
      contents: [{ role: "user", parts: [{ text: convo || "(sin mensajes)" }] }],
    });
    return { ok: true, text: res.text.trim().slice(0, 1000) };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "No se pudo sugerir" }; }
}
