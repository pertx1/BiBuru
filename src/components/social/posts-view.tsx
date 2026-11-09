"use client";

import { AlertTriangle, CalendarClock, CheckCircle2, Copy, ImagePlus, Loader2, RotateCw, Send, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { createDraft, deletePost, deleteSocialFile, duplicatePost, prepareSocialUpload, registerSocialFile, retryTarget, savePost } from "@/app/(app)/redes/actions";
import { Button } from "@/components/ui/button";
import { Field, Select, Textarea } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { createClient } from "@/lib/supabase/client";
import { tiktokModeFor } from "@/lib/social/tiktok-mode";
import { captionFor } from "@/lib/social/stats";
import { checkCaption, checkMedia } from "@/lib/social/validate";
import { cn } from "@/lib/utils";

type Target = { id: string; account_id: string; mode: string; status: string; error: string | null; permalink: string | null; privacy: string | null; published_at: string | null; external_id: string | null; next_try_at: string | null };
type Metric = { views: number | null; likes: number | null; comments: number | null; shares: number | null; saves: number | null };
type FileR = { id: string; path: string; mime: string; size_bytes: number; position: number; deleted_at: string | null };
type Post = { id: string; title: string | null; caption: string; hashtags: string; caption_instagram: string | null; caption_tiktok: string | null; media_kind: string; scheduled_at: string | null; status: string; business_id: string | null; notes: string | null; source_video_id: string | null; social_post_targets: Target[]; social_post_files: FileR[] };
type Acc = { id: string; platform: string; username: string | null; status: string; scopes: string | null };

export const POST_STATUS: Record<string, { label: string; cls: string }> = {
  borrador: { label: "Borrador", cls: "border-border text-muted" }, programada: { label: "Programada", cls: "border-accent/50 text-accent" },
  publicando: { label: "Publicando", cls: "border-amber-500/50 text-amber-600 dark:text-amber-400" }, publicada: { label: "Hecha", cls: "border-good/50 text-good" }, error: { label: "Error", cls: "border-bad/50 text-bad" },
};
const TARGET: Record<string, string> = { pendiente: "Pendiente", publicando: "Publicando…", publicada: "Publicada", enviada: "Enviado a TikTok – pendiente de publicar en la app", avisada: "Aviso enviado", error: "Error" };
const MODE: Record<string, string> = { direct: "publicación directa", draft: "se envía a TikTok como borrador para terminarlo allí", assisted: "te aviso a la hora con el vídeo y el texto listos" };
const mb = (b: number) => `${(b / 1024 / 1024).toFixed(b > 100 * 1024 * 1024 ? 0 : 1)} MB`;
const local = (iso: string | null) => {
  if (!iso) return { date: "", time: "" };
  const d = new Date(iso);
  return { date: d.toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" }), time: d.toLocaleTimeString("es-ES", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }) };
};

/** Publicaciones: lista con su estado por red, y editor (fotos/vídeos, texto, hashtags, cuentas, fecha y hora). */
const FILTERS = { todas: "Todas", programadas: "Programadas", borradores: "Borradores", tiktok: "Falta publicar en TikTok", error: "Con error", hechas: "Publicadas" } as const;
type Filter = keyof typeof FILTERS;
const inFilter = (p: Post, f: Filter) =>
  f === "todas" || (f === "programadas" && (p.status === "programada" || p.status === "publicando")) || (f === "borradores" && p.status === "borrador")
  || (f === "error" && (p.status === "error" || p.social_post_targets.some((t) => t.status === "error"))) || (f === "hechas" && p.status === "publicada")
  || (f === "tiktok" && p.social_post_targets.some((t) => t.status === "enviada" || t.status === "avisada"));

export function PostsView({ posts, accounts, businesses, today, openId, used, limit, metrics = {}, businessId = null }: { posts: Post[]; accounts: Acc[]; businesses: { id: string; name: string }[]; today: string; openId: string | null; used: number; limit: number; metrics?: Record<string, Metric>; businessId?: string | null }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState<string | null>(openId);
  const [pending, start] = useTransition();
  const accById = new Map(accounts.map((a) => [a.id, a]));
  const current = posts.find((p) => p.id === open) ?? null;
  const [filter, setFilter] = useState<Filter>("todas");
  const shown = posts.filter((p) => inFilter(p, filter));
  const upcoming = shown.filter((p) => p.status !== "publicada").sort((a, b) => (a.scheduled_at ?? "9").localeCompare(b.scheduled_at ?? "9"));
  const done = shown.filter((p) => p.status === "publicada");

  const Row = ({ p }: { p: Post }) => {
    const when = local(p.scheduled_at);
    return (
      <li>
        <button type="button" onClick={() => setOpen(p.id)} className="flex min-h-16 w-full items-center gap-3 px-4 py-2 text-left hover:bg-surface-2">
          <CalendarClock className="size-4 shrink-0 text-muted" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{p.title || p.caption.slice(0, 60) || "(sin texto)"}</span>
            <span className="block truncate text-xs text-muted">{when.date ? `${when.date.split("-").reverse().join("/")} ${when.time}` : "Sin fecha"} · {p.social_post_targets.map((t) => `${accById.get(t.account_id)?.platform === "tiktok" ? "TikTok" : "IG"}: ${TARGET[t.status] ?? t.status}`).join(" · ") || "sin cuentas"}</span>
          </span>
          {p.social_post_targets.some((t) => t.status === "enviada") && <span className="shrink-0 rounded-full border border-amber-500/50 px-2 py-0.5 text-xs font-semibold text-amber-600 dark:text-amber-400">Publícalo en TikTok</span>}
          <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold", POST_STATUS[p.status]?.cls)}>{POST_STATUS[p.status]?.label ?? p.status}</span>
        </button>
      </li>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button disabled={pending} onClick={() => start(async () => { const r = await createDraft({ businessId }); if (r.ok) { setOpen(r.id); router.refresh(); } else toast({ message: r.error }); })}><ImagePlus className="size-4" aria-hidden /> Nueva publicación</Button>
        <div className="min-w-48 flex-1 text-right text-xs text-muted md:flex-none">
          Espacio para archivos: {mb(used)} de {mb(limit)} · quedan {mb(Math.max(0, limit - used))}
          <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-surface-2"><span className={cn("block h-full rounded-full", used / limit > 0.8 ? "bg-bad" : "bg-income")} style={{ width: `${Math.min(100, (used / limit) * 100)}%` }} /></span>
        </div>
      </div>
      {accounts.some((a) => a.platform === "tiktok") && <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs">TikTok: mientras TikTok no audite la app, lo que se publique por la API queda <strong>privado (solo tú lo ves)</strong>. Por eso BiBuru lo envía como borrador a tu TikTok o te avisa para publicarlo tú: así sale público.</p>}
      <nav aria-label="Filtrar publicaciones" className="-mx-4 flex gap-1.5 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0">
        {(Object.keys(FILTERS) as Filter[]).map((k) => {
          const n = posts.filter((p) => inFilter(p, k)).length;
          if (k !== "todas" && !n) return null;
          return <button key={k} type="button" onClick={() => setFilter(k)} aria-pressed={filter === k} className={cn("flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm md:min-h-9", filter === k ? "bg-accent text-accent-foreground" : "bg-fill")}>{FILTERS[k]} <span className="tabular-nums opacity-80">{n}</span></button>;
        })}
      </nav>
      <section><h2 className="mb-2 text-sm font-semibold">Próximas y borradores</h2>
        {upcoming.length ? <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">{upcoming.map((p) => <Row key={p.id} p={p} />)}</ul> : <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted">Nada programado. Pulsa «Nueva publicación» o «Usar como idea» en un vídeo de Favoritos.</p>}
      </section>
      {done.length > 0 && <section><h2 className="mb-2 text-sm font-semibold">Hechas</h2><ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">{done.slice(0, 30).map((p) => <Row key={p.id} p={p} />)}</ul></section>}
      {current && <PostEditor key={current.id} post={current} accounts={accounts} businesses={businesses} today={today} metrics={metrics} onOpen={(id) => { setOpen(id); router.refresh(); }} onClose={() => { setOpen(null); router.refresh(); }} />}
    </div>
  );
}

/** Foto → JPEG (Instagram por API solo publica JPEG). Los PNG se convierten en el móvil antes de subirlos. */
async function toJpeg(file: File): Promise<File> {
  const bmp = await createImageBitmap(file);
  const c = document.createElement("canvas");
  c.width = bmp.width; c.height = bmp.height;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(bmp, 0, 0);
  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.92));
  return blob ? new File([blob], file.name.replace(/\.png$/i, ".jpg"), { type: "image/jpeg" }) : file;
}

/** Duración y tamaño en píxeles de una foto o un vídeo, leídos en el navegador sin subir nada. */
async function readMeta(file: File): Promise<{ durationSec: number | null; width: number | null; height: number | null }> {
  const url = URL.createObjectURL(file);
  try {
    if (file.type.startsWith("video/")) {
      const v = document.createElement("video");
      v.preload = "metadata"; v.muted = true; v.src = url;
      await new Promise<void>((ok) => { v.onloadedmetadata = () => ok(); v.onerror = () => ok(); setTimeout(ok, 8000); });
      return { durationSec: Number.isFinite(v.duration) ? v.duration : null, width: v.videoWidth || null, height: v.videoHeight || null };
    }
    const bmp = await createImageBitmap(file).catch(() => null);
    return { durationSec: null, width: bmp?.width ?? null, height: bmp?.height ?? null };
  } finally { URL.revokeObjectURL(url); }
}

const n = (v: number | null) => (v == null ? "–" : v.toLocaleString("es-ES"));

function PostEditor({ post, accounts, businesses, today, metrics, onOpen, onClose }: { post: Post; accounts: Acc[]; businesses: { id: string; name: string }[]; today: string; metrics: Record<string, Metric>; onOpen: (id: string) => void; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [uploading, setUploading] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const locked = post.status === "publicando" || post.status === "publicada";
  const when = local(post.scheduled_at);
  const [split, setSplit] = useState(!!(post.caption_instagram || post.caption_tiktok));
  const [f, setF] = useState({ capIg: post.caption_instagram ?? "", capTt: post.caption_tiktok ?? "", title: post.title ?? "", caption: post.caption, hashtags: post.hashtags, kind: post.media_kind, date: when.date || today, time: when.time || "19:00", business: post.business_id ?? "", notes: post.notes ?? "" });
  const [targets, setTargets] = useState<string[]>(post.social_post_targets.map((t) => t.account_id));
  const files = post.social_post_files.filter((x) => !x.deleted_at).sort((a, b) => a.position - b.position);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const tiktokSel = accounts.filter((a) => a.platform === "tiktok" && targets.includes(a.id));

  useEffect(() => {
    let alive = true;
    const sb = createClient();
    Promise.all(files.map(async (x) => [x.id, (await sb.storage.from("social-media").createSignedUrl(x.path, 3600)).data?.signedUrl ?? ""] as const)).then((r) => { if (alive) setPreviews(Object.fromEntries(r)); });
    return () => { alive = false; };
  }, [post.social_post_files]); // eslint-disable-line react-hooks/exhaustive-deps

  async function upload(list: FileList | null) {
    if (!list?.length) return;
    const sb = createClient();
    for (const original of [...list].slice(0, 10)) {
      setUploading((n) => n + 1);
      try {
        let file = original.type === "image/png" ? await toJpeg(original).catch(() => original) : original;
        if (file.type === "image/jpg") file = new File([file], file.name, { type: "image/jpeg" });
        // iPhone a veces da el vídeo sin tipo: por la extensión.
        if (!file.type && /\.(mov|mp4)$/i.test(file.name)) file = new File([file], file.name, { type: /\.mov$/i.test(file.name) ? "video/quicktime" : "video/mp4" });
        const check = checkMedia({ mime: file.type, size: file.size, ...(await readMeta(file)) }, { tiktok: tiktokSel.length > 0 });
        if (check.errors.length) { toast({ message: `${original.name}: ${check.errors[0]}` }); continue; }
        if (check.warnings.length) toast({ message: `${original.name}: ${check.warnings.join(" ")}` });
        const mime = file.type;
        const prep = await prepareSocialUpload(post.id, { name: file.name, size: file.size, mime });
        if (!prep.ok) { toast({ message: prep.error }); continue; }
        const up = await sb.storage.from("social-media").upload(prep.path, file, { contentType: mime, upsert: false });
        if (up.error) { toast({ message: "No se pudo subir el archivo" }); continue; }
        const r = await registerSocialFile({ postId: post.id, path: prep.path, mime, size: file.size });
        if (!r.ok) toast({ message: r.error });
      } finally { setUploading((n) => n - 1); }
    }
    router.refresh();
  }

  const save = (schedule: boolean, now = false) => start(async () => {
    if (now && !confirm("¿Publicar ahora en las cuentas elegidas?")) return;
    const r = await savePost({ id: post.id, title: f.title, caption: f.caption, hashtags: f.hashtags, mediaKind: f.kind as "image", date: f.date, time: f.time, accountIds: targets, schedule, now, businessId: f.business || null, notes: f.notes,
      captionInstagram: split ? f.capIg : null, captionTiktok: split ? f.capTt : null });
    if (!r.ok) { toast({ message: r.error }); return; }
    toast({ message: now ? "Publicando… (Instagram tarda 1–5 min en procesar el vídeo)" : schedule ? "Programada ✔" : "Borrador guardado" });
    onClose();
  });
  const duplicate = () => start(async () => {
    const r = await duplicatePost(post.id);
    if (!r.ok) { toast({ message: r.error }); return; }
    toast({ message: r.missing ? "Duplicada. Los archivos ya se habían borrado al publicarse: vuelve a subirlos." : "Duplicada como borrador" });
    onOpen(r.id);
  });
  const texts = { caption: f.caption, hashtags: f.hashtags, caption_instagram: split ? f.capIg : null, caption_tiktok: split ? f.capTt : null };
  const capProblems = [...new Set((["instagram", "tiktok"] as const).flatMap((net) => checkCaption(captionFor(texts, net)).errors))];
  const first = files[0];
  const firstAcc = accounts.find((a) => targets.includes(a.id));

  return (
    <Sheet open onClose={onClose} title={locked ? "Publicación" : "Editar publicación"} variant="panel">
      <div className="flex flex-col gap-4 text-sm">
        {post.social_post_targets.length > 0 && (
          <ul className="flex flex-col gap-1.5">
            {post.social_post_targets.map((t) => {
              const a = accounts.find((x) => x.id === t.account_id);
              return (
                <li key={t.id} className={cn("flex flex-wrap items-center gap-2 rounded-lg border p-2 text-xs", t.status === "error" ? "border-bad/40 bg-bad/5" : "border-border")}>
                  {t.status === "publicada" || t.status === "enviada" || t.status === "avisada" ? <CheckCircle2 className="size-4 text-good" aria-hidden /> : t.status === "error" ? <AlertTriangle className="size-4 text-bad" aria-hidden /> : <Loader2 className={cn("size-4 text-muted", t.status === "publicando" && "animate-spin")} aria-hidden />}
                  <span className="font-medium">{a?.platform === "tiktok" ? "TikTok" : "Instagram"} @{a?.username}</span>
                  <span className="text-muted">{TARGET[t.status] ?? t.status}{t.privacy === "SELF_ONLY" ? " · privado (solo tú)" : ""}</span>
                  {t.permalink && <a href={t.permalink} target="_blank" rel="noopener noreferrer" className="text-accent underline">Ver</a>}
                  {t.error && <span className={cn("w-full", t.status === "error" ? "text-bad" : "text-muted")}>{t.error}{t.status === "pendiente" && t.next_try_at ? ` (siguiente intento: ${local(t.next_try_at).time})` : ""}</span>}
                  {t.external_id && metrics[`${t.account_id}:${t.external_id}`] && (() => { const m = metrics[`${t.account_id}:${t.external_id}`]; return <span className="w-full text-muted">👁 {n(m.views)} · ❤️ {n(m.likes)} · 💬 {n(m.comments)} · ↗ {n(m.shares)}{m.saves != null ? ` · 🔖 ${n(m.saves)}` : ""}</span>; })()}
                  {t.status === "enviada" && <button type="button" onClick={() => { void navigator.clipboard?.writeText(captionFor(post, "tiktok")); toast({ message: "Texto copiado: pégalo al publicar el borrador en TikTok" }); }} className="inline-flex min-h-11 items-center gap-1 text-accent md:min-h-8"><Copy className="size-3.5" aria-hidden /> Copiar texto para TikTok</button>}
                  {t.status === "error" && <button type="button" onClick={() => start(async () => { await retryTarget(t.id); router.refresh(); })} className="inline-flex min-h-11 items-center gap-1 text-accent md:min-h-8"><RotateCw className="size-3.5" aria-hidden /> Reintentar</button>}
                </li>
              );
            })}
          </ul>
        )}
        <fieldset disabled={locked} className="flex flex-col gap-4">
          <div>
            <p className="mb-1.5 text-xs text-muted">Fotos o vídeo ({files.length}/10) · JPG, PNG, MP4 o MOV, máx. 50 MB</p>
            <div className="flex flex-wrap gap-2">
              {files.map((x) => (
                <div key={x.id} className="relative size-24 overflow-hidden rounded-lg border border-border bg-surface-2">
                  {previews[x.id] && (x.mime.startsWith("video/") ? <video src={previews[x.id]} muted playsInline className="size-full object-cover" /> : // eslint-disable-next-line @next/next/no-img-element -- archivo propio con URL firmada
                    <img src={previews[x.id]} alt="" className="size-full object-cover" />)}
                  {!locked && <button type="button" aria-label="Quitar archivo" onClick={() => start(async () => { await deleteSocialFile(x.id); router.refresh(); })} className="absolute right-0 top-0 flex size-9 items-center justify-center bg-black/60 text-white"><Trash2 className="size-4" aria-hidden /></button>}
                </div>
              ))}
              {!locked && files.length < 10 && (
                <button type="button" onClick={() => fileInput.current?.click()} className="flex size-24 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border text-xs text-muted">
                  {uploading ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <ImagePlus className="size-5" aria-hidden />}{uploading ? "Subiendo…" : "Añadir"}
                </button>
              )}
            </div>
            <input ref={fileInput} type="file" multiple accept="image/jpeg,image/png,video/mp4,video/quicktime" className="sr-only" aria-label="Archivos" onChange={(e) => void upload(e.target.files)} />
          </div>
          {first && previews[first.id] && (
            <figure aria-label="Vista previa en el móvil" className="relative mx-auto aspect-[9/16] w-48 overflow-hidden rounded-[1.5rem] border-4 border-foreground/80 bg-black text-white shadow-lg">
              {first.mime.startsWith("video/") ? <video src={previews[first.id]} muted loop autoPlay playsInline className="size-full object-cover" /> : // eslint-disable-next-line @next/next/no-img-element -- archivo propio con URL firmada
                <img src={previews[first.id]} alt="" className="size-full object-cover" />}
              <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 pt-8 text-[11px] leading-snug">
                <strong className="block">@{firstAcc?.username ?? "tu_cuenta"}</strong>
                <span className="line-clamp-3">{captionFor(texts, firstAcc?.platform === "tiktok" ? "tiktok" : "instagram")}</span>
              </figcaption>
              {files.length > 1 && <span className="absolute right-2 top-2 rounded-full bg-black/60 px-2 text-[11px]">1/{files.length}</span>}
            </figure>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tipo" htmlFor="sp-kind"><Select id="sp-kind" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}><option value="image">Foto</option><option value="carousel">Carrusel (2–10)</option><option value="reel">Reel / vídeo</option></Select></Field>
            <Field label="Negocio" htmlFor="sp-biz"><Select id="sp-biz" value={f.business} onChange={(e) => setF({ ...f, business: e.target.value })}><option value="">Ninguno</option>{businesses.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select></Field>
          </div>
          <Field label="Título interno (opcional)" htmlFor="sp-title"><Input id="sp-title" value={f.title} maxLength={120} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
          <Field label={`Texto (${f.caption.length}/2200)`} htmlFor="sp-cap"><Textarea id="sp-cap" value={f.caption} maxLength={2200} rows={5} onChange={(e) => setF({ ...f, caption: e.target.value })} /></Field>
          <label className="flex min-h-11 items-center gap-2"><input type="checkbox" className="size-5" checked={split} onChange={(e) => setSplit(e.target.checked)} /> Texto distinto para Instagram y TikTok</label>
          {split && <>
            <Field label={`Texto para Instagram (${f.capIg.length}/2200; vacío = el común)`} htmlFor="sp-cap-ig"><Textarea id="sp-cap-ig" value={f.capIg} maxLength={2200} rows={4} onChange={(e) => setF({ ...f, capIg: e.target.value })} /></Field>
            <Field label={`Texto para TikTok (${f.capTt.length}/2200; vacío = el común)`} htmlFor="sp-cap-tt"><Textarea id="sp-cap-tt" value={f.capTt} maxLength={2200} rows={4} onChange={(e) => setF({ ...f, capTt: e.target.value })} /></Field>
          </>}
          <Field label="Hashtags (para todas las redes)" htmlFor="sp-tags"><Input id="sp-tags" value={f.hashtags} maxLength={1000} placeholder="#moda #hechoamano" onChange={(e) => setF({ ...f, hashtags: e.target.value })} /></Field>
          <div>
            <p className="mb-1.5 text-xs text-muted">Publicar en</p>
            {accounts.length === 0 ? <p className="text-xs text-muted">Conecta Instagram o TikTok arriba.</p> : (
              <ul className="flex flex-col gap-1">
                {accounts.map((a) => (
                  <li key={a.id}><label className="flex min-h-11 items-center gap-2"><input type="checkbox" className="size-5" checked={targets.includes(a.id)} onChange={(e) => setTargets((t) => (e.target.checked ? [...t, a.id] : t.filter((x) => x !== a.id)))} />
                    {a.platform === "tiktok" ? "TikTok" : "Instagram"} @{a.username}{a.platform === "tiktok" && <span className="text-xs text-muted">({MODE[tiktokModeFor(a.scopes)]})</span>}</label></li>
                ))}
              </ul>
            )}
            {tiktokSel.some((a) => tiktokModeFor(a.scopes) === "draft") && <p className="mt-1 text-xs text-muted">TikTok (borrador): el vídeo llega a tu bandeja de TikTok sin texto (TikTok no deja mandarlo así); en BiBuru tendrás «Copiar texto para TikTok» y un aviso al móvil.</p>}
            {tiktokSel.length > 0 && f.kind !== "reel" && <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">TikTok necesita un vídeo: elige «Reel / vídeo».</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Fecha" htmlFor="sp-date"><Input id="sp-date" type="date" value={f.date} min={today} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
            <Field label="Hora" htmlFor="sp-time"><Input id="sp-time" type="time" value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} /></Field>
          </div>
          {capProblems.length > 0 && <p role="alert" className="text-xs text-bad">{capProblems.join(" ")}</p>}
          <p className="text-xs text-muted">Hora de Madrid. «Publicar ahora» sale en un momento; lo programado, en los 5 minutos siguientes a la hora.</p>
          {f.notes && <Field label="Notas e ideas" htmlFor="sp-notes"><Textarea id="sp-notes" value={f.notes} rows={4} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>}
        </fieldset>
        {locked && <Button variant="secondary" disabled={pending} onClick={duplicate}><Copy className="size-4" aria-hidden /> Duplicar como borrador</Button>}
        {!locked && (
          <div className="sticky bottom-0 flex-wrap -mx-4 flex gap-2 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur md:-mx-6 md:px-6">
            <Button className="flex-1" disabled={pending || uploading > 0 || capProblems.length > 0} onClick={() => save(true)}>Programar</Button>
            <Button variant="secondary" disabled={pending || uploading > 0 || capProblems.length > 0} onClick={() => save(true, true)}><Send className="size-4" aria-hidden /> Publicar ahora</Button>
            <Button variant="secondary" disabled={pending || uploading > 0} onClick={() => save(false)}>Borrador</Button>
            <Button variant="ghost" aria-label="Duplicar publicación" disabled={pending} onClick={duplicate}><Copy className="size-4" aria-hidden /></Button>
            <Button variant="ghost" aria-label="Borrar publicación" disabled={pending} onClick={() => { if (confirm("¿Borrar esta publicación y sus archivos?")) start(async () => { await deletePost(post.id); onClose(); }); }}><Trash2 className="size-4" aria-hidden /></Button>
          </div>
        )}
      </div>
    </Sheet>
  );
}
