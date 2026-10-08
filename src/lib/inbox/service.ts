import "server-only";
import { decryptSecret } from "@/lib/favorites/crypto";
import { nowLocal } from "@/lib/dates";
import { inQuietHours } from "@/lib/notifications/planning";
import { webPushSender, type PushSub } from "@/lib/notifications/push";
import { hasInboxScopes, igComments, igConversations, IgError } from "@/lib/social/instagram";
import type { AdminClient } from "@/lib/supabase/admin";
import { CAPABILITIES, nextStatus, type InboxEvent, type Platform, type ThreadKind } from "./logic";

/**
 * Bandeja: guarda en la base lo que llega por aviso (webhook) o por la sincronización periódica. Funciona con la clave de
 * servicio (no hay sesión de usuario). Idempotente: un mensaje con el mismo id externo no se guarda dos veces.
 */
export type InboxAccount = { id: string; workspace_id: string; user_id: string; platform: string; external_id: string; username: string | null; business_id: string | null; scopes: string | null; access_token_enc: string };
const ACC = "id, workspace_id, user_id, platform, external_id, username, business_id, scopes, access_token_enc";

type ThreadKey = { kind: ThreadKind; externalId: string };
type ThreadInfo = Partial<{ participantId: string | null; participantName: string | null; participantUsername: string | null; mediaExternalId: string | null; mediaPermalink: string | null; mediaCaption: string | null; mediaThumbnail: string | null }>;
type NewMessage = { externalId: string; outbound: boolean; author: string | null; body: string; at: string; attachments?: { type: string; url: string }[] };

/** Hilo (lo crea si no existe) y mensajes nuevos. Devuelve los mensajes recibidos que eran nuevos (para avisar). */
export async function storeMessages(admin: AdminClient, acc: InboxAccount, key: ThreadKey, info: ThreadInfo, msgs: NewMessage[]): Promise<NewMessage[]> {
  if (!msgs.length) return [];
  const { data: found } = await admin.from("social_threads").select("id, status, last_message_at, last_inbound_at").eq("account_id", acc.id).eq("kind", key.kind).eq("external_id", key.externalId).maybeSingle();
  let threadId = found?.id;
  if (!threadId) {
    const { data: created, error } = await admin.from("social_threads").insert({
      workspace_id: acc.workspace_id, user_id: acc.user_id, account_id: acc.id, platform: acc.platform, kind: key.kind, external_id: key.externalId,
      participant_id: info.participantId ?? null, participant_name: info.participantName ?? null, participant_username: info.participantUsername ?? null,
      media_external_id: info.mediaExternalId ?? null, media_permalink: info.mediaPermalink?.startsWith("https://") ? info.mediaPermalink : null,
      media_caption: info.mediaCaption?.slice(0, 500) ?? null, media_thumbnail: info.mediaThumbnail?.startsWith("https://") ? info.mediaThumbnail.slice(0, 4000) : null,
    }).select("id").single();
    if (error) {
      // Otra pasada lo creó a la vez.
      const { data: again } = await admin.from("social_threads").select("id").eq("account_id", acc.id).eq("kind", key.kind).eq("external_id", key.externalId).maybeSingle();
      if (!again) throw new Error(error.message);
      threadId = again.id;
    } else threadId = created.id;
  }
  const { data: inserted } = await admin.from("social_messages").upsert(msgs.map((m) => ({
    workspace_id: acc.workspace_id, user_id: acc.user_id, thread_id: threadId!, external_id: m.externalId, direction: m.outbound ? "out" : "in",
    author_name: m.author?.slice(0, 200) ?? null, body: m.body.slice(0, 5000), sent_at: m.at, attachments: (m.attachments ?? []) as never,
    send_status: m.outbound ? "enviado" : null,
  })), { onConflict: "thread_id,external_id", ignoreDuplicates: true }).select("external_id");
  const fresh = new Set((inserted ?? []).map((r) => r.external_id));
  const news = msgs.filter((m) => fresh.has(m.externalId));
  if (!news.length) return [];
  const last = [...msgs].sort((a, b) => a.at.localeCompare(b.at)).at(-1)!;
  const lastIn = msgs.filter((m) => !m.outbound).map((m) => m.at).sort().at(-1);
  const newestNew = [...news].sort((a, b) => a.at.localeCompare(b.at)).at(-1)!;
  // Solo cambia el estado si lo nuevo es lo último del hilo.
  const statusPatch = !found?.last_message_at || newestNew.at >= found.last_message_at ? { status: nextStatus(newestNew.outbound), unread: !newestNew.outbound } : {};
  await admin.from("social_threads").update({
    preview: (last.body || (last.attachments?.length ? "📎 Adjunto" : "")).slice(0, 300), last_message_at: last.at > (found?.last_message_at ?? "") ? last.at : found!.last_message_at,
    ...(lastIn && lastIn > (found?.last_inbound_at ?? "") ? { last_inbound_at: lastIn } : {}),
    ...(info.participantName || info.participantUsername ? { participant_name: info.participantName ?? undefined, participant_username: info.participantUsername ?? undefined } : {}),
    ...statusPatch,
  } as never).eq("id", threadId!);
  return news.filter((m) => !m.outbound);
}

/** Avisos (webhooks) de Meta ya interpretados → base de datos + notificación push. */
export async function ingestEvents(admin: AdminClient, events: InboxEvent[]): Promise<number> {
  let stored = 0;
  const ids = [...new Set(events.map((e) => e.accountExternalId))];
  if (!ids.length) return 0;
  const { data: accounts } = await admin.from("social_accounts").select(ACC).eq("platform", "instagram").in("external_id", ids);
  const fresh = new Map<string, { acc: InboxAccount; n: number; who: string | null; threadId?: string }>();
  for (const ev of events) {
    for (const acc of (accounts ?? []).filter((a) => a.external_id === ev.accountExternalId)) {
      try {
        if (ev.type === "message_deleted") {
          // Meta avisa de que la persona borró el mensaje: se borra también aquí.
          const { data: threads } = await admin.from("social_threads").select("id").eq("account_id", acc.id).eq("kind", "dm");
          if (threads?.length) await admin.from("social_messages").delete().in("thread_id", threads.map((t) => t.id)).eq("external_id", ev.mid);
          continue;
        }
        let news: NewMessage[] = [];
        if (ev.type === "message") {
          news = await storeMessages(admin, acc, { kind: "dm", externalId: `dm:${ev.participantId}` }, { participantId: ev.participantId },
            [{ externalId: ev.mid, outbound: ev.outbound, author: ev.outbound ? acc.username : null, body: ev.text, at: ev.at, attachments: ev.attachments }]);
        } else if (ev.type === "comment") {
          const outbound = ev.fromId === acc.external_id;
          news = await storeMessages(admin, acc, { kind: "comment", externalId: ev.parentId ?? ev.commentId },
            ev.parentId ? {} : { participantId: ev.fromId, participantUsername: ev.fromUsername, mediaExternalId: ev.mediaId },
            [{ externalId: ev.commentId, outbound, author: ev.fromUsername, body: ev.text, at: ev.at }]);
        } else if (ev.type === "mention") {
          const key = ev.commentId ?? ev.mediaId ?? `${ev.at}`;
          news = await storeMessages(admin, acc, { kind: "mention", externalId: key }, { mediaExternalId: ev.mediaId },
            [{ externalId: key, outbound: false, author: null, body: "Te han mencionado en Instagram", at: ev.at }]);
        }
        stored += news.length;
        if (news.length) {
          const cur = fresh.get(acc.id) ?? { acc, n: 0, who: null };
          cur.n += news.length; cur.who = news.at(-1)?.author ?? cur.who;
          fresh.set(acc.id, cur);
        }
      } catch (e) { console.error("[inbox] evento:", e instanceof Error ? e.message : e); }
    }
  }
  for (const f of fresh.values()) await notifyNew(admin, f.acc, f.n, f.who).catch(() => null);
  return stored;
}

/** Push «2 mensajes nuevos · Akerra» al dueño de la cuenta (respeta horas de silencio y el ajuste de avisos de mensajes). */
export async function notifyNew(admin: AdminClient, acc: InboxAccount, n: number, who: string | null, now = new Date()) {
  const { data: p } = await admin.from("profiles").select("timezone, quiet_hours_start, quiet_hours_end, inbox_push_enabled").eq("user_id", acc.user_id).maybeSingle();
  if (!p || p.inbox_push_enabled === false) return;
  if (inQuietHours(nowLocal(now, p.timezone).time, String(p.quiet_hours_start).slice(0, 5), String(p.quiet_hours_end).slice(0, 5))) return;
  const { data: subs } = await admin.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", acc.user_id);
  if (!subs?.length) return;
  const { data: biz } = acc.business_id ? await admin.from("businesses").select("name").eq("id", acc.business_id).maybeSingle() : { data: null };
  // Un aviso por cuenta y minuto como mucho.
  const key = `inbox:${acc.id}:${now.toISOString().slice(0, 16)}`;
  const { data: claimed } = await admin.from("notification_log").upsert({ user_id: acc.user_id, dedupe_key: key, kind: "inbox" }, { onConflict: "user_id,dedupe_key", ignoreDuplicates: true }).select("id");
  if (!claimed?.length) return;
  let send;
  try { send = webPushSender(); } catch { return; }
  const payload = { title: `${n === 1 ? "1 mensaje nuevo" : `${n} mensajes nuevos`}${biz?.name ? ` · ${biz.name}` : ""}`, body: `${who ? `@${who}` : "Instagram"} · @${acc.username ?? "tu cuenta"}`, url: "/redes?vista=bandeja", kind: "inbox", tag: `inbox:${acc.id}` };
  const gone: string[] = [];
  for (const s of subs as PushSub[]) { const r = await send(s, payload); if (!r.ok && r.gone) gone.push(s.id); }
  if (gone.length) await admin.from("push_subscriptions").delete().in("id", gone);
}

/**
 * Sincronización de la bandeja de una cuenta (cada hora y con «Actualizar todo»): conversaciones y comentarios de las
 * publicaciones recientes. Si la conexión no tiene permisos de mensajes, no hace nada (la pantalla pide «Activar mensajes»).
 */
export async function syncInboxAccount(admin: AdminClient, accId: string, token: string): Promise<{ stored: number; skipped?: string }> {
  const { data: acc } = await admin.from("social_accounts").select(ACC).eq("id", accId).maybeSingle();
  if (!acc) return { stored: 0, skipped: "no existe" };
  if (!CAPABILITIES[acc.platform as Platform]?.dms) return { stored: 0, skipped: "la red no lo permite" };
  if (!hasInboxScopes(acc.scopes)) return { stored: 0, skipped: "sin permisos de mensajes" };
  // La primera vez se trae lo que ya había: se guarda, pero no se avisa (no son mensajes nuevos).
  const { data: prev } = await admin.from("social_accounts").select("inbox_synced_at").eq("id", acc.id).maybeSingle();
  const firstTime = !prev?.inbox_synced_at;
  let stored = 0, newCount = 0, who: string | null = null;
  const convs = await igConversations(token, acc.external_id).catch((e) => { if (e instanceof IgError && !e.retryable) return []; throw e; });
  for (const c of convs) {
    if (!c.participant) continue;
    const news = await storeMessages(admin, acc, { kind: "dm", externalId: `dm:${c.participant.id}` }, { participantId: c.participant.id, participantUsername: c.participant.username },
      c.messages.map((m) => ({ externalId: m.id, outbound: m.fromId === acc.external_id || (m.fromId !== c.participant!.id && !!m.fromId), author: m.fromUsername, body: m.text, at: m.at, attachments: m.attachments })));
    stored += news.length; newCount += news.length; if (news.length) who = news.at(-1)?.author ?? who;
  }
  // Comentarios de las publicaciones de los últimos 30 días que tengan alguno.
  const since = new Date(Date.now() - 30 * 86400_000).toISOString();
  const { data: media } = await admin.from("social_media").select("external_id, permalink, caption, thumbnail_url, comments").eq("account_id", acc.id).gte("posted_at", since).gt("comments", 0).order("posted_at", { ascending: false }).limit(10);
  for (const m of media ?? []) {
    const comments = await igComments(token, m.external_id).catch(() => []);
    for (const c of comments) {
      const msgs = [c, ...c.replies].map((r) => ({ externalId: r.id, outbound: r.fromId === acc.external_id || r.username === acc.username, author: r.username, body: r.text, at: r.at }));
      const news = await storeMessages(admin, acc, { kind: "comment", externalId: c.id },
        { participantId: c.fromId, participantUsername: c.username, mediaExternalId: m.external_id, mediaPermalink: m.permalink, mediaCaption: m.caption, mediaThumbnail: m.thumbnail_url }, msgs);
      stored += news.length;
      if (c.hidden) await admin.from("social_messages").update({ hidden: true }).eq("external_id", c.id).eq("workspace_id", acc.workspace_id);
    }
  }
  await admin.from("social_accounts").update({ inbox_synced_at: new Date().toISOString() }).eq("id", acc.id);
  if (newCount && !firstTime) await notifyNew(admin, acc, newCount, who).catch(() => null);
  return { stored };
}

export const decryptToken = (enc: string) => decryptSecret(enc);
