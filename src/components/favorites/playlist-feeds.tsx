"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addPlaylistFeed, checkPlaylistFeedsNow, removePlaylistFeed } from "@/app/(app)/favoritos/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type FeedView = { id: string; title: string; lastCheckedAt: string | null; lastError: string | null; lastAdded: number };

const when = (iso: string) => new Date(iso).toLocaleString("es-ES", { timeZone: "Europe/Madrid", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/** Listas de YouTube por RSS: sin Google Cloud. Lo que guardes en la lista aparece solo en Favoritos. */
export function PlaylistFeeds({ feeds }: { feeds: FeedView[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [url, setUrl] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; error?: string; added?: number }>, okText: (added?: number) => string, after?: () => void) =>
    start(async () => { const r = await fn(); setMsg(r.ok ? okText(r.added) : (r.error ?? "No se pudo")); if (r.ok) after?.(); router.refresh(); });
  const added = (n?: number) => (n ? `${n} ${n === 1 ? "vídeo nuevo" : "vídeos nuevos"} en Favoritos` : "Sin vídeos nuevos");

  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="text-muted">
        Sin cuentas ni claves: crea en YouTube una lista <strong>Pública</strong> (por ejemplo «BiBuru»), pega aquí su enlace y guarda en ella los
        vídeos con <strong>Guardar</strong>. BiBuru la revisa cada hora y añade los nuevos a Favoritos.
      </p>
      <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); run(() => addPlaylistFeed(url), (n) => `Lista añadida. ${added(n)}.`, () => setUrl("")); }}>
        <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.youtube.com/playlist?list=…" aria-label="Enlace de la lista de YouTube" className="min-w-0 flex-1" inputMode="url" />
        <Button type="submit" disabled={pending || url.trim().length < 10}>{pending ? "Comprobando…" : "Añadir lista"}</Button>
      </form>
      {feeds.length > 0 && (
        <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
          {feeds.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <div className="min-w-0">
                <p className="truncate font-medium">{f.title}</p>
                {f.lastError
                  ? <p role="alert" className="text-xs text-danger">{f.lastError}</p>
                  : <p className="text-xs text-muted">{f.lastCheckedAt ? `Revisada el ${when(f.lastCheckedAt)} · ${f.lastAdded} nuevos` : "Aún sin revisar"}</p>}
              </div>
              <button type="button" disabled={pending} className="min-h-11 shrink-0 px-2 text-xs text-muted hover:text-danger"
                onClick={() => { if (confirm(`¿Dejar de seguir «${f.title}»? Los vídeos ya guardados se conservan.`)) run(() => removePlaylistFeed(f.id), () => "Lista quitada"); }}>Quitar</button>
            </li>
          ))}
        </ul>
      )}
      {feeds.length > 0 && <Button type="button" variant="secondary" className="self-start" disabled={pending} onClick={() => run(checkPlaylistFeedsNow, added)}>{pending ? "Comprobando…" : "Comprobar ahora"}</Button>}
      <p className="text-xs text-muted">
        Consejo: en la lista, ve a ⋯ → Configuración y activa «Añadir vídeos nuevos al principio». YouTube solo enseña los 15 primeros vídeos de la
        lista; así los nuevos siempre entran. Los vídeos privados u ocultos no se pueden leer.
      </p>
      {msg && <p role="status" className="text-muted">{msg}</p>}
    </div>
  );
}
