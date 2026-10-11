"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { importTiktokExport } from "@/app/(app)/favoritos/actions";
import { Button } from "@/components/ui/button";
import { parseTiktokExportFile, type TiktokExport } from "@/lib/favorites/tiktok-export";

/**
 * Importa los Favoritos (y si quieres los «Me gusta») de cualquier cuenta de TikTok desde su archivo de «Descargar tus datos».
 * El archivo se lee en el móvil; al servidor solo van los números de los vídeos.
 */
export function TiktokImport() {
  const router = useRouter();
  const [data, setData] = useState<TiktokExport | null>(null);
  const [fav, setFav] = useState(true);
  const [likes, setLikes] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function read(file: File) {
    setMsg("Leyendo el archivo…"); setData(null);
    try {
      const d = await parseTiktokExportFile(file.name, new Uint8Array(await file.arrayBuffer()));
      setData(d);
      setMsg(d.favorites.length + d.likes.length ? null : "No he encontrado Favoritos ni «Me gusta» en ese archivo. Pide los datos en formato JSON (o TXT) y elige el .zip tal cual.");
    } catch (e) {
      setMsg(e instanceof Error ? `No se pudo leer: ${e.message}` : "No se pudo leer el archivo");
    }
  }

  async function run() {
    if (!data) return;
    setBusy(true);
    let added = 0, dup = 0;
    const jobs = [...(fav ? [{ kind: "favoritos" as const, items: data.favorites }] : []), ...(likes ? [{ kind: "me_gusta" as const, items: data.likes }] : [])];
    const total = jobs.reduce((s, j) => s + j.items.length, 0);
    let done = 0;
    for (const j of jobs) {
      for (let i = 0; i < j.items.length; i += 500) {
        const r = await importTiktokExport({ kind: j.kind, items: j.items.slice(i, i + 500) });
        if (!r.ok) { setMsg(r.error ?? "No se pudo importar"); setBusy(false); return; }
        added += r.added ?? 0; dup += r.duplicates ?? 0; done += Math.min(500, j.items.length - i);
        setMsg(`Importando… ${done} de ${total}`);
      }
    }
    setBusy(false); setData(null);
    setMsg(`${added} vídeos nuevos en Favoritos${dup ? ` (${dup} ya estaban)` : ""}. Se analizan solos, de 2 en 2, y van apareciendo con su resumen.`);
    router.refresh();
  }

  const count = (fav ? data?.favorites.length ?? 0 : 0) + (likes ? data?.likes.length ?? 0 : 0);
  return (
    <details className="mt-3 rounded-xl bg-surface p-3 text-sm">
      <summary className="flex min-h-11 cursor-pointer items-center font-medium md:min-h-9">Importar Favoritos de TikTok (de cualquier cuenta)</summary>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted">
        <li>En TikTok, con la cuenta que quieras: Perfil → ☰ → <strong>Ajustes y privacidad</strong> → <strong>Cuenta</strong> → <strong>Descargar tus datos</strong>.</li>
        <li>Elige formato <strong>JSON</strong> y «Solicitar datos». TikTok tarda de unos minutos a unos días en prepararlo.</li>
        <li>Descárgalo (pestaña «Descargar datos») y elige aquí el archivo <strong>.zip</strong> tal cual.</li>
      </ol>
      <label className="mt-3 inline-flex min-h-11 cursor-pointer items-center rounded-full bg-fill px-4 font-medium md:min-h-9">
        Elegir archivo
        <input type="file" accept=".zip,.json,.txt,application/zip,application/json,text/plain" className="sr-only" aria-label="Archivo de datos de TikTok"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void read(f); e.target.value = ""; }} />
      </label>
      {data && (data.favorites.length + data.likes.length > 0) && (
        <div className="mt-3 flex flex-col gap-2">
          <label className="flex min-h-11 items-center justify-between gap-3">Favoritos <span className="ml-auto text-muted">{data.favorites.length}</span><input type="checkbox" className="size-5" checked={fav} onChange={(e) => setFav(e.target.checked)} /></label>
          <label className="flex min-h-11 items-center justify-between gap-3">«Me gusta» <span className="ml-auto text-muted">{data.likes.length}</span><input type="checkbox" className="size-5" checked={likes} onChange={(e) => setLikes(e.target.checked)} /></label>
          <Button type="button" disabled={busy || count === 0} onClick={() => void run()} className="self-start">{busy ? "Importando…" : `Importar ${count} vídeos`}</Button>
          <p className="text-xs text-muted">Los que ya tengas no se repiten. Cada TikTok cuesta muy poco de IA (vídeos cortos); si llegas al tope del mes, el resto espera al mes siguiente.</p>
        </div>
      )}
      {msg && <p role="status" className="mt-2 text-muted">{msg}</p>}
    </details>
  );
}
