import Link from "next/link";
import { PostsView } from "@/components/social/posts-view";
import { SocialAccounts } from "@/components/social/social-accounts";
import { SocialStats } from "@/components/social/social-stats";
import { RefreshAll } from "@/components/social/refresh-all";
import { listBusinesses } from "@/lib/data";
import { addDays, requestNowMs, todayISO } from "@/lib/dates";
import { accountsExtras, accountStats, listPosts, listSocialAccounts, socialConfigured, storageUsed } from "@/lib/social/data";
import { refreshIfStale } from "@/lib/sync/service";
import { STORAGE_LIMIT_BYTES } from "@/lib/social/service";
import { followerDelta } from "@/lib/social/stats";
import { cn } from "@/lib/utils";

export type RedesSP = Record<string, string | undefined>;
export const REDES_VIEWS = ["contenido", "estadisticas"] as const;
type View = (typeof REDES_VIEWS)[number];

/**
 * Redes: Contenido (publicaciones programadas) y Estadísticas. (Los mensajes y comentarios de Instagram y TikTok se quitaron.)
 * Global («Todas las redes», con filtro por negocio) o dentro de un negocio (`businessId` fijo).
 */
export async function RedesView({ sp, businessId, basePath }: { sp: RedesSP; businessId?: string; basePath: string }) {
  const filterBiz = businessId ?? (sp.negocio && /^[0-9a-f-]{36}$/i.test(sp.negocio) ? sp.negocio : undefined);
  const view: View = sp.vista === "publicaciones" ? "contenido" : (REDES_VIEWS.find((v) => v === sp.vista) ?? "contenido");
  const [accounts, businesses] = await Promise.all([listSocialAccounts(filterBiz).catch(() => []), listBusinesses()]);
  refreshIfStale(accounts); // > 15 min sin actualizar: se refresca en segundo plano
  const today = todayISO();
  const extras = await accountsExtras(accounts.map((a) => a.id), addDays(today, -8)).catch(() => ({ daily: [] }));
  const cards = accounts.map((a) => {
    const daily = extras.daily.filter((d) => d.account_id === a.id);
    return { ...a, deltaToday: followerDelta(a.followers_count, daily, addDays(today, -1)), deltaWeek: followerDelta(a.followers_count, daily, addDays(today, -7)) };
  });

  const keep = (o: RedesSP) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({ vista: view, negocio: businessId ? undefined : filterBiz, ...o })) if (v) q.set(k, v);
    const s = q.toString();
    return s ? `${basePath}?${s}` : basePath;
  };
  const tab = (v: View, l: string) => (
    <Link href={keep({ vista: v, cuenta: undefined, hilo: undefined })} aria-current={view === v ? "page" : undefined}
      className={cn("flex min-h-11 items-center gap-1.5 border-b-2 border-transparent px-3 text-sm font-medium text-muted md:min-h-9", view === v && "border-accent text-foreground")}>
      {l}
    </Link>
  );
  const bizWithAccounts = businesses.filter((b) => accounts.some((a) => a.business_id === b.id) || b.id === filterBiz);
  const allAccounts = businessId ? accounts : await listSocialAccounts().catch(() => accounts);

  const days = [7, 30, 90].includes(Number(sp.dias)) ? Number(sp.dias) : 30;
  const to = addDays(today, -1), from = addDays(to, -(days - 1)), prevFrom = addDays(from, -days);
  const single = accounts.find((a) => a.id === sp.cuenta);
  const statsIds = single ? [single.id] : accounts.map((a) => a.id);

  return (
    <div className="flex flex-col gap-4">
      {!businessId && businesses.length > 0 && (
        <nav aria-label="Filtrar por negocio" className="-mx-4 flex gap-1.5 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0">
          <Link href={keep({ negocio: undefined, cuenta: undefined })} aria-current={!filterBiz ? "page" : undefined} className={cn("flex min-h-11 shrink-0 items-center rounded-full border border-border bg-surface px-3.5 text-sm md:min-h-9", !filterBiz && "border-accent bg-accent text-accent-foreground")}>Todas las redes</Link>
          {(filterBiz ? businesses.filter((b) => b.id === filterBiz || allAccounts.some((a) => a.business_id === b.id)) : bizWithAccounts.length ? bizWithAccounts : []).map((b) => (
            <Link key={b.id} href={keep({ negocio: b.id, cuenta: undefined })} aria-current={filterBiz === b.id ? "page" : undefined} className={cn("flex min-h-11 shrink-0 items-center rounded-full border border-border bg-surface px-3.5 text-sm md:min-h-9", filterBiz === b.id && "border-accent bg-accent text-accent-foreground")}>{b.name}</Link>
          ))}
        </nav>
      )}
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted">{accounts.length ? `${accounts.length} ${accounts.length === 1 ? "cuenta" : "cuentas"}` : "Sin cuentas conectadas"}</p>
        {accounts.length > 0 && <RefreshAll />}
      </div>
      <SocialAccounts accounts={cards} businesses={businesses.map((b) => ({ id: b.id, name: b.name }))} configured={socialConfigured()} audited={process.env.TIKTOK_DIRECT_POST_AUDITED === "1"}
        nowMs={requestNowMs()} result={{ instagram: sp.instagram, tiktok: sp.tiktok }} />
      <nav className="flex gap-1 border-b border-border" aria-label="Secciones de Redes">{tab("contenido", "Contenido")}{tab("estadisticas", "Estadísticas")}</nav>

      {view === "contenido" && (
        <PostsView posts={(await listPosts()).filter((p) => !filterBiz || p.business_id === filterBiz)} accounts={accounts.map((a) => ({ id: a.id, platform: a.platform, username: a.username, status: a.status, scopes: a.scopes }))}
          businesses={businesses.map((b) => ({ id: b.id, name: b.name }))} today={today} openId={sp.abrir ?? null} used={await storageUsed()} limit={STORAGE_LIMIT_BYTES} />
      )}
      {view === "estadisticas" && (
        accounts.length
          ? <SocialStats accounts={accounts} current={single?.id ?? null} days={days} {...await accountStats(statsIds, from, to, prevFrom)} to={to} prevFrom={prevFrom} href={(o) => keep({ vista: "estadisticas", dias: String(days), cuenta: single?.id, ...o })} />
          : <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted">Conecta una cuenta para ver sus estadísticas. Se guarda una foto de los datos cada día para tener tu propio histórico.</p>
      )}
    </div>
  );
}
