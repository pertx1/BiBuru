/**
 * Bandeja unificada de redes: lógica pura (sin red ni base de datos), probada en tests.
 * - Capacidades por red (qué se puede hacer por API oficial con una app propia sin revisar).
 * - Ventana de 24 h de Instagram para responder mensajes directos.
 * - Lectura de los avisos (webhooks) de Meta y comprobación de su firma.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export type Platform = "instagram" | "tiktok";
export type ThreadKind = "dm" | "comment" | "mention";

/** Lo que permite cada red. Añadir otra red (Facebook, comentarios de YouTube, WhatsApp Business) = otro adaptador con sus capacidades. */
export type Capabilities = {
  dms: boolean; comments: boolean; mentions: boolean;
  replyDm: boolean; replyComment: boolean; hideComment: boolean; privateReply: boolean; realtime: boolean;
  /** Si algo no se puede por API: dónde abrirlo en la app de la red. */
  openDmsUrl: string | null; note: string | null;
};

export const CAPABILITIES: Record<Platform, Capabilities> = {
  instagram: {
    dms: true, comments: true, mentions: true, replyDm: true, replyComment: true, hideComment: true, privateReply: true, realtime: true,
    openDmsUrl: "https://www.instagram.com/direct/inbox/", note: null,
  },
  tiktok: {
    dms: false, comments: false, mentions: false, replyDm: false, replyComment: false, hideComment: false, privateReply: false, realtime: false,
    openDmsUrl: "https://www.tiktok.com/messages",
    note: "TikTok no tiene API pública para leer o responder comentarios ni mensajes directos (solo para anuncios o para investigadores). Ábrelos en la app de TikTok.",
  },
};

export const LABELS = ["cliente", "pedido", "colaboración", "spam"] as const;
export const STATUS_LABEL = { sin_responder: "Sin responder", respondido: "Respondido", archivado: "Archivado" } as const;
export const KIND_LABEL: Record<ThreadKind, string> = { dm: "Mensaje", comment: "Comentario", mention: "Mención" };

/** Instagram deja responder a un mensaje directo hasta 24 h después del último mensaje de la persona. */
export function replyWindow(lastInboundAt: string | null, now = new Date()): { open: boolean; hoursLeft: number; label: string } {
  if (!lastInboundAt) return { open: false, hoursLeft: 0, label: "Esperando a que te escriban" };
  const left = 24 * 3600_000 - (now.getTime() - new Date(lastInboundAt).getTime());
  if (left <= 0) return { open: false, hoursLeft: 0, label: "Pasaron 24 h: responde desde Instagram" };
  const h = Math.floor(left / 3600_000), m = Math.floor((left % 3600_000) / 60000);
  return { open: true, hoursLeft: left / 3600_000, label: h > 0 ? `Quedan ${h} h ${m} min para responder` : `Quedan ${m} min para responder` };
}

/** Firma de Meta: cabecera X-Hub-Signature-256 = "sha256=" + HMAC-SHA256(clave secreta de la app, cuerpo exacto). */
export function validMetaSignature(rawBody: string, header: string | null, appSecret: string): boolean {
  if (!header?.startsWith("sha256=") || !appSecret) return false;
  const expected = Buffer.from(createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex"));
  const given = Buffer.from(header.slice(7));
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export type InboxEvent =
  | { type: "message"; accountExternalId: string; participantId: string; mid: string; text: string; attachments: { type: string; url: string }[]; outbound: boolean; at: string }
  | { type: "message_deleted"; accountExternalId: string; mid: string }
  | { type: "comment"; accountExternalId: string; commentId: string; parentId: string | null; mediaId: string | null; text: string; fromId: string | null; fromUsername: string | null; at: string }
  | { type: "mention"; accountExternalId: string; commentId: string | null; mediaId: string | null; at: string };

type Obj = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" || typeof v === "number" ? String(v) : null);

/** Convierte un aviso de Meta (objeto «instagram» o «page») en eventos sencillos. Lo que no se entiende se ignora. */
export function parseMetaWebhook(body: unknown, now = new Date()): InboxEvent[] {
  const b = body as Obj | null;
  if (!b || (b.object !== "instagram" && b.object !== "page") || !Array.isArray(b.entry)) return [];
  const out: InboxEvent[] = [];
  for (const entry of b.entry as Obj[]) {
    const acc = str(entry.id);
    if (!acc) continue;
    for (const ev of (Array.isArray(entry.messaging) ? entry.messaging : []) as Obj[]) {
      const msg = ev.message as Obj | undefined;
      const sender = str((ev.sender as Obj | undefined)?.id), recipient = str((ev.recipient as Obj | undefined)?.id);
      if (!msg || !sender || !recipient) continue;
      const mid = str(msg.mid);
      if (!mid) continue;
      if (msg.is_deleted) { out.push({ type: "message_deleted", accountExternalId: acc, mid }); continue; }
      const outbound = msg.is_echo === true || sender === acc;
      const atts = (Array.isArray(msg.attachments) ? msg.attachments : []) as Obj[];
      out.push({
        type: "message", accountExternalId: acc, participantId: outbound ? recipient : sender, mid, text: (str(msg.text) ?? "").slice(0, 5000), outbound,
        attachments: atts.map((a) => ({ type: str(a.type) ?? "file", url: str((a.payload as Obj | undefined)?.url) ?? "" })).filter((a) => a.url.startsWith("https://")).slice(0, 10),
        at: typeof ev.timestamp === "number" ? new Date(ev.timestamp).toISOString() : now.toISOString(),
      });
    }
    for (const ch of (Array.isArray(entry.changes) ? entry.changes : []) as Obj[]) {
      const v = (ch.value ?? {}) as Obj;
      if (ch.field === "comments" || ch.field === "live_comments") {
        const id = str(v.id);
        if (!id) continue;
        const from = (v.from ?? {}) as Obj;
        out.push({
          type: "comment", accountExternalId: acc, commentId: id, parentId: str(v.parent_id), mediaId: str((v.media as Obj | undefined)?.id),
          text: (str(v.text) ?? "").slice(0, 5000), fromId: str(from.id), fromUsername: str(from.username), at: now.toISOString(),
        });
      } else if (ch.field === "mentions") {
        out.push({ type: "mention", accountExternalId: acc, commentId: str(v.comment_id), mediaId: str(v.media_id), at: now.toISOString() });
      }
    }
  }
  return out;
}

export type InboxFilters = { red?: Platform; cuenta?: string; tipo?: ThreadKind; estado?: keyof typeof STATUS_LABEL | "todos"; q?: string; etiqueta?: string };

/** Filtros de la URL (validados: lo desconocido se ignora). Por defecto: sin responder. */
export function parseInboxFilters(sp: Record<string, string | undefined>): InboxFilters {
  const f: InboxFilters = {};
  if (sp.red === "instagram" || sp.red === "tiktok") f.red = sp.red;
  if (sp.cuenta && /^[0-9a-f-]{36}$/i.test(sp.cuenta)) f.cuenta = sp.cuenta;
  if (sp.tipo === "dm" || sp.tipo === "comment" || sp.tipo === "mention") f.tipo = sp.tipo;
  f.estado = sp.estado === "respondido" || sp.estado === "archivado" || sp.estado === "todos" ? sp.estado : "sin_responder";
  if (sp.q?.trim()) f.q = sp.q.trim().slice(0, 100);
  if (sp.etiqueta?.trim()) f.etiqueta = sp.etiqueta.trim().toLowerCase().slice(0, 30);
  return f;
}

/** Estado del hilo tras un mensaje nuevo: si escribe la persona, «sin responder» (un archivado se reabre); si respondo yo, «respondido». */
export function nextStatus(outbound: boolean): "sin_responder" | "respondido" {
  return outbound ? "respondido" : "sin_responder";
}
