import Link from "next/link";
import { getContext } from "@/lib/context";
import { addDays } from "@/lib/dates";
import { bestOfWeek } from "@/lib/social/stats";
import { KIND_LABEL } from "@/lib/inbox/logic";
import { WidgetCard } from "../widget-card";
import { businessOf, type WidgetProps } from "../types";

const n = (v: number | null | undefined) => (v == null ? "—" : v.toLocaleString("es-ES"));
const empty = <p className="text-sm text-muted">Conecta Instagram o TikTok en Redes.</p>;

/** «Seguidores»: total y variación de 7 días de cada cuenta conectada (de la foto diaria). */
export async function SocialFollowersWidget({ ctx }: WidgetProps) {
  const { supabase, workspaceId } = await getContext();
  const { data: accs } = await supabase.from("social_accounts").select("id, platform, username").eq("workspace_id", workspaceId);
  if (!accs?.length) return <WidgetCard title="Seguidores" href="/redes">{empty}</WidgetCard>;
  const { data: rows } = await supabase.from("social_daily").select("account_id, day, followers").eq("workspace_id", workspaceId).gte("day", addDays(ctx.today, -9)).not("followers", "is", null).order("day");
  return (
    <WidgetCard title="Seguidores" href="/redes">
      <ul className="flex flex-col divide-y divide-border">
        {accs.map((a) => {
          const r = (rows ?? []).filter((x) => x.account_id === a.id);
          const last = r.at(-1)?.followers ?? null, first = r.find((x) => x.day >= addDays(ctx.today, -8))?.followers ?? null;
          const d = last != null && first != null ? last - first : null;
          return (
            <li key={a.id} className="flex min-h-11 items-center gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate">{a.platform === "tiktok" ? "TikTok" : "Instagram"} · @{a.username}</span>
              <span className="font-semibold tabular-nums">{n(last)}</span>
              {d != null && <span className={`w-14 text-right text-xs tabular-nums ${d >= 0 ? "text-good" : "text-bad"}`}>{d >= 0 ? "+" : ""}{d}</span>}
            </li>
          );
        })}
      </ul>
    </WidgetCard>
  );
}

/** «Mejor publicación de la semana» (por interacciones). */
export async function SocialBestPostWidget() {
  const { supabase, workspaceId } = await getContext();
  const { data } = await supabase.from("social_media").select("id, caption, permalink, thumbnail_url, posted_at, reach, views, interactions, likes, comments")
    .eq("workspace_id", workspaceId).gte("posted_at", new Date(Date.parse(new Date().toISOString()) - 7 * 86400_000).toISOString()).limit(200);
  const best = bestOfWeek(data ?? []);
  return (
    <WidgetCard title="Mejor publicación de la semana" href="/redes">
      {!best ? <p className="text-sm text-muted">Sin publicaciones en los últimos 7 días.</p> : (
        <a href={best.permalink ?? "/redes"} target="_blank" rel="noopener noreferrer" className="flex gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- miniatura externa */}
          {best.thumbnail_url ? <img src={best.thumbnail_url} alt="" loading="lazy" referrerPolicy="no-referrer" className="size-20 shrink-0 rounded-lg object-cover" /> : <span className="size-20 shrink-0 rounded-lg bg-surface-2" />}
          <span className="min-w-0 text-sm"><span className="line-clamp-2">{best.caption || "(sin texto)"}</span>
            <span className="mt-1 block text-xs text-muted">{n(best.interactions ?? (best.likes ?? 0) + (best.comments ?? 0))} interacciones · alcance {n(best.reach)}</span></span>
        </a>
      )}
    </WidgetCard>
  );
}

/** «Próximas publicaciones» programadas (Instagram y TikTok). */
export async function SocialUpcomingWidget({ w }: WidgetProps) {
  const { supabase, workspaceId } = await getContext();
  const { data } = await supabase.from("social_posts").select("id, title, caption, scheduled_at, status").eq("workspace_id", workspaceId).in("status", ["programada", "publicando", "error"])
    .order("scheduled_at").limit(w.size === "l" ? 6 : 3);
  return (
    <WidgetCard title="Próximas publicaciones" href="/redes?vista=contenido">
      {!data?.length ? <p className="text-sm text-muted">Nada programado.</p> : (
        <ul className="flex flex-col divide-y divide-border">
          {data.map((p) => (
            <li key={p.id}><Link href={`/redes?vista=contenido&abrir=${p.id}`} className="flex min-h-11 items-center gap-2 text-sm">
              <span className="w-24 shrink-0 text-xs tabular-nums text-muted">{p.scheduled_at ? new Date(p.scheduled_at).toLocaleString("es-ES", { timeZone: "Europe/Madrid", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : ""}</span>
              <span className="min-w-0 flex-1 truncate">{p.title || p.caption || "(sin texto)"}</span>
              {p.status === "error" && <span className="text-xs text-bad">error</span>}
            </Link></li>
          ))}
        </ul>
      )}
    </WidgetCard>
  );
}

/** «Mensajes sin responder»: los hilos de la bandeja de Redes que esperan respuesta. */
export async function SocialInboxWidget({ w, ctx }: WidgetProps) {
  const { supabase, workspaceId } = await getContext();
  const biz = businessOf(w, ctx);
  let accQ = supabase.from("social_accounts").select("id, username").eq("workspace_id", workspaceId);
  if (biz) accQ = accQ.eq("business_id", biz.id);
  const { data: accs } = await accQ;
  const href = biz ? `/negocios/${biz.id}/redes` : "/redes";
  const title = biz ? `Mensajes · ${biz.name}` : "Mensajes sin responder";
  if (!accs?.length) return <WidgetCard title={title} href={href}>{empty}</WidgetCard>;
  const { data, count } = await supabase.from("social_threads").select("id, kind, participant_name, participant_username, preview, last_message_at", { count: "exact" })
    .eq("workspace_id", workspaceId).eq("status", "sin_responder").in("account_id", accs.map((a) => a.id))
    .order("last_message_at", { ascending: false }).limit(w.size === "l" ? 6 : 3);
  return (
    <WidgetCard title={title} href={href}>
      <p className="text-3xl font-semibold tabular-nums">{count ?? 0}</p>
      {w.size !== "s" && !!data?.length && (
        <ul className="mt-1 flex flex-col divide-y divide-border">
          {data.map((t) => (
            <li key={t.id}><Link href={`/redes/mensajes/${t.id}`} className="flex min-h-11 items-center gap-2 text-sm">
              <span className="w-20 shrink-0 truncate text-xs text-muted">{KIND_LABEL[t.kind as keyof typeof KIND_LABEL] ?? t.kind}</span>
              <span className="min-w-0 flex-1 truncate"><span className="font-medium">{t.participant_name || (t.participant_username ? `@${t.participant_username}` : "Alguien")}</span> <span className="text-muted">{t.preview}</span></span>
            </Link></li>
          ))}
        </ul>
      )}
    </WidgetCard>
  );
}
