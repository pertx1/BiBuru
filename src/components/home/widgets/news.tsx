import Link from "next/link";
import { Lightbulb } from "lucide-react";
import { NewsImage } from "@/components/news/news-image";
import { getContext } from "@/lib/context";
import type { DigestContent } from "@/lib/news/digest";
import { WidgetCard } from "../widget-card";
import { businessOf, type WidgetProps } from "../types";

async function todayDigest(today: string) {
  const { supabase, userId, workspaceId } = await getContext();
  const { data } = await supabase.from("news_digests").select("status, content").eq("user_id", userId).eq("workspace_id", workspaceId).eq("day", today).maybeSingle();
  const c = data?.content as (DigestContent & { pending?: boolean }) | undefined;
  return !data || c?.pending ? null : { status: data.status, content: c! };
}
const waiting = <p className="text-sm text-muted">Tu resumen de hoy aún no está listo.</p>;

/** Noticias de hoy: la principal con foto grande y los titulares del resto. */
export async function NewsTodayWidget({ w, ctx }: WidgetProps) {
  const d = await todayDigest(ctx.today);
  const items = d ? (d.content.items.length ? d.content.items : d.content.closest) : [];
  const [lead, ...rest] = items;
  return (
    <WidgetCard title={`Noticias de hoy${items.length ? ` · ${d!.content.items.length}` : ""}`} href="/noticias">
      {!d ? waiting : !lead ? <p className="text-sm text-muted">Hoy no hay noticias nuevas en tus fuentes.</p> : (
        <>
          <Link href="/noticias" className="flex flex-col gap-2">
            <NewsImage src={lead.imageUrl} outlet={lead.outlet ?? lead.author} color={lead.topic?.color ?? "#7b6cf6"} icon={lead.topic?.icon ?? "newspaper"} hero />
            <span className="line-clamp-3 font-bold leading-snug">{lead.title}</span>
            {lead.action && <span className="line-clamp-2 text-xs text-muted"><span className="font-semibold text-accent">Qué hacer: </span>{lead.action}</span>}
          </Link>
          {rest.length > 0 && <ul className="mt-3 flex flex-col gap-1.5 border-t border-border pt-3 text-sm">{rest.slice(0, w.size === "l" ? 6 : 3).map((i) => (
            <li key={i.itemId}><Link href="/noticias" className="flex gap-2"><span className="mt-1.5 size-1.5 shrink-0 rounded-full" style={{ background: i.topic?.color ?? "var(--accent)" }} /><span className="line-clamp-2">{i.title}</span></Link></li>
          ))}</ul>}
        </>
      )}
    </WidgetCard>
  );
}

/** Idea del día sacada de las noticias. */
export async function NewsIdeaWidget({ ctx }: WidgetProps) {
  const d = await todayDigest(ctx.today);
  const idea = d?.content.idea;
  return (
    <WidgetCard title="Idea del día" href="/noticias">
      {!d ? waiting : !idea ? <p className="text-sm text-muted">Hoy no hay una idea clara en las noticias.</p> : (
        <div className="flex gap-2">
          <Lightbulb className="mt-0.5 size-5 shrink-0 text-amber-500" aria-hidden />
          <div><p className="font-semibold leading-snug">{idea.text}</p>{idea.why && <p className="mt-1 text-xs text-muted">{idea.why}</p>}</div>
        </div>
      )}
    </WidgetCard>
  );
}

/** Noticias de hoy que aplican a un negocio. */
export async function NewsBusinessWidget({ w, ctx }: WidgetProps) {
  const biz = businessOf(w, ctx);
  if (!biz) return <WidgetCard title="Noticias de un negocio"><p className="text-sm text-muted">Pulsa «Editar» → ajustes de este widget y elige el negocio.</p></WidgetCard>;
  const d = await todayDigest(ctx.today);
  const items = (d?.content.items ?? []).filter((i) => i.business === biz.name);
  return (
    <WidgetCard title={`Noticias · ${biz.name}`} href={`/noticias?negocio=${encodeURIComponent(biz.name)}`}>
      {!d ? waiting : items.length === 0 ? <p className="text-sm text-muted">Hoy ninguna noticia aplica directamente a {biz.name}.</p> : (
        <ul className="flex flex-col gap-3">
          {items.slice(0, w.size === "l" ? 6 : 3).map((i) => (
            <li key={i.itemId}><Link href={`/noticias?negocio=${encodeURIComponent(biz.name)}`} className="flex gap-3">
              <NewsImage src={i.imageUrl} outlet={null} color={i.topic?.color ?? biz.color} icon={i.topic?.icon ?? "newspaper"} className="!size-14" />
              <span className="min-w-0 text-sm"><span className="line-clamp-2 font-semibold leading-snug">{i.title}</span>{i.action && <span className="line-clamp-2 text-xs text-muted">{i.action}</span>}</span>
            </Link></li>
          ))}
        </ul>
      )}
    </WidgetCard>
  );
}
