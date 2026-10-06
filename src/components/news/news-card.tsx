"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ExternalLink, FileText, ListPlus, ThumbsDown, ThumbsUp } from "lucide-react";
import { newsToNote, newsToTask, setNewsFeedback } from "@/app/(app)/noticias/actions";
import { useToast } from "@/components/ui/toast";
import type { DigestItem } from "@/lib/news/digest";
import { cn } from "@/lib/utils";
import { NewsImage } from "./news-image";

/** Tarjeta de noticia: foto, titular, resumen, fuente con enlace, etiqueta, negocio, «Qué puedes hacer» y acciones. */
export function NewsCard({ item, featured, initialFeedback }: { item: DigestItem; featured?: boolean; initialFeedback: string | null }) {
  const router = useRouter();
  const toast = useToast();
  const [feedback, setFeedback] = useState(initialFeedback);
  const [pending, start] = useTransition();
  const color = item.topic?.color ?? "#7b6cf6";
  const payload = { itemId: item.itemId, title: item.title, url: item.url, action: item.action, summary: item.summary, outlet: item.outlet ?? item.author, business: item.business };
  const mark = (f: "useful" | "hidden") => {
    const next = feedback === f ? null : f;
    setFeedback(next);
    start(async () => { const r = await setNewsFeedback(item.itemId, next); if (!r.ok) { setFeedback(feedback); toast({ message: r.error }); } else if (next === "hidden") toast({ message: "Anotado: menos noticias como esta" }); });
  };
  const create = (fn: typeof newsToTask, ok: string) => start(async () => { const r = await fn(payload); toast(r.ok ? { message: ok, ...(r.href ? { actionLabel: "Abrir", onAction: () => router.push(r.href!) } : {}) } : { message: r.error }); });
  const btn = "flex min-h-11 items-center gap-1.5 rounded-full border border-border px-3.5 text-xs font-medium disabled:opacity-50";

  return (
    <article className={cn("flex flex-col gap-3 rounded-xl border border-border bg-surface p-4", feedback === "hidden" && "opacity-50")}>
      <div className={featured ? "flex flex-col gap-3" : "flex gap-3"}>
        <NewsImage src={item.imageUrl} outlet={item.outlet ?? item.author} color={color} icon={item.topic?.icon ?? "newspaper"} hero={featured} />
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
            {item.topic && <span className="rounded-full px-2 py-0.5" style={{ background: `${color}22`, color }}>{item.topic.name}</span>}
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-muted">{item.label}</span>
            {item.unverified && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-amber-600 dark:text-amber-400">No contrastado</span>}
            {item.business && <span className="rounded-full bg-accent/15 px-2 py-0.5 text-accent">{item.business}</span>}
            {item.score != null && <span className="text-muted" aria-label={`Utilidad ${item.score} de 5`}>{"★".repeat(item.score)}</span>}
          </div>
          <h3 className={cn("font-bold leading-snug", featured ? "text-xl" : "text-[15px]")}>
            <a href={item.url} target="_blank" rel="noopener noreferrer" className="hover:underline">{item.title}</a>
          </h3>
          <p className="mt-0.5 text-xs text-muted">
            {item.outlet ?? item.author ?? "Fuente"}{item.author && item.outlet && item.author !== item.outlet ? ` · ${item.author}` : ""}{item.coverage > 1 ? ` · también en ${item.coverage - 1} ${item.coverage === 2 ? "fuente más" : "fuentes más"}` : ""}
          </p>
        </div>
      </div>
      {item.summary && <p className="text-sm leading-relaxed">{item.summary}</p>}
      {item.action && <p className="rounded-lg bg-accent/10 px-3 py-2 text-sm"><span className="font-semibold text-accent">Qué puedes hacer: </span>{item.action}</p>}
      <div className="flex flex-wrap gap-1.5">
        <button type="button" className={btn} disabled={pending} onClick={() => create(newsToTask, "Tarea creada")} aria-label="Convertir en tarea"><ListPlus className="size-4" aria-hidden />Tarea</button>
        <button type="button" className={btn} disabled={pending} onClick={() => create(newsToNote, "Nota guardada")} aria-label="Guardar como nota"><FileText className="size-4" aria-hidden />Nota</button>
        <button type="button" className={cn(btn, feedback === "useful" && "border-good text-good")} aria-pressed={feedback === "useful"} disabled={pending} onClick={() => mark("useful")} aria-label="Útil"><ThumbsUp className="size-4" aria-hidden />Útil</button>
        <button type="button" className={cn(btn, "px-3", feedback === "hidden" && "border-bad text-bad")} aria-pressed={feedback === "hidden"} disabled={pending} onClick={() => mark("hidden")} aria-label="No me interesa" title="No me interesa"><ThumbsDown className="size-4" aria-hidden /></button>
        <a href={item.url} target="_blank" rel="noopener noreferrer" className={cn(btn, "ml-auto px-3")} aria-label="Abrir la noticia original" title="Abrir el original"><ExternalLink className="size-4" aria-hidden /></a>
      </div>
    </article>
  );
}
