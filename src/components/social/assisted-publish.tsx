"use client";

import { Check, Copy, Download, ExternalLink, Share2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { markAssistedDone } from "@/app/(app)/redes/actions";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

type F = { mime: string; view: string | null; download: string | null; name: string };

/** Pasos para publicarlo tú: copiar el texto, guardar o compartir el vídeo con TikTok y marcarlo como hecho. */
export function AssistedPublish({ postId, targetId, done, caption, files }: { postId: string; targetId: string | null; done: boolean; caption: string; files: F[] }) {
  const toast = useToast();
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  const video = files.find((f) => f.mime.startsWith("video/")) ?? files[0];

  async function share() {
    if (!video?.view) return;
    try {
      const blob = await (await fetch(video.view)).blob();
      const file = new File([blob], video.name, { type: video.mime });
      if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], text: caption }); return; }
      toast({ message: "Este navegador no puede compartir archivos: usa «Guardar vídeo»." });
    } catch { /* cancelado */ }
  }

  if (!video) return <p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted">Los archivos de esta publicación ya se borraron (se guardan 3 días tras publicar).</p>;
  return (
    <div className="flex flex-col gap-4">
      <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm">
        <li>Pulsa <strong>Copiar texto</strong>.</li>
        <li>Pulsa <strong>Compartir</strong> y elige <strong>TikTok</strong> (o <strong>Guardar vídeo</strong> y súbelo desde TikTok con el botón <strong>+</strong>).</li>
        <li>En TikTok, pega el texto, revisa y pulsa <strong>Publicar</strong>.</li>
        <li>Vuelve aquí y pulsa <strong>Ya lo he publicado</strong>.</li>
      </ol>
      {video.view && (video.mime.startsWith("video/") ? <video src={video.view} controls playsInline className="max-h-[55dvh] w-full rounded-xl bg-black" /> : // eslint-disable-next-line @next/next/no-img-element -- archivo propio con URL firmada
        <img src={video.view} alt="" className="max-h-[55dvh] w-full rounded-xl object-contain" />)}
      <div className="rounded-xl border border-border bg-surface p-3">
        <p className="mb-2 whitespace-pre-wrap text-sm">{caption || "(sin texto)"}</p>
        <Button variant="secondary" onClick={() => void navigator.clipboard.writeText(caption).then(() => { setCopied(true); toast({ message: "Texto copiado" }); })}>{copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />} Copiar texto</Button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button onClick={() => void share()}><Share2 className="size-4" aria-hidden /> Compartir</Button>
        {video.download && <a href={video.download} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border px-4 text-sm font-medium"><Download className="size-4" aria-hidden /> Guardar vídeo</a>}
        <a href="https://www.tiktok.com/upload" target="_blank" rel="noopener noreferrer" className="col-span-2 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border px-4 text-sm font-medium">Abrir TikTok <ExternalLink className="size-4" aria-hidden /></a>
      </div>
      {targetId && (done ? <p className="text-sm text-good">Marcada como publicada ✔</p> : (
        <Button variant="secondary" disabled={pending} onClick={() => start(async () => { const r = await markAssistedDone(targetId); toast({ message: r.ok ? "¡Hecho! Marcada como publicada" : r.error }); router.push(`/redes?vista=publicaciones&abrir=${postId}`); })}>
          <Check className="size-4" aria-hidden /> Ya lo he publicado
        </Button>
      ))}
    </div>
  );
}
