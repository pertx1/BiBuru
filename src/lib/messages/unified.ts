/**
 * Mensajes de un negocio en una sola lista: correo de sus cuentas de Outlook y mensajes/comentarios de sus cuentas de
 * Instagram y TikTok. Lógica pura (filtros de la URL, estado del correo y mezcla por fecha) con tests.
 */
export type Channel = "correo" | "instagram" | "tiktok";
export type MsgStatus = "sin_responder" | "respondido" | "archivado";
export const CHANNEL_LABEL: Record<Channel, string> = { correo: "Correo", instagram: "Instagram", tiktok: "TikTok" };
export const MSG_STATUS_LABEL: Record<MsgStatus | "todos", string> = { sin_responder: "Sin responder", respondido: "Respondido", archivado: "Archivado", todos: "Todos" };

export type UnifiedFilters = { canal?: Channel; estado: MsgStatus | "todos"; q?: string };

export function parseUnifiedFilters(sp: Record<string, string | undefined>): UnifiedFilters {
  const canal = sp.canal === "correo" || sp.canal === "instagram" || sp.canal === "tiktok" ? sp.canal : undefined;
  const estado = sp.estado === "respondido" || sp.estado === "archivado" || sp.estado === "todos" ? sp.estado : "sin_responder";
  const q = sp.q?.trim().slice(0, 100) || undefined;
  return { canal, estado, q };
}

/**
 * Estado de un correo en BiBuru: archivado/respondido si lo marcaste; si no, «sin responder» mientras no esté leído.
 * Un correo leído sin marcar queda «leído» (null): sale en «Todos», no en «Sin responder».
 */
export function mailStatus(m: { triage: string | null; is_read: boolean }): MsgStatus | null {
  if (m.triage === "archivado" || m.triage === "respondido") return m.triage;
  return m.is_read ? null : "sin_responder";
}

export type UnifiedItem = {
  key: string;            // «correo:<id>» o «red:<id>»
  id: string;
  channel: Channel;
  kind: string;           // Correo, Mensaje, Comentario, Mención
  account: string;        // correo o @usuario de la cuenta
  person: string;
  preview: string;
  at: string;             // ISO
  status: MsgStatus | null;
  href: string;           // dónde se abre (y se responde)
  externalUrl: string | null;  // Outlook / Instagram / TikTok
};

/** ¿Encaja con el estado y la búsqueda? (el canal se filtra antes, al pedir los datos) */
export function matches(i: UnifiedItem, f: UnifiedFilters): boolean {
  if (f.estado !== "todos" && i.status !== f.estado) return false;
  if (f.q) {
    const q = f.q.toLocaleLowerCase("es");
    if (![i.person, i.preview, i.account].some((x) => x.toLocaleLowerCase("es").includes(q))) return false;
  }
  return true;
}

/** Une y ordena de lo más reciente a lo más antiguo. */
export function mergeItems(lists: UnifiedItem[][], f: UnifiedFilters, limit = 200): UnifiedItem[] {
  return lists.flat().filter((i) => matches(i, f)).sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}

/** «Crear pedido» con el cliente rellenado (alta de Pedidos del negocio). */
export const orderHref = (businessId: string, person: string, channel: Channel) =>
  `/negocios/${businessId}/pedidos?crear=1&para=${encodeURIComponent(person.slice(0, 120))}&via=${encodeURIComponent(CHANNEL_LABEL[channel])}`;
