"use client";

import { AlertTriangle, Check, CheckCircle2, EyeOff, ExternalLink, Loader2, Play, RotateCw, Star, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { confirmAnalysis, deleteVideo, retryAnalysis, setVideoStatus, updateVideo, videoToNote, videoToTask } from "@/app/(app)/favoritos/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { formatDuration } from "@/lib/favorites/url";
import type { VideoCategory, VideoRow } from "@/lib/favorites/data";
import { STATUS_LABELS } from "@/lib/favorites/labels";
import { UploadFull } from "./upload-full";
import { createDraft } from "@/app/(app)/redes/actions";

type Tag = { id: string; name: string; color: string };
type Biz = { id: string; name: string };
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const eur = (micros: number) => (micros / 1_000_000).toLocaleString("es-ES", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const SOURCE = { youtube: "YouTube", tiktok: "TikTok", other: "Enlace" } as const;

function Stars({ n }: { n: number | null }) {
  if (!n) return null;
  return <span className="inline-flex items-center gap-0.5 text-amber-500" role="img" aria-label={`Utilidad ${n} de 5`}>{Array.from({ length: n }, (_, i) => <Star key={i} className="size-3.5 fill-current" aria-hidden />)}</span>;
}

/** En qué se basa el análisis (se ve en cada ficha). */
export const BASIS_LABEL: Record<string, string> = { texto: "texto", texto_portada: "texto y portada", video_completo: "vídeo completo", enlace: "vídeo completo" };
const basisOf = (v: VideoRow) => v.analysis_basis ?? (v.analysis_mode === "video" ? "video_completo" : "texto");

function AnalysisBadge({ v }: { v: VideoRow }) {
  if (v.unavailable && v.analysis_status !== "ready") return <Badge className="text-muted"><EyeOff className="size-3" aria-hidden /> No disponible</Badge>;
  if (v.analysis_status === "ready") return <Badge className="text-good"><CheckCircle2 className="size-3" aria-hidden /> Listo · {BASIS_LABEL[basisOf(v)]}</Badge>;
  const map = {
    pending: <Badge className="text-muted"><Loader2 className="size-3 animate-spin" aria-hidden /> Pendiente de analizar</Badge>,
    analyzing: <Badge className="text-muted"><Loader2 className="size-3 animate-spin" aria-hidden /> Analizando…</Badge>,
    needs_confirm: <Badge className="border-amber-500/50 text-amber-600"><AlertTriangle className="size-3" aria-hidden /> Vídeo largo: confirma el análisis</Badge>,
    error: <Badge className="border-danger/50 text-danger"><AlertTriangle className="size-3" aria-hidden /> Error de análisis</Badge>,
  } as const;
  return map[v.analysis_status as keyof typeof map] ?? null;
}

export function VideoList({ videos, categories, businesses, tags, costs, openId }: {
  videos: VideoRow[]; categories: VideoCategory[]; businesses: Biz[]; tags: Record<string, Tag[]>; costs: Record<string, number>; openId: string | null;
}) {
  const [open, setOpen] = useState<string | null>(openId);
  const router = useRouter();
  // Mientras haya vídeos en cola o analizándose, la lista se actualiza sola cada 4 s (solo con la pantalla visible).
  const working = videos.some((v) => v.analysis_status === "pending" || v.analysis_status === "analyzing");
  useEffect(() => {
    if (!working) return;
    const t = setInterval(() => { if (document.visibilityState === "visible") router.refresh(); }, 4000);
    return () => clearInterval(t);
  }, [working, router]);
  const current = videos.find((v) => v.id === open) ?? null;
  const catName = new Map(categories.map((c) => [c.id, c.name]));
  const bizName = new Map(businesses.map((b) => [b.id, b.name]));

  return (
    <>
      <ul className="grid gap-3 md:grid-cols-2">
        {videos.map((v) => (
          <li key={v.id} className="flex flex-col gap-1">
            <button type="button" onClick={() => setOpen(v.id)} className="flex w-full gap-3 rounded-xl border border-border bg-surface p-3 text-left hover:bg-surface-2">
              <span className="relative block h-20 w-32 shrink-0 overflow-hidden rounded-lg bg-surface-2">
                {v.thumbnail_url
                  // eslint-disable-next-line @next/next/no-img-element -- miniaturas externas (YouTube/TikTok): no pasan por el optimizador de Vercel
                  ? <img src={v.thumbnail_url} alt="" loading="lazy" referrerPolicy="no-referrer" className="size-full object-cover" />
                  : <span className="flex size-full items-center justify-center text-muted"><Play className="size-6" aria-hidden /></span>}
                {v.duration_sec ? <span className="absolute bottom-1 right-1 rounded bg-black/75 px-1 text-[11px] text-white">{formatDuration(v.duration_sec)}</span> : null}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="line-clamp-2 text-sm font-medium">{v.title}</span>
                <span className="truncate text-xs text-muted">{SOURCE[v.source as keyof typeof SOURCE]}{v.channel ? ` · ${v.channel}` : ""}</span>
                {v.summary && <span className="line-clamp-2 text-xs text-muted">{v.summary}</span>}
                <span className="mt-auto flex flex-wrap items-center gap-1.5">
                  <Stars n={v.utility} />
                  {v.category_id && <Badge>{catName.get(v.category_id)}</Badge>}
                  {v.business_id && <Badge className="text-accent">{bizName.get(v.business_id)}</Badge>}
                  <AnalysisBadge v={v} />
                </span>
              </span>
            </button>
            {v.analysis_status === "error" && !v.unavailable && <RetryButton id={v.id} />}
          </li>
        ))}
      </ul>
      {current && <VideoSheet key={current.id} v={current} categories={categories} businesses={businesses} tags={tags[current.id] ?? []} cost={costs[current.id]} onClose={() => setOpen(null)} />}
    </>
  );
}

/** Reintento con un toque desde la tarjeta. */
function RetryButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button type="button" disabled={pending} onClick={() => start(async () => { await retryAnalysis(id); router.refresh(); })}
      className="inline-flex min-h-11 items-center gap-1.5 self-end px-2 text-xs font-medium text-accent md:min-h-9">
      <RotateCw className={pending ? "size-3.5 animate-spin" : "size-3.5"} aria-hidden /> Reintentar análisis
    </button>
  );
}

function VideoSheet({ v, categories, businesses, tags, cost, onClose }: { v: VideoRow; categories: VideoCategory[]; businesses: Biz[]; tags: Tag[]; cost?: number; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [notes, setNotes] = useState(v.notes ?? "");
  const points = strs(v.key_points), actions = strs(v.actions);
  const run = (fn: () => Promise<{ ok: boolean; error?: string; href?: string }>, ok?: string, goTo = false) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) { toast({ message: r.error ?? "No se pudo" }); return; }
      if (ok) toast({ message: ok, ...(r.href ? { actionLabel: "Abrir", onAction: () => router.push(r.href!) } : {}) });
      if (goTo && r.href) router.push(r.href); else router.refresh();
    });

  const remove = () => {
    if (!confirm("¿Eliminar este vídeo de Favoritos?")) return;
    start(async () => { const r = await deleteVideo(v.id); if (!r.ok) { toast({ message: r.error ?? "No se pudo eliminar" }); return; } toast({ message: "Vídeo eliminado" }); onClose(); router.refresh(); });
  };

  return (
    <Sheet open onClose={onClose} title={SOURCE[v.source as keyof typeof SOURCE]}>
      <div className="flex flex-col gap-4 text-sm">
        <div>
          <h3 className="text-base font-semibold leading-snug">{v.title}</h3>
          <p className="mt-1 text-xs text-muted">{v.channel}{v.duration_sec ? ` · ${formatDuration(v.duration_sec)}` : ""}{v.origin_list ? ` · desde «${v.origin_list}»` : ""}</p>
          <a href={v.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex min-h-11 items-center gap-1.5 text-accent underline md:min-h-9"><ExternalLink className="size-4" aria-hidden /> Abrir el vídeo</a>
        </div>

        {v.analysis_status === "needs_confirm" && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-3">
            <p>Este vídeo dura {formatDuration(v.duration_sec)}. Analizarlo entero cuesta aproximadamente <strong>{cost != null ? eur(cost) : "?"}</strong> de tu presupuesto de IA.</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button disabled={pending} onClick={() => run(() => confirmAnalysis(v.id, "video"), "Analizado ✔")}>Analizar entero</Button>
              <Button variant="secondary" disabled={pending} onClick={() => run(() => confirmAnalysis(v.id, "light"), "Análisis ligero hecho ✔")}>Análisis ligero (casi gratis)</Button>
            </div>
            <p className="mt-2 text-xs text-muted">El ligero se basa solo en el título, el autor y la descripción.</p>
          </div>
        )}
        {v.analysis_status === "error" && (
          <div className="rounded-xl border border-danger/40 bg-danger/5 p-3"><p>{v.analysis_error ?? "No se pudo analizar."}</p>{!v.unavailable && <Button className="mt-2" variant="secondary" disabled={pending} onClick={() => run(() => retryAnalysis(v.id), "Reintentando…")}>Reintentar</Button>}</div>
        )}
        {v.analysis_status === "analyzing" && <p className="text-muted">Analizando…</p>}
        {v.analysis_status === "pending" && <p className="text-muted">En la cola de análisis (los vídeos se analizan de uno en uno). {v.analysis_error ? v.analysis_error : "Se hace solo en unos minutos."}</p>}

        {v.summary && (
          <section>
            <h4 className="mb-1 font-semibold">Resumen</h4>
            <p className="leading-relaxed">{v.summary}</p>
            <p className="mt-1 text-xs text-muted">Análisis basado en: <strong>{BASIS_LABEL[basisOf(v)]}</strong>{basisOf(v) === "video_completo" ? "." : basisOf(v) === "texto_portada" ? " (descripción, hashtags, autor y portada; la IA no ha visto el vídeo)." : " (título, autor y descripción; la IA no ha visto el vídeo)."}</p>
          </section>
        )}
        {points.length > 0 && <section><h4 className="mb-1 font-semibold">Puntos clave</h4><ul className="list-disc space-y-1 pl-5">{points.map((p) => <li key={p}>{p}</li>)}</ul></section>}
        {actions.length > 0 && <section><h4 className="mb-1 font-semibold">Ideas para aplicar</h4><ul className="list-disc space-y-1 pl-5">{actions.map((p) => <li key={p}>{p}</li>)}</ul></section>}
        {v.business_reason && <section><h4 className="mb-1 font-semibold">Útil para tu negocio</h4><p>{v.business_reason}</p></section>}
        {tags.length > 0 && <div className="flex flex-wrap gap-1.5">{tags.map((t) => <Badge key={t.id} color={t.color}>{t.name}</Badge>)}</div>}

        {v.source !== "youtube" && basisOf(v) !== "video_completo" && !v.upload_path && <UploadFull videoId={v.id} />}

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs text-muted">Estado
            <select defaultValue={v.status} onChange={(e) => run(() => setVideoStatus(v.id, e.target.value as keyof typeof STATUS_LABELS))} className="min-h-11 rounded-lg border border-border bg-surface px-2 text-base text-foreground md:min-h-9 md:text-sm">
              {Object.entries(STATUS_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">Categoría
            <select defaultValue={v.category_id ?? ""} onChange={(e) => run(() => updateVideo(v.id, { category_id: e.target.value || null }))} className="min-h-11 rounded-lg border border-border bg-surface px-2 text-base text-foreground md:min-h-9 md:text-sm">
              <option value="">Sin categoría</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted sm:col-span-2">Negocio
            <select defaultValue={v.business_id ?? ""} onChange={(e) => run(() => updateVideo(v.id, { business_id: e.target.value || null }))} className="min-h-11 rounded-lg border border-border bg-surface px-2 text-base text-foreground md:min-h-9 md:text-sm">
              <option value="">Ninguno</option>{businesses.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
        </div>
        <label className="flex flex-col gap-1 text-xs text-muted">Mis notas
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== (v.notes ?? "") && run(() => updateVideo(v.id, { notes: notes || null }))} rows={3} maxLength={5000} className="rounded-lg border border-border bg-surface p-2 text-base text-foreground md:text-sm" />
        </label>
        {v.analysis_status === "ready" && notes.trim() && !v.unavailable && (
          <Button variant="secondary" disabled={pending} onClick={() => run(async () => { if (notes !== (v.notes ?? "")) await updateVideo(v.id, { notes }); return retryAnalysis(v.id); }, "Reanalizando con tu nota…")}>Volver a analizar con mi nota</Button>
        )}

        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" disabled={pending} onClick={() => run(() => videoToTask(v.id), "Tarea creada ✔")}><Check className="size-4" aria-hidden /> Convertir en tarea</Button>
          <Button variant="secondary" disabled={pending} onClick={() => run(() => videoToNote(v.id), "Nota creada ✔")}>Guardar como nota</Button>
          <Button variant="secondary" disabled={pending} onClick={() => start(async () => { const r = await createDraft({ videoId: v.id }); if (r.ok) router.push(`/redes?vista=publicaciones&abrir=${r.id}`); else toast({ message: r.error }); })}>Usar como idea</Button>
          <button type="button" disabled={pending} onClick={remove} className="inline-flex min-h-11 items-center gap-1.5 px-2 text-sm text-muted hover:text-danger md:min-h-9"><Trash2 className="size-4" aria-hidden /> Eliminar</button>
        </div>
      </div>
    </Sheet>
  );
}
