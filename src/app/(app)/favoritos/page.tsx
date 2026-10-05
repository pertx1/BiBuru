import Link from "next/link";
import { Video } from "lucide-react";
import { z } from "zod";
import { BudgetBanner } from "@/components/ai/budget-banner";
import { AddVideoForm } from "@/components/favorites/add-video-form";
import { CategoriesManager } from "@/components/favorites/categories-manager";
import { VideoList } from "@/components/favorites/video-list";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { getContext } from "@/lib/context";
import { listFavorites } from "@/lib/favorites/data";
import { STATUS_LABELS } from "@/lib/favorites/labels";
import { cn } from "@/lib/utils";

export const metadata = { title: "Favoritos" };
type SP = { estado?: string; cat?: string; neg?: string; q?: string; orden?: string; abrir?: string };

export default async function FavoritosPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const uuid = z.uuid();
  const f = {
    estado: sp.estado === "todos" || (sp.estado && sp.estado in STATUS_LABELS) ? sp.estado : "por_ver",
    cat: sp.cat === "none" ? "none" : uuid.safeParse(sp.cat).success ? sp.cat! : "",
    neg: uuid.safeParse(sp.neg).success ? sp.neg! : "",
    q: (sp.q ?? "").slice(0, 100),
    orden: sp.orden === "fecha" ? ("fecha" as const) : ("util" as const),
  };
  const { supabase, workspaceId } = await getContext();
  const [{ videos, tags, byStatus, byCat, categories, costs }, biz] = await Promise.all([
    listFavorites(f),
    supabase.from("businesses").select("id, name").eq("workspace_id", workspaceId).eq("archived", false).order("name"),
  ]);
  const href = (patch: Partial<SP>) => {
    const p = new URLSearchParams();
    const m = { ...f, ...patch } as Record<string, string>;
    for (const [k, v] of Object.entries(m)) if (v && !(k === "estado" && v === "por_ver") && !(k === "orden" && v === "util")) p.set(k, v);
    return `/favoritos${p.size ? `?${p}` : ""}`;
  };
  const chip = (active: boolean) => cn("inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm", active ? "border-accent bg-accent text-accent-foreground" : "border-border bg-surface hover:bg-surface-2");
  const businesses = biz.data ?? [];
  const opened = uuid.safeParse(sp.abrir).success ? sp.abrir! : null;

  return (
    <>
      <PageHeader title="Favoritos" subtitle="Vídeos guardados, resumidos y listos para aplicar." />
      <BudgetBanner />
      <AddVideoForm />

      <nav aria-label="Estado" className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
        {(["por_ver", "visto", "aplicado", "archivado", "todos"] as const).map((s) => (
          <Link key={s} href={href({ estado: s })} className={chip(f.estado === s)} aria-current={f.estado === s ? "page" : undefined}>
            {s === "todos" ? "Todos" : STATUS_LABELS[s]} <span className="text-xs opacity-70">{byStatus[s]}</span>
          </Link>
        ))}
      </nav>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <nav aria-label="Categorías" className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1">
          <Link href={href({ cat: "" })} className={chip(!f.cat)}>Todas</Link>
          {categories.map((c) => <Link key={c.id} href={href({ cat: c.id })} className={chip(f.cat === c.id)}>{c.pinned && "📌 "}{c.name} <span className="text-xs opacity-70">{byCat[c.id] ?? 0}</span></Link>)}
          <Link href={href({ cat: "none" })} className={chip(f.cat === "none")}>Sin categoría</Link>
        </nav>
        <CategoriesManager categories={categories} counts={byCat} />
      </div>

      <form method="get" action="/favoritos" className="mt-3 flex flex-wrap gap-2" role="search">
        {f.estado !== "por_ver" && <input type="hidden" name="estado" value={f.estado} />}
        {f.cat && <input type="hidden" name="cat" value={f.cat} />}
        <input type="search" name="q" defaultValue={f.q} placeholder="Buscar en vídeos…" aria-label="Buscar en vídeos" className="min-h-11 min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 text-base outline-none focus:border-accent md:min-h-9 md:text-sm" />
        <select name="neg" defaultValue={f.neg} aria-label="Negocio" className="min-h-11 rounded-lg border border-border bg-surface px-2 text-base md:min-h-9 md:text-sm">
          <option value="">Todos los negocios</option>{businesses.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <select name="orden" defaultValue={f.orden} aria-label="Orden" className="min-h-11 rounded-lg border border-border bg-surface px-2 text-base md:min-h-9 md:text-sm">
          <option value="util">Más útiles primero</option><option value="fecha">Más recientes primero</option>
        </select>
        <button type="submit" className="min-h-11 rounded-lg border border-border bg-surface px-4 text-sm hover:bg-surface-2 md:min-h-9">Filtrar</button>
      </form>

      <div className="mt-4">
        {videos.length === 0 ? (
          <EmptyState icon={Video} title={f.q || f.cat || f.neg || f.estado !== "por_ver" ? "Nada con estos filtros" : "Aún no hay vídeos"}>
            Pega un enlace de YouTube o TikTok arriba, o conecta tu cuenta de YouTube en Ajustes para traer tus «Me gusta».
          </EmptyState>
        ) : (
          <VideoList videos={videos} categories={categories} businesses={businesses} tags={Object.fromEntries([...tags].map(([k, v]) => [k, v.map((t) => ({ id: t.id, name: t.name, color: t.color }))]))} costs={costs} openId={opened} />
        )}
      </div>
    </>
  );
}
