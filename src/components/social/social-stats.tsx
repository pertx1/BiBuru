import Link from "next/link";
import { bestTimes, dailySeries, pctChange, periodTotals, rankMedia, type MediaRow } from "@/lib/social/stats";
import { formatDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { SocialChartLazy } from "./lazy";

type Acc = { id: string; platform: string; username: string | null };
type Daily = { day: string; followers: number | null; reach: number | null; views: number | null; interactions: number | null };

function Kpi({ label, value, delta, sub }: { label: string; value: string; delta?: number | null; sub?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="text-xl font-semibold tabular-nums">{value}</p>
      {delta != null ? <p className={cn("text-xs font-medium", delta >= 0 ? "text-good" : "text-bad")}>{delta >= 0 ? "▲" : "▼"} {Math.abs(delta)} % vs periodo anterior</p> : sub ? <p className="text-xs text-muted">{sub}</p> : <p className="text-xs text-muted">Sin datos del periodo anterior</p>}
    </div>
  );
}
const n = (v: number | null | undefined) => (v == null ? "—" : v.toLocaleString("es-ES"));

/**
 * Estadísticas de una cuenta o de todas a la vez (suma de todas las redes del negocio): seguidores y su evolución, alcance,
 * visualizaciones e interacciones, ranking y mejores momentos.
 */
export function SocialStats({ current, accounts, days, daily, media, from, to, prevFrom, href }: { current: string | null; accounts: Acc[]; days: number; daily: Daily[]; media: MediaRow[]; from: string; to: string; prevFrom: string; href: (o: Record<string, string | undefined>) => string }) {
  const cur = dailySeries(daily.filter((d) => d.day >= from), from, to);
  const now = periodTotals(cur), before = periodTotals(daily.filter((d) => d.day >= prevFrom && d.day < from));
  const hasData = cur.some((d) => d.followers != null || d.reach != null);
  const inPeriod = media.filter((m) => m.posted_at.slice(0, 10) >= from);
  const top = rankMedia(inPeriod.length ? inPeriod : media, "interactions", 5);
  const times = bestTimes(media);
  const maxDay = Math.max(1, ...times.days.map((d) => d.avg));
  const qs = href;
  const chip = (on: boolean) => cn("inline-flex min-h-11 items-center rounded-full border border-border bg-surface px-3 text-sm md:min-h-9", on && "border-accent bg-accent text-accent-foreground");
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {accounts.length > 1 && <Link href={qs({ cuenta: undefined })} className={chip(!current)}>Todas · suma</Link>}
        {accounts.length > 1 && accounts.map((a) => <Link key={a.id} href={qs({ cuenta: a.id })} className={chip(a.id === current)}>{a.platform === "tiktok" ? "TikTok" : "IG"} · @{a.username}</Link>)}
        <span className="flex-1" />
        {[7, 30, 90].map((d) => <Link key={d} href={qs({ dias: String(d) })} className={chip(d === days)}>{d} días</Link>)}
      </div>
      {!hasData && <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted">Aún no hay fotos diarias de esta cuenta. La primera se guarda en unos minutos y después una cada día; el histórico empieza hoy. (Instagram solo da seguidores diarios a cuentas con 100 o más.)</p>}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Kpi label="Seguidores" value={n(now.followers)} sub={now.followersDelta != null ? `${now.followersDelta >= 0 ? "+" : ""}${now.followersDelta} en ${days} días` : undefined} />
        <Kpi label="Alcance" value={n(now.reach)} delta={pctChange(now.reach, before.reach)} />
        <Kpi label="Visualizaciones" value={n(now.views)} delta={pctChange(now.views, before.views)} />
        <Kpi label="Interacciones" value={n(now.interactions)} delta={pctChange(now.interactions, before.interactions)} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-xl border border-border bg-surface p-4"><h2 className="mb-2 text-sm font-semibold">Seguidores</h2><SocialChartLazy data={cur.map((d) => ({ day: d.day, value: d.followers }))} label="Seguidores" /></section>
        <section className="rounded-xl border border-border bg-surface p-4"><h2 className="mb-2 text-sm font-semibold">Alcance por día</h2><SocialChartLazy data={cur.map((d) => ({ day: d.day, value: d.reach }))} label="Alcance" kind="bar" /></section>
        <section className="rounded-xl border border-border bg-surface p-4"><h2 className="mb-2 text-sm font-semibold">Visualizaciones por día</h2><SocialChartLazy data={cur.map((d) => ({ day: d.day, value: d.views }))} label="Visualizaciones" kind="bar" /></section>
        <section className="rounded-xl border border-border bg-surface p-4"><h2 className="mb-2 text-sm font-semibold">Interacciones por día</h2><SocialChartLazy data={cur.map((d) => ({ day: d.day, value: d.interactions }))} label="Interacciones" kind="bar" /></section>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-xl border border-border bg-surface p-4">
          <h2 className="mb-2 text-sm font-semibold">Mejores publicaciones</h2>
          {top.length === 0 ? <p className="text-sm text-muted">Sin publicaciones todavía.</p> : (
            <ol className="flex flex-col divide-y divide-border">
              {top.map((m, i) => (
                <li key={m.id}><a href={m.permalink ?? "#"} target="_blank" rel="noopener noreferrer" className="flex min-h-14 items-center gap-3 py-1.5 text-sm">
                  <span className="w-4 text-xs text-muted">{i + 1}</span>
                  {/* eslint-disable-next-line @next/next/no-img-element -- miniatura externa */}
                  {m.thumbnail_url ? <img src={m.thumbnail_url} alt="" loading="lazy" referrerPolicy="no-referrer" className="size-11 shrink-0 rounded-md object-cover" /> : <span className="size-11 shrink-0 rounded-md bg-surface-2" />}
                  <span className="min-w-0 flex-1"><span className="line-clamp-1">{m.caption || "(sin texto)"}</span><span className="text-xs text-muted">{formatDate(m.posted_at.slice(0, 10))} · alcance {n(m.reach)}</span></span>
                  <span className="shrink-0 text-right text-sm font-semibold tabular-nums">{n(m.interactions ?? (m.likes ?? 0) + (m.comments ?? 0))}<span className="block text-[11px] font-normal text-muted">interacc.</span></span>
                </a></li>
              ))}
            </ol>
          )}
        </section>
        <section className="rounded-xl border border-border bg-surface p-4">
          <h2 className="mb-1 text-sm font-semibold">Mejores días y horas</h2>
          <p className="mb-3 text-xs text-muted">{times.bestDay ? <>Publica mejor el <strong>{times.bestDay.label.toLowerCase()}</strong>{times.bestSlot ? <> por la <strong>{times.bestSlot.label.split(" (")[0].toLowerCase()}</strong> ({times.bestSlot.label.split(" (")[1]?.replace(")", "")})</> : null}: es cuando tus publicaciones logran más interacciones de media.</> : "Hacen falta más publicaciones para saberlo (al menos 2 por día de la semana)."}</p>
          <ul className="flex flex-col gap-2">
            {times.days.map((d) => (
              <li key={d.label} className="grid grid-cols-[5.5rem_1fr_3rem] items-center gap-2 text-xs">
                <span className="text-muted">{d.label}</span>
                <span className="h-2.5 overflow-hidden rounded-full bg-surface-2"><span className="block h-full rounded-full bg-income" style={{ width: `${(d.avg / maxDay) * 100}%` }} /></span>
                <span className="text-right tabular-nums">{d.posts ? d.avg : "—"}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
