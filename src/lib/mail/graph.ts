/**
 * Microsoft Graph (solo lectura de correo). OAuth 2.0 con código de autorización en el punto `common`
 * (cuentas personales de Outlook/Hotmail y de empresa). Permisos: offline_access, User.Read y Mail.Read.
 * Documentación: learn.microsoft.com/graph/auth-v2-user y learn.microsoft.com/graph/delta-query-messages
 */
type Fetch = typeof fetch;

export const MS_SCOPES = ["offline_access", "User.Read", "Mail.Read"];
const AUTHORITY = "https://login.microsoftonline.com/common/oauth2/v2.0";
export const GRAPH = "https://graph.microsoft.com/v1.0";

export class GraphError extends Error {
  constructor(message: string, readonly status?: number, readonly revoked = false) { super(message); }
}

export function microsoftConfig() {
  const clientId = process.env.MICROSOFT_CLIENT_ID?.trim(), clientSecret = process.env.MICROSOFT_CLIENT_SECRET?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}
export const msRedirectUri = (origin: string) => process.env.MICROSOFT_REDIRECT_URI?.trim() || `${origin}/api/outlook/callback`;

export function msAuthUrl(o: { clientId: string; redirectUri: string; state: string }) {
  const p = new URLSearchParams({ client_id: o.clientId, response_type: "code", redirect_uri: o.redirectUri, response_mode: "query", scope: MS_SCOPES.join(" "), state: o.state, prompt: "select_account" });
  return `${AUTHORITY}/authorize?${p}`;
}

async function token(body: Record<string, string>, f: Fetch): Promise<{ accessToken: string; refreshToken: string | null; scope: string }> {
  const cfg = microsoftConfig();
  if (!cfg) throw new GraphError("Falta MICROSOFT_CLIENT_ID o MICROSOFT_CLIENT_SECRET");
  const res = await f(`${AUTHORITY}/token`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, signal: AbortSignal.timeout(15000),
    body: new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret, scope: MS_SCOPES.join(" "), ...body }),
  });
  const j = (await res.json().catch(() => ({}))) as Record<string, string>;
  if (!res.ok || !j.access_token) {
    const revoked = j.error === "invalid_grant" || j.error === "interaction_required";
    throw new GraphError(revoked ? "Microsoft ha retirado el acceso: vuelve a conectar la cuenta." : `Microsoft: ${j.error_description?.slice(0, 200) ?? res.status}`, res.status, revoked);
  }
  return { accessToken: j.access_token, refreshToken: j.refresh_token ?? null, scope: j.scope ?? "" };
}

export const exchangeMsCode = (code: string, redirectUri: string, f: Fetch = fetch) => token({ grant_type: "authorization_code", code, redirect_uri: redirectUri }, f);
/** Microsoft puede devolver un refresh token nuevo: hay que guardarlo (el anterior deja de valer con el tiempo). */
export const refreshMsToken = (refreshToken: string, f: Fetch = fetch) => token({ grant_type: "refresh_token", refresh_token: refreshToken }, f);

async function get<T>(accessToken: string, url: string, f: Fetch, headers: Record<string, string> = {}): Promise<T> {
  if (!url.startsWith(GRAPH)) throw new GraphError("Dirección de Graph no válida"); // los enlaces de paginación vienen de Microsoft
  const res = await f(url, { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json", ...headers }, signal: AbortSignal.timeout(20000) });
  if (res.status === 401) throw new GraphError("Sesión de Microsoft caducada", 401, true);
  if (res.status === 410) throw new GraphError("El enlace de sincronización caducó", 410);
  if (!res.ok) throw new GraphError(`Microsoft Graph respondió ${res.status}`, res.status);
  return (await res.json()) as T;
}

export async function msMe(accessToken: string, f: Fetch = fetch) {
  const j = await get<{ displayName?: string; mail?: string | null; userPrincipalName?: string }>(accessToken, `${GRAPH}/me?$select=displayName,mail,userPrincipalName`, f);
  return { name: j.displayName ?? null, email: (j.mail || j.userPrincipalName || "").toLowerCase() };
}

export type GraphMessage = {
  id: string; subject?: string | null; bodyPreview?: string | null; receivedDateTime?: string; isRead?: boolean; hasAttachments?: boolean; webLink?: string;
  from?: { emailAddress?: { name?: string; address?: string } }; "@removed"?: { reason: string };
};
export const HEADER_FIELDS = "subject,from,receivedDateTime,bodyPreview,isRead,hasAttachments,webLink";

/** Primera petición del delta de la bandeja de entrada: solo los últimos `days` días. */
export function initialDeltaUrl(now: Date, days = 30) {
  const since = new Date(now.getTime() - days * 86400_000).toISOString().replace(/\.\d{3}Z$/, "Z");
  return `${GRAPH}/me/mailFolders/inbox/messages/delta?$select=${HEADER_FIELDS}&$filter=${encodeURIComponent(`receivedDateTime ge ${since}`)}`;
}

/**
 * Una pasada incremental: sigue los `@odata.nextLink` hasta `maxPages` y devuelve los cambios y el enlace para la próxima vez
 * (el `deltaLink` si se terminó, o el `nextLink` pendiente si quedaba más).
 */
export async function deltaPass(accessToken: string, startUrl: string, f: Fetch = fetch, maxPages = 5) {
  const changed: GraphMessage[] = [], removed: string[] = [];
  let url: string | undefined = startUrl, next: string | null = null;
  for (let i = 0; i < maxPages && url; i++) {
    const j: { value: GraphMessage[]; "@odata.nextLink"?: string; "@odata.deltaLink"?: string } = await get(accessToken, url, f, { Prefer: "odata.maxpagesize=50" });
    for (const m of j.value ?? []) { if (m["@removed"]) removed.push(m.id); else changed.push(m); }
    if (j["@odata.deltaLink"]) { next = j["@odata.deltaLink"]; url = undefined; }
    else { url = j["@odata.nextLink"]; next = url ?? null; }
  }
  return { changed, removed, next };
}

export type FullMessage = {
  subject: string | null; from: { name?: string; address?: string } | null; to: string[]; cc: string[]; receivedDateTime: string;
  bodyHtml: string; bodyIsHtml: boolean; webLink: string | null; hasAttachments: boolean;
};

/** Cuerpo de un mensaje (se pide al abrirlo; no se guarda). */
export async function msMessage(accessToken: string, graphId: string, f: Fetch = fetch): Promise<FullMessage> {
  const j = await get<{ subject?: string; from?: { emailAddress?: { name?: string; address?: string } }; toRecipients?: { emailAddress?: { address?: string } }[]; ccRecipients?: { emailAddress?: { address?: string } }[]; receivedDateTime: string; body?: { contentType?: string; content?: string }; webLink?: string; hasAttachments?: boolean }>(
    accessToken, `${GRAPH}/me/messages/${encodeURIComponent(graphId)}?$select=subject,from,toRecipients,ccRecipients,receivedDateTime,body,webLink,hasAttachments`, f, { Prefer: 'outlook.body-content-type="html"' });
  const addr = (xs?: { emailAddress?: { address?: string } }[]) => (xs ?? []).map((x) => x.emailAddress?.address ?? "").filter(Boolean);
  return {
    subject: j.subject ?? null, from: j.from?.emailAddress ?? null, to: addr(j.toRecipients), cc: addr(j.ccRecipients), receivedDateTime: j.receivedDateTime,
    bodyHtml: j.body?.content ?? "", bodyIsHtml: (j.body?.contentType ?? "html").toLowerCase() === "html", webLink: j.webLink ?? null, hasAttachments: !!j.hasAttachments,
  };
}

export type AttachmentInfo = { id: string; name: string; contentType: string; size: number; isInline: boolean };
export async function msAttachments(accessToken: string, graphId: string, f: Fetch = fetch): Promise<AttachmentInfo[]> {
  const j = await get<{ value: (AttachmentInfo & { "@odata.type"?: string })[] }>(accessToken, `${GRAPH}/me/messages/${encodeURIComponent(graphId)}/attachments?$select=id,name,contentType,size,isInline`, f);
  // Solo archivos (no elementos de Outlook adjuntos ni referencias a la nube).
  return (j.value ?? []).filter((a) => !a["@odata.type"] || a["@odata.type"] === "#microsoft.graph.fileAttachment").map(({ id, name, contentType, size, isInline }) => ({ id, name, contentType, size, isInline }));
}

/** Descarga un adjunto (bajo demanda, al pulsarlo). */
export async function msAttachmentBytes(accessToken: string, graphId: string, attachmentId: string, f: Fetch = fetch): Promise<Response> {
  const res = await f(`${GRAPH}/me/messages/${encodeURIComponent(graphId)}/attachments/${encodeURIComponent(attachmentId)}/$value`, { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new GraphError(`No se pudo descargar el adjunto (${res.status})`, res.status);
  return res;
}
