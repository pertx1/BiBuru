"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { disconnectSocialAccount, refreshSocialStats, setSocialAccountBusiness } from "@/app/(app)/redes/actions";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

type Acc = {
  id: string; platform: string; username: string | null; display_name: string | null; avatar_url: string | null; business_id: string | null; status: string; last_error: string | null;
  token_expires_at: string | null; account_type: string | null; followers_count?: number | null; last_sync_at?: string | null; sync_error?: string | null; rate_limited_until?: string | null;
  unread?: number; deltaToday?: number | null; deltaWeek?: number | null;
};
const ago = (iso: string | null | undefined, nowMs: number) => {
  if (!iso) return "Sin actualizar todavía";
  const m = Math.max(0, Math.round((nowMs - new Date(iso).getTime()) / 60000));
  return m < 1 ? "Actualizado ahora" : m < 60 ? `Actualizado hace ${m} min` : m < 1440 ? `Actualizado hace ${Math.round(m / 60)} h` : `Actualizado hace ${Math.round(m / 1440)} días`;
};
const signed = (n: number) => `${n >= 0 ? "+" : "−"}${Math.abs(n).toLocaleString("es-ES")}`;
const RESULT: Record<string, string> = { ok: "Cuenta conectada ✔ Las estadísticas tardan unos minutos.", cancelado: "Has cancelado la conexión.", estado: "La conexión caducó: vuelve a intentarlo.", error: "No se pudo conectar. Vuelve a intentarlo.", "sin-configurar": "Falta conectar: la app aún no está registrada (mira la guía).", "sin-pagina": "Tu Instagram profesional no está vinculado a una página de Facebook (o no la marcaste al dar permiso). Vincúlalo y vuelve a conectar." };
const PLAT = { instagram: "Instagram", tiktok: "TikTok" } as const;

/** Cuentas conectadas: estado del token (aviso si caduca), negocio, actualizar y desconectar; botones para conectar. */
export function SocialAccounts({ accounts, businesses, configured, result, nowMs, audited = false }: { audited?: boolean; nowMs: number; accounts: Acc[]; businesses: { id: string; name: string }[]; configured: { instagram: boolean; tiktok: boolean }; result: { instagram?: string; tiktok?: string } }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, ok?: string) => start(async () => { const r = await fn(); toast({ message: r.ok ? ok ?? "Hecho" : r.error ?? "No se pudo" }); router.refresh(); });
  const msg = result.instagram ? `Instagram: ${RESULT[result.instagram] ?? ""}` : result.tiktok ? `TikTok: ${RESULT[result.tiktok] ?? ""}` : null;
  const days = (iso: string | null) => (iso ? Math.ceil((new Date(iso).getTime() - nowMs) / 86400_000) : null);
  return (
    <section className="flex flex-col gap-3">
      {msg && <p role="status" className="rounded-lg bg-surface-2 p-3 text-sm">{msg}</p>}
      {accounts.length > 0 && (
        <ul className="grid gap-2 md:grid-cols-2">
          {accounts.map((a) => {
            const left = days(a.token_expires_at);
            const warn = a.status === "expired" || a.status === "error" || (left != null && left < 7);
            return (
              <li key={a.id} className={cn("flex flex-col gap-2 rounded-xl border bg-surface p-3", warn ? "border-amber-500/50" : "border-border")}>
                <div className="flex items-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element -- avatar externo */}
                  {a.avatar_url ? <img src={a.avatar_url} alt="" className="size-9 rounded-full object-cover" referrerPolicy="no-referrer" /> : <span className="size-9 rounded-full bg-surface-2" />}
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">@{a.username ?? a.display_name ?? "cuenta"}</p><p className="text-xs text-muted">{PLAT[a.platform as keyof typeof PLAT]}{a.account_type ? ` · ${a.account_type === "BUSINESS" ? "empresa" : a.account_type === "MEDIA_CREATOR" ? "creador" : a.account_type.toLowerCase()}` : ""}</p></div>
                  <button type="button" aria-label="Actualizar estadísticas" disabled={pending} onClick={() => run(() => refreshSocialStats(a.id), "Estadísticas actualizadas")} className="flex size-11 items-center justify-center rounded-lg hover:bg-surface-2 md:size-9"><RefreshCw className={cn("size-4", pending && "animate-spin")} aria-hidden /></button>
                </div>
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="text-xl font-semibold tabular-nums">{a.followers_count != null ? a.followers_count.toLocaleString("es-ES") : "—"}<span className="ml-1 text-xs font-normal text-muted">seguidores</span></span>
                  {a.deltaToday != null && <span className={cn("text-xs font-semibold", a.deltaToday >= 0 ? "text-good" : "text-bad")}>{signed(a.deltaToday)} hoy</span>}
                  {a.deltaWeek != null && <span className={cn("text-xs font-semibold", a.deltaWeek >= 0 ? "text-good" : "text-bad")}>{signed(a.deltaWeek)} esta semana</span>}
                  {!!a.unread && <span className="rounded-full bg-danger/10 px-2 py-0.5 text-xs font-semibold text-danger">{a.unread} sin responder</span>}
                </div>
                <p className="text-xs text-muted">{ago(a.last_sync_at, nowMs)}{a.rate_limited_until && new Date(a.rate_limited_until).getTime() > nowMs ? ` · ${a.platform === "tiktok" ? "TikTok" : "Instagram"} ha puesto un límite: sigo en la próxima pasada` : a.sync_error ? ` · ${a.sync_error}` : ""}</p>
                {warn && (
                  <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                    {a.status === "expired" ? "La conexión ha caducado." : a.status === "error" ? a.last_error ?? "Error de conexión." : `La conexión caduca en ${left} días; se renueva sola si la app sigue en uso.`}
                    <a href={`/api/${a.platform}/connect`} className="-my-3 ml-1 inline-flex min-h-11 items-center underline">Reconectar</a></p>
                )}
                {a.platform === "tiktok" && <p className="text-xs text-muted">{audited ? "App auditada por TikTok: publicación directa y pública." : "App sin auditar: lo que se publique por API quedaría privado, así que se envía como borrador a tu TikTok (lo publicas tú) o te aviso a la hora."}</p>}
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-2 text-xs text-muted">Negocio
                    <select defaultValue={a.business_id ?? ""} disabled={pending} onChange={(e) => run(() => setSocialAccountBusiness(a.id, e.target.value || null), "Guardado")} className="min-h-11 rounded-lg border border-border bg-surface px-2 text-base text-foreground md:min-h-9 md:text-sm">
                      <option value="">Ninguno</option>{businesses.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  </label>
                  <button type="button" disabled={pending} onClick={() => { if (confirm("¿Desconectar esta cuenta? Se borran su token y sus estadísticas guardadas en BiBuru.")) run(() => disconnectSocialAccount(a.id), "Desconectada"); }} className="min-h-11 px-2 text-xs text-muted hover:text-danger md:min-h-9">Desconectar</button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        {configured.instagram ? <a href="/api/instagram/connect" className="inline-flex min-h-11 items-center rounded-lg border border-border bg-surface px-4 text-sm font-medium md:min-h-9">+ Conectar Instagram</a>
          : <p className="rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted"><strong>Instagram: falta conectar.</strong> Registra la app en Meta (guía) y pon INSTAGRAM_APP_ID e INSTAGRAM_APP_SECRET en Vercel.</p>}
        {configured.tiktok ? <a href="/api/tiktok/connect" className="inline-flex min-h-11 items-center rounded-lg border border-border bg-surface px-4 text-sm font-medium md:min-h-9">+ Conectar TikTok</a>
          : <p className="rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted"><strong>TikTok: falta conectar.</strong> Registra la app en TikTok for Developers (guía) y pon TIKTOK_CLIENT_KEY y TIKTOK_CLIENT_SECRET en Vercel.</p>}
      </div>
    </section>
  );
}
