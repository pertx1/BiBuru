import { UnassignedAccounts } from "@/components/account/unassigned-accounts";
import { RefreshAll } from "@/components/social/refresh-all";
import { hasInboxScopes } from "@/lib/social/instagram";

type Acc = { id: string; username: string | null; scopes: string | null; status: string; last_sync_at: string | null; sync_error: string | null; inbox_synced_at: string | null };
const CONNECT = "/api/instagram/connect?mensajes=1";
const box = "flex flex-col gap-2 rounded-xl bg-surface p-4 text-sm";
const btn = "inline-flex min-h-11 items-center self-start rounded-full bg-accent px-4 font-semibold text-accent-foreground md:min-h-9";

/**
 * Por qué no salen mensajes de Instagram en este negocio, y el botón para arreglarlo: sin conectar, sin asignar a este negocio,
 * sin el permiso de mensajes, conexión caducada o aún sin leer.
 */
export function InstagramStatus({ businessName, accounts, unassigned, businesses, hasItems }: {
  businessName: string; accounts: Acc[]; unassigned: { id: string; username: string | null }[];
  businesses: { id: string; name: string }[]; hasItems: boolean;
}) {
  const ig = accounts;
  if (!ig.length && unassigned.length) {
    return (
      <div className={box}>
        <p><strong>Tu Instagram no está asignado a {businessName}.</strong> Elige su negocio aquí y sus mensajes saldrán en esta pestaña.</p>
        <UnassignedAccounts accounts={unassigned.map((a) => ({ id: a.id, kind: "instagram" as const, label: a.username ? `@${a.username}` : "Cuenta de Instagram" }))} businesses={businesses} />
      </div>
    );
  }
  if (!ig.length) {
    return (
      <div className={box}>
        <p><strong>Instagram no está conectado.</strong> Conéctalo con el permiso de mensajes y asígnalo a {businessName}. Antes, en la app de Meta tienen que estar los permisos de mensajes (guía, anexo H).</p>
        <a href={CONNECT} className={btn}>Conectar Instagram</a>
      </div>
    );
  }
  const expired = ig.filter((a) => a.status === "expired");
  const noScopes = ig.filter((a) => a.status !== "expired" && !hasInboxScopes(a.scopes));
  const ready = ig.filter((a) => a.status !== "expired" && hasInboxScopes(a.scopes));
  const list = (xs: Acc[]) => xs.map((a) => `@${a.username ?? "cuenta"}`).join(", ");
  return (
    <>
      {expired.length > 0 && (
        <div className={box}><p><strong>La conexión de {list(expired)} ha caducado.</strong> Vuelve a conectarla para leer mensajes.</p><a href={CONNECT} className={btn}>Reconectar Instagram</a></div>
      )}
      {noScopes.length > 0 && (
        <div className={box}>
          <p><strong>{list(noScopes)} está conectado, pero sin permiso para leer mensajes.</strong> Pulsa «Activar mensajes» y acepta los permisos nuevos. Si Instagram dice «Invalid scopes», antes hay que añadir los permisos de mensajes en la app de Meta (guía, anexo H).</p>
          <a href={CONNECT} className={btn}>Activar mensajes</a>
        </div>
      )}
      {ready.length > 0 && !hasItems && (
        <div className={box}>
          <p><strong>Aún no hay mensajes de Instagram guardados.</strong> {ready.map((a) => a.inbox_synced_at ? `@${a.username}: leído por última vez el ${new Date(a.inbox_synced_at).toLocaleString("es-ES", { timeZone: "Europe/Madrid", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}.` : `@${a.username}: todavía no se ha leído nunca.`).join(" ")} Se leen solos cada hora; si no quieres esperar, pulsa «Actualizar todo».</p>
          {ready.filter((a) => a.sync_error).map((a) => <p key={a.id} className="text-danger">Error al leer @{a.username}: {a.sync_error}</p>)}
          <RefreshAll />
        </div>
      )}
    </>
  );
}
