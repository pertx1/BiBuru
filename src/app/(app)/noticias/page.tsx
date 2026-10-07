import Link from "next/link";
import { after } from "next/server";
import { ChevronLeft, ChevronRight, Lightbulb, Search, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { GenerateNewsButton } from "@/components/news/generate-button";
import { NewsCard } from "@/components/news/news-card";
import { NewsImage } from "@/components/news/news-image";
import { getContext } from "@/lib/context";
import { addDays, formatDate, nowLocal } from "@/lib/dates";
import type { DigestContent, DigestItem } from "@/lib/news/digest";
import { ensureNewsSetup, generateDigest, newsDue } from "@/lib/news/service";
import { itemLabel, KIND_LABELS, type SourceKind } from "@/lib/news/sources";
import { createAdminClient } from "@/lib/supabase/admin";
import { cn } from "@/lib/utils";

export const metadata = { title: "Noticias" };
type SP = { dia?: string; tema?: string; negocio?: string; tipo?: string; q?: string };

const chip = (on: boolean) => cn("flex min-h-11 shrink-0 items-center rounded-full border px-3.5 text-sm md:min-h-10", on ? "border-accent bg-accent font-semibold text-accent-foreground" : "border-border bg-surface");
const dayTitle = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

/** Noticias: resumen del día con fotos, filtros por negocio/tema/tipo de fuente e histórico con buscador. */
export default async function NoticiasPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { supabase, userId, workspaceId, timezone } = await getContext();
  await ensureNewsSetup(supabase, workspaceId, userId);
  const today = nowLocal(new Date(), timezone).date;
  const day = sp.dia && /^\d{4}-\d{2}-\d{2}$/.test(sp.dia) && sp.dia <= today ? sp.dia : today;
  const q = (sp.q ?? "").trim().slice(0, 100);

  const [{ data: digest }, { data: profile }, { data: history }] = await Promise.all([
    supabase.from("news_digests").select("status, content, manual_runs, updated_at").eq("user_id", userId).eq("workspace_id", workspaceId).eq("day", day).maybeSingle(),
    supabase.from("profiles").select("news_enabled, news_time, news_weekends, ai_monthly_budget_cents").eq("user_id", userId).maybeSingle(),
    supabase.from("news_digests").select("day, status").eq("user_id", userId).eq("workspace_id", workspaceId).order("day", { ascending: false }).limit(30),
  ]);
  const content = digest?.content as (DigestContent & { pending?: boolean }) | undefined;
  const pending = !digest || content?.pending === true;

  // Respaldo del cron: si ya es la hora y no hay resumen de hoy, se genera tras enviar la página.
  if (day === today && !digest && profile && newsDue(profile, nowLocal(new Date(), timezone))) {
    const who = { userId, workspaceId, timezone, budgetCents: profile.ai_monthly_budget_cents };
    after(async () => { try { await generateDigest(createAdminClient(), who); } catch (e) { console.error("[news] respaldo:", e instanceof Error ? e.message : e); } });
  }

  // Búsqueda en el histórico (titulares y entradillas de todo lo recogido).
  const results = q
    ? (await supabase.from("news_items").select("id, title, url, outlet, author, image_url, source_kind, digest_day, fetched_at").eq("workspace_id", workspaceId)
        .textSearch("fts", q, { type: "websearch", config: "spanish" }).order("fetched_at", { ascending: false }).limit(40)).data ?? []
    : [];

  const all: DigestItem[] = content && !pending ? [...content.items, ...(content.items.length ? [] : content.closest)] : [];
  const topics = [...new Map(all.filter((i) => i.topic).map((i) => [i.topic!.id, i.topic!])).values()];
  const businesses = [...new Set(all.map((i) => i.business).filter(Boolean))] as string[];
  const kinds = [...new Set(all.map((i) => i.label))];
  const items = all.filter((i) => (!sp.tema || i.topic?.id === sp.tema) && (!sp.negocio || i.business === sp.negocio) && (!sp.tipo || i.label === sp.tipo));
  const { data: fb } = all.length ? await supabase.from("news_items").select("id, feedback").in("id", all.map((i) => i.itemId)) : { data: [] };
  const feedbackOf = new Map((fb ?? []).map((f) => [f.id, f.feedback]));
  const href = (patch: Partial<SP>) => { const p = new URLSearchParams(Object.entries({ dia: day === today ? undefined : day, tema: sp.tema, negocio: sp.negocio, tipo: sp.tipo, ...patch }).filter(([, v]) => v) as [string, string][]); return `/noticias${p.size ? `?${p}` : ""}`; };
  const filtered = !!(sp.tema || sp.negocio || sp.tipo);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Noticias" subtitle="Solo lo que te sirve para ganar más o escalar tus negocios." />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <nav className="flex items-center gap-1" aria-label="Día">
          <Link href={href({ dia: addDays(day, -1) })} className="flex size-11 items-center justify-center rounded-full border border-border bg-surface" aria-label="Día anterior"><ChevronLeft className="size-5" aria-hidden /></Link>
          <span className="px-2 text-sm font-semibold first-letter:uppercase">{day === today ? "Hoy" : dayTitle(day)}</span>
          {day < today && <Link href={href({ dia: addDays(day, 1) === today ? undefined : addDays(day, 1) })} className="flex size-11 items-center justify-center rounded-full border border-border bg-surface" aria-label="Día siguiente"><ChevronRight className="size-5" aria-hidden /></Link>}
        </nav>
        {day === today && <GenerateNewsButton left={2 - (digest?.manual_runs ?? 0)} />}
      </div>

      <form action="/noticias" className="flex items-center gap-2 rounded-full border border-border bg-surface p-1 pl-4">
        <Search className="size-4 shrink-0 text-muted" aria-hidden />
        <input name="q" defaultValue={q} placeholder="Buscar en el histórico…" aria-label="Buscar noticias" className="min-h-11 md:min-h-10 min-w-0 flex-1 bg-transparent text-base outline-none md:text-sm" />
      </form>

      {q ? (
        <section>
          <h2 className="mb-2 text-sm font-semibold">{results.length} resultados para «{q}» <Link href="/noticias" className="ml-2 font-normal text-muted underline">Quitar</Link></h2>
          <ul className="flex flex-col gap-2">
            {results.map((r) => (
              <li key={r.id}><a href={r.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3">
                <NewsImage src={r.image_url} outlet={null} color="#7b6cf6" icon="newspaper" className="!size-14" />
                <span className="min-w-0"><span className="line-clamp-2 text-sm font-semibold">{r.title}</span><span className="text-xs text-muted">{r.outlet ?? r.author ?? itemLabel(r.source_kind as SourceKind)} · {formatDate((r.digest_day ?? r.fetched_at).slice(0, 10))}</span></span>
              </a></li>
            ))}
          </ul>
        </section>
      ) : pending ? (
        <section className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted">
          {day !== today ? "No hay resumen de ese día." : !profile?.news_enabled ? "Las noticias están desactivadas (Ajustes → Noticias)." : digest ? "Preparando tu resumen… vuelve en un minuto." : `Tu resumen llega a las ${profile.news_time.slice(0, 5)}. Si no quieres esperar, pulsa «Generar ahora».`}
        </section>
      ) : (
        <>
          {content!.note && <p className="rounded-xl bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">{content!.note}</p>}
          {content!.top.length > 0 && !filtered && (
            <section className="rounded-xl border border-border bg-surface p-4">
              <h2 className="mb-2 flex items-center gap-2 font-bold"><Sparkles className="size-4 text-accent" aria-hidden />Lo más importante hoy</h2>
              <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm leading-relaxed">{content!.top.map((t, i) => <li key={i}>{t}</li>)}</ul>
            </section>
          )}
          {all.length > 0 && (
            <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0 [scrollbar-width:none]" role="navigation" aria-label="Filtros">
              <Link href={href({ tema: undefined, negocio: undefined, tipo: undefined })} className={chip(!filtered)}>Todas</Link>
              {businesses.map((b) => <Link key={b} href={href({ negocio: sp.negocio === b ? undefined : b })} className={chip(sp.negocio === b)}>{b}</Link>)}
              {topics.map((t) => <Link key={t.id} href={href({ tema: sp.tema === t.id ? undefined : t.id })} className={chip(sp.tema === t.id)}>{t.name}</Link>)}
              {kinds.length > 1 && kinds.map((k) => <Link key={k} href={href({ tipo: sp.tipo === k ? undefined : k })} className={chip(sp.tipo === k)}>{k}</Link>)}
            </div>
          )}
          {digest!.status === "empty" && <p className="text-sm text-muted">Hoy nada ha pasado el filtro de utilidad. Estas son las tres más cercanas:</p>}
          {items.length === 0 && <p className="text-sm text-muted">{filtered ? "Ninguna noticia con ese filtro." : "No hay noticias nuevas en tus fuentes. Revisa Ajustes → Noticias."}</p>}
          <div className="flex flex-col gap-3">
            {items.map((it, i) => <NewsCard key={it.itemId} item={it} featured={i === 0 && !filtered} initialFeedback={feedbackOf.get(it.itemId) ?? null} />)}
          </div>
          {content!.idea && !filtered && (
            <section className="rounded-xl border border-accent/40 bg-accent/10 p-4">
              <h2 className="mb-1 flex items-center gap-2 font-bold"><Lightbulb className="size-5 text-amber-500" aria-hidden />Idea del día</h2>
              <p className="text-[15px] font-semibold leading-snug">{content!.idea.text}</p>
              {content!.idea.why && <p className="mt-1 text-sm text-muted">{content!.idea.why}</p>}
            </section>
          )}
        </>
      )}

      {(history ?? []).length > 0 && !q && (
        <section>
          <h2 className="mb-2 text-sm font-semibold">Días anteriores</h2>
          <div className="flex flex-wrap gap-1.5">
            {history!.filter((h) => h.day !== day).slice(0, 14).map((h) => <Link key={h.day} href={href({ dia: h.day, tema: undefined, negocio: undefined, tipo: undefined })} className={chip(false)}>{formatDate(h.day)}</Link>)}
          </div>
        </section>
      )}
      <p className="text-xs text-muted">Titulares y entradillas de cada medio, con enlace al original. Tipos de fuente: {Object.values(KIND_LABELS).join(", ")}.</p>
    </div>
  );
}
