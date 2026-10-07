"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { disconnectSocialAccount, refreshSocialStats, setSocialAccountBusiness } from "@/app/(app)/redes/actions";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

type Acc = { id: string; platform: string; username: string | null; display_name: string | null; avatar_url: string | null; business_id: string | null; status: string; last_error: string | null; token_expires_at: string | null; account_type: string | null };
const RESULT: Record<string, string> = { ok: "Cuenta conectada ✔ Las estadísticas tardan unos minutos.", cancelado: "Has cancelado la conexión.", estado: "La conexión caducó: vuelve a intentarlo.", error: "No se pudo conectar. Vuelve a intentarlo.", "sin-configurar": "Falta conectar: la app aún no está registrada (mira la guía)." };
const PLAT = { instagram: "Instagram", tiktok: "TikTok" } as const;

/** Cuentas conectadas: estado del token (aviso si caduca), negocio, actualizar y desconectar; botones para conectar. */
export function SocialAccounts({ accounts, businesses, configured, result, nowMs }: { nowMs: number; accounts: Acc[]; businesses: { id: string; name: string }[]; configured: { instagram: boolean; tiktok: boolean }; result: { instagram?: string; tiktok?: string } }) {
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
                {warn && (
                  <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                    {a.status === "expired" ? "La conexión ha caducado." : a.status === "error" ? a.last_error ?? "Error de conexión." : `La conexión caduca en ${left} días; se renueva sola si la app sigue en uso.`}
                    <a href={`/api/${a.platform}/connect`} className="ml-1 underline">Reconectar</a></p>
                )}
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
