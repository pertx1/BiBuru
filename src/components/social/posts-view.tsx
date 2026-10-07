"use client";

import { AlertTriangle, CalendarClock, CheckCircle2, ImagePlus, Loader2, RotateCw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { createDraft, deletePost, deleteSocialFile, prepareSocialUpload, registerSocialFile, retryTarget, savePost } from "@/app/(app)/redes/actions";
import { Button } from "@/components/ui/button";
import { Field, Select, Textarea } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { createClient } from "@/lib/supabase/client";
import { tiktokModeFor } from "@/lib/social/tiktok-mode";
import { cn } from "@/lib/utils";

type Target = { id: string; account_id: string; mode: string; status: string; error: string | null; permalink: string | null; privacy: string | null; published_at: string | null };
type FileR = { id: string; path: string; mime: string; size_bytes: number; position: number; deleted_at: string | null };
type Post = { id: string; title: string | null; caption: string; hashtags: string; media_kind: string; scheduled_at: string | null; status: string; business_id: string | null; notes: string | null; source_video_id: string | null; social_post_targets: Target[]; social_post_files: FileR[] };
type Acc = { id: string; platform: string; username: string | null; status: string; scopes: string | null };

export const POST_STATUS: Record<string, { label: string; cls: string }> = {
  borrador: { label: "Borrador", cls: "border-border text-muted" }, programada: { label: "Programada", cls: "border-accent/50 text-accent" },
  publicando: { label: "Publicando", cls: "border-amber-500/50 text-amber-600 dark:text-amber-400" }, publicada: { label: "Hecha", cls: "border-good/50 text-good" }, error: { label: "Error", cls: "border-bad/50 text-bad" },
};
const TARGET: Record<string, string> = { pendiente: "Pendiente", publicando: "Publicando…", publicada: "Publicada", enviada: "Enviada a TikTok (borrador)", avisada: "Aviso enviado", error: "Error" };
const MODE: Record<string, string> = { direct: "publicación directa", draft: "se envía a TikTok como borrador para terminarlo allí", assisted: "te aviso a la hora con el vídeo y el texto listos" };
const mb = (b: number) => `${(b / 1024 / 1024).toFixed(b > 100 * 1024 * 1024 ? 0 : 1)} MB`;
const local = (iso: string | null) => {
  if (!iso) return { date: "", time: "" };
  const d = new Date(iso);
  return { date: d.toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" }), time: d.toLocaleTimeString("es-ES", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }) };
};

/** Publicaciones: lista con su estado por red, y editor (fotos/vídeos, texto, hashtags, cuentas, fecha y hora). */
export function PostsView({ posts, accounts, businesses, today, openId, used, limit }: { posts: Post[]; accounts: Acc[]; businesses: { id: string; name: string }[]; today: string; openId: string | null; used: number; limit: number }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState<string | null>(openId);
  const [pending, start] = useTransition();
  const accById = new Map(accounts.map((a) => [a.id, a]));
  const current = posts.find((p) => p.id === open) ?? null;
  const upcoming = posts.filter((p) => p.status !== "publicada").sort((a, b) => (a.scheduled_at ?? "9").localeCompare(b.scheduled_at ?? "9"));
  const done = posts.filter((p) => p.status === "publicada");

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
          <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold", POST_STATUS[p.status]?.cls)}>{POST_STATUS[p.status]?.label ?? p.status}</span>
        </button>
      </li>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button disabled={pending} onClick={() => start(async () => { const r = await createDraft(); if (r.ok) { setOpen(r.id); router.refresh(); } else toast({ message: r.error }); })}><ImagePlus className="size-4" aria-hidden /> Nueva publicación</Button>
        <div className="min-w-48 flex-1 text-right text-xs text-muted md:flex-none">
          Espacio para archivos: {mb(used)} de {mb(limit)}
          <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-surface-2"><span className={cn("block h-full rounded-full", used / limit > 0.8 ? "bg-bad" : "bg-income")} style={{ width: `${Math.min(100, (used / limit) * 100)}%` }} /></span>
        </div>
      </div>
      {accounts.some((a) => a.platform === "tiktok") && <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs">TikTok: mientras TikTok no audite la app, lo que se publique por la API queda <strong>privado (solo tú lo ves)</strong>. Por eso BiBuru lo envía como borrador a tu TikTok o te avisa para publicarlo tú: así sale público.</p>}
      <section><h2 className="mb-2 text-sm font-semibold">Próximas y borradores</h2>
        {upcoming.length ? <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">{upcoming.map((p) => <Row key={p.id} p={p} />)}</ul> : <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted">Nada programado. Pulsa «Nueva publicación» o «Usar como idea» en un vídeo de Favoritos.</p>}
      </section>
      {done.length > 0 && <section><h2 className="mb-2 text-sm font-semibold">Hechas</h2><ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">{done.slice(0, 30).map((p) => <Row key={p.id} p={p} />)}</ul></section>}
      {current && <PostEditor key={current.id} post={current} accounts={accounts} businesses={businesses} today={today} onClose={() => { setOpen(null); router.refresh(); }} />}
    </div>
  );
}

function PostEditor({ post, accounts, businesses, today, onClose }: { post: Post; accounts: Acc[]; businesses: { id: string; name: string }[]; today: string; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [uploading, setUploading] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const locked = post.status === "publicando" || post.status === "publicada";
  const when = local(post.scheduled_at);
  const [f, setF] = useState({ title: post.title ?? "", caption: post.caption, hashtags: post.hashtags, kind: post.media_kind, date: when.date || today, time: when.time || "19:00", business: post.business_id ?? "", notes: post.notes ?? "" });
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
    for (const file of [...list].slice(0, 10)) {
      setUploading((n) => n + 1);
      try {
        const mime = file.type === "image/jpg" ? "image/jpeg" : file.type;
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

  const save = (schedule: boolean) => start(async () => {
    const r = await savePost({ id: post.id, title: f.title, caption: f.caption, hashtags: f.hashtags, mediaKind: f.kind as "image", date: f.date, time: f.time, accountIds: targets, schedule, businessId: f.business || null, notes: f.notes });
    if (!r.ok) { toast({ message: r.error }); return; }
    toast({ message: schedule ? "Programada ✔" : "Borrador guardado" });
    onClose();
  });

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
                  {t.error && <span className="w-full text-bad">{t.error}</span>}
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
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tipo" htmlFor="sp-kind"><Select id="sp-kind" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}><option value="image">Foto</option><option value="carousel">Carrusel (2–10)</option><option value="reel">Reel / vídeo</option></Select></Field>
            <Field label="Negocio" htmlFor="sp-biz"><Select id="sp-biz" value={f.business} onChange={(e) => setF({ ...f, business: e.target.value })}><option value="">Ninguno</option>{businesses.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select></Field>
          </div>
          <Field label="Título interno (opcional)" htmlFor="sp-title"><Input id="sp-title" value={f.title} maxLength={120} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
          <Field label={`Texto (${f.caption.length}/2200)`} htmlFor="sp-cap"><Textarea id="sp-cap" value={f.caption} maxLength={2200} rows={5} onChange={(e) => setF({ ...f, caption: e.target.value })} /></Field>
          <Field label="Hashtags" htmlFor="sp-tags"><Input id="sp-tags" value={f.hashtags} maxLength={1000} placeholder="#moda #hechoamano" onChange={(e) => setF({ ...f, hashtags: e.target.value })} /></Field>
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
            {tiktokSel.length > 0 && f.kind !== "reel" && <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">TikTok necesita un vídeo: elige «Reel / vídeo».</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Fecha" htmlFor="sp-date"><Input id="sp-date" type="date" value={f.date} min={today} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
            <Field label="Hora" htmlFor="sp-time"><Input id="sp-time" type="time" value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} /></Field>
          </div>
          {f.notes && <Field label="Notas e ideas" htmlFor="sp-notes"><Textarea id="sp-notes" value={f.notes} rows={4} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>}
        </fieldset>
        {!locked && (
          <div className="sticky bottom-0 -mx-4 flex gap-2 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur md:-mx-6 md:px-6">
            <Button className="flex-1" disabled={pending || uploading > 0} onClick={() => save(true)}>Programar</Button>
            <Button variant="secondary" disabled={pending || uploading > 0} onClick={() => save(false)}>Guardar borrador</Button>
            <Button variant="ghost" aria-label="Borrar publicación" disabled={pending} onClick={() => { if (confirm("¿Borrar esta publicación y sus archivos?")) start(async () => { await deletePost(post.id); onClose(); }); }}><Trash2 className="size-4" aria-hidden /></Button>
          </div>
        )}
      </div>
    </Sheet>
  );
}
