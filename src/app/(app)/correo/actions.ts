"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createNote, createTask } from "@/lib/ai/actors";
import { getContext } from "@/lib/context";
import { msAttachments, msMessage, type AttachmentInfo } from "@/lib/mail/graph";
import { mailHtmlToText, sanitizeMailHtml, textToHtml } from "@/lib/mail/sanitize";
import { accessTokenFor, syncDueMailAccounts } from "@/lib/mail/service";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAiContext, runAi } from "@/lib/ai/run";
import { geminiProvider, getModelNames, hasGeminiKey } from "@/lib/ai/gemini";
import type { ActionResult } from "@/lib/schemas";

const uuid = z.uuid();
const refresh = () => { revalidatePath("/correo"); revalidatePath("/"); revalidatePath("/ajustes"); };

/** Mensaje propio + token de su cuenta (el token solo se descifra en el servidor). */
async function ownMessage(id: string) {
  const { supabase, userId } = await getContext();
  const { data: m } = await supabase.from("mail_messages").select("id, graph_id, account_id, subject, from_name, from_address, web_link, received_at").eq("id", id).maybeSingle();
  if (!m) return null;
  const admin = createAdminClient();
  const { data: acc } = await admin.from("mail_accounts").select("id, refresh_token_enc, business_id, email").eq("id", m.account_id).eq("user_id", userId).maybeSingle();
  if (!acc) return null;
  return { m, acc, token: await accessTokenFor(admin, acc) };
}

export type OpenedMail = { html: string; from: string; to: string[]; cc: string[]; date: string; subject: string; webLink: string | null; attachments: AttachmentInfo[]; aiAllowed: boolean };

/** Abre un mensaje: el cuerpo se pide a Microsoft en este momento (no se guarda) y se limpia antes de mostrarlo. */
export async function openMail(id: string): Promise<{ ok: true; mail: OpenedMail } | { ok: false; error: string }> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "Mensaje no válido" };
  const r = await ownMessage(id);
  if (!r) return { ok: false, error: "Mensaje no encontrado" };
  if (!r.token) return { ok: false, error: "No hay acceso a la cuenta: vuelve a conectarla en Ajustes." };
  try {
    const [full, atts] = await Promise.all([msMessage(r.token, r.m.graph_id), msAttachments(r.token, r.m.graph_id).catch(() => [])]);
    const { supabase, userId } = await getContext();
    const { data: p } = await supabase.from("profiles").select("mail_ai_allowed").eq("user_id", userId).maybeSingle();
    return { ok: true, mail: {
      html: full.bodyIsHtml ? sanitizeMailHtml(full.bodyHtml) : textToHtml(full.bodyHtml),
      from: full.from ? `${full.from.name ?? ""} <${full.from.address ?? ""}>`.trim() : "", to: full.to, cc: full.cc, date: full.receivedDateTime,
      subject: full.subject ?? "(sin asunto)", webLink: full.webLink ?? r.m.web_link, attachments: atts.filter((a) => !a.isInline), aiAllowed: !!p?.mail_ai_allowed && hasGeminiKey(),
    } };
  } catch (e) {
    return { ok: false, error: e instanceof Error && /404/.test(e.message) ? "Ese correo ya no está en Outlook." : "No se pudo abrir el correo ahora." };
  }
}

/** «Crear tarea» desde un correo (para hoy, en el negocio de la cuenta). */
export async function mailToTask(id: string): Promise<ActionResult & { href?: string }> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "Mensaje no válido" };
  const r = await ownMessage(id);
  if (!r) return { ok: false, error: "Mensaje no encontrado" };
  const c = await getContext();
  try {
    const t = await createTask({ supabase: c.supabase, workspaceId: c.workspaceId, userId: c.userId, timezone: c.timezone }, {
      title: `Responder: ${r.m.subject ?? "(sin asunto)"}`.slice(0, 200), business: r.acc.business_id,
      notes: [`De: ${r.m.from_name ?? ""} <${r.m.from_address ?? ""}>`, r.m.web_link ? `Abrir en Outlook: ${r.m.web_link}` : ""].filter(Boolean).join("\n"),
    });
    refresh();
    return { ok: true, id: t.id, href: t.href };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "No se pudo crear la tarea" }; }
}

/** «Guardar como nota»: copia el texto del correo (sin imágenes ni adjuntos) en una nota. */
export async function mailToNote(id: string): Promise<ActionResult & { href?: string }> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "Mensaje no válido" };
  const r = await ownMessage(id);
  if (!r?.token) return { ok: false, error: "No se pudo leer el correo" };
  const c = await getContext();
  try {
    const full = await msMessage(r.token, r.m.graph_id);
    const text = full.bodyIsHtml ? mailHtmlToText(full.bodyHtml) : full.bodyHtml;
    const body = [`**De:** ${full.from?.name ?? ""} <${full.from?.address ?? ""}>  `, `**Fecha:** ${new Date(full.receivedDateTime).toLocaleString("es-ES", { timeZone: c.timezone })}`, full.webLink ? `[Abrir en Outlook](${full.webLink})` : "", "", text.slice(0, 45000)].join("\n");
    const n = await createNote({ supabase: c.supabase, workspaceId: c.workspaceId, userId: c.userId, timezone: c.timezone }, { title: (full.subject ?? "Correo").slice(0, 200), body, business: r.acc.business_id, tags: ["correo"] });
    refresh();
    return { ok: true, id: n.id, href: n.href };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "No se pudo crear la nota" }; }
}

/** Resumen con IA: SOLO si la persona lo activó en Ajustes (el texto del correo se envía a Google Gemini). */
export async function summarizeMail(id: string): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "Mensaje no válido" };
  const { supabase, userId } = await getContext();
  const { data: p } = await supabase.from("profiles").select("mail_ai_allowed").eq("user_id", userId).maybeSingle();
  if (!p?.mail_ai_allowed) return { ok: false, error: "Activa «Usar la IA con mis correos» en Ajustes para usar esto." };
  if (!hasGeminiKey()) return { ok: false, error: "La IA no está configurada." };
  const r = await ownMessage(id);
  if (!r?.token) return { ok: false, error: "No se pudo leer el correo" };
  try {
    const full = await msMessage(r.token, r.m.graph_id);
    const text = (full.bodyIsHtml ? mailHtmlToText(full.bodyHtml) : full.bodyHtml).slice(0, 12000);
    const ctx = await getAiContext(geminiProvider(), getModelNames());
    const res = await runAi(ctx, "mail", { model: ctx.models.fast, system: "Resume este correo en español de España en 2-4 frases y termina con «Qué hacer:» y la acción concreta (o «nada»). Sin inventar.", contents: [{ role: "user", parts: [{ text: `Asunto: ${full.subject ?? ""}\nDe: ${full.from?.address ?? ""}\n\n${text}` }] }], maxOutputTokens: 400 });
    return { ok: true, text: res.text.trim() };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "No se pudo resumir" }; }
}

// ------------------------------------------------------------------ cuentas y ajustes
export async function setMailAccountBusiness(accountId: string, businessId: string | null): Promise<ActionResult> {
  if (!uuid.safeParse(accountId).success || (businessId && !uuid.safeParse(businessId).success)) return { ok: false, error: "Datos no válidos" };
  const { supabase, userId } = await getContext();
  const { error } = await supabase.from("mail_accounts").update({ business_id: businessId }).eq("id", accountId).eq("user_id", userId);
  if (error) return { ok: false, error: "No se pudo guardar" };
  refresh();
  return { ok: true };
}

export async function setMailNotify(accountId: string, on: boolean): Promise<ActionResult> {
  if (!uuid.safeParse(accountId).success) return { ok: false, error: "Datos no válidos" };
  const { supabase, userId } = await getContext();
  const { error } = await supabase.from("mail_accounts").update({ notify_new: on }).eq("id", accountId).eq("user_id", userId);
  if (error) return { ok: false, error: "No se pudo guardar" };
  refresh();
  return { ok: true };
}

/** Desconectar: borra la cuenta, su token y las cabeceras guardadas. (Para quitar el permiso en Microsoft: account.live.com/consent/Manage.) */
export async function disconnectMailAccount(accountId: string): Promise<ActionResult> {
  if (!uuid.safeParse(accountId).success) return { ok: false, error: "Datos no válidos" };
  const { supabase, userId } = await getContext();
  const { error } = await supabase.from("mail_accounts").delete().eq("id", accountId).eq("user_id", userId);
  if (error) return { ok: false, error: "No se pudo desconectar" };
  refresh();
  return { ok: true };
}

export async function setMailAi(on: boolean): Promise<ActionResult> {
  const { supabase, userId } = await getContext();
  const { error } = await supabase.from("profiles").update({ mail_ai_allowed: !!on }).eq("user_id", userId);
  if (error) return { ok: false, error: "No se pudo guardar" };
  refresh();
  return { ok: true };
}

/** «Actualizar ahora» (también tirando hacia abajo en Correo). */
export async function syncMailNow(): Promise<ActionResult> {
  const { userId } = await getContext();
  await syncDueMailAccounts(createAdminClient(), { userId, staleMinutes: 0, limit: 5 });
  refresh();
  return { ok: true };
}
