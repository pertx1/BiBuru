"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { disconnectGoogle, loadPlaylists, saveSyncSettings, saveVideoLongMinutes, syncYoutubeNow } from "@/app/(app)/favoritos/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/dates";

type Pl = { id: string; title: string };
const MESSAGES: Record<string, string> = {
  ok: "Cuenta de Google conectada ✔", cancelado: "Has cancelado el acceso.", estado: "La comprobación de seguridad falló. Inténtalo de nuevo.",
  error: "Google devolvió un error. Inténtalo de nuevo.", "sin-token": "Google no entregó el permiso permanente. Quita BiBuru en myaccount.google.com/permissions y vuelve a conectar.",
  permisos: "Falta el permiso de YouTube. Acepta todos los permisos al conectar.", "sin-configurar": "Faltan las claves de Google en el servidor (ver README).",
};

/** Conexión con YouTube (solo lectura), listas a sincronizar, sincronización manual y umbral de vídeo largo. */
export function YoutubeSettings({ configured, status, longMinutes, flash }: {
  configured: boolean; longMinutes: number; flash?: string;
  status: { email: string | null; lastSyncAt: string | null; lastError: string | null; lastAdded: number; likes: boolean; playlists: Pl[] } | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(flash ? (MESSAGES[flash] ?? null) : null);
  const [likes, setLikes] = useState(status?.likes ?? true);
  const [chosen, setChosen] = useState<Pl[]>(status?.playlists ?? []);
  const [available, setAvailable] = useState<{ id: string; title: string; count: number }[] | null>(null);
  const [long, setLong] = useState(String(longMinutes));
  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) => start(async () => { const r = await fn(); setMsg(r.ok ? ok : (r.error ?? "No se pudo")); router.refresh(); });

  if (!configured) return <p className="text-sm text-muted">Para conectar YouTube hacen falta <code>GOOGLE_CLIENT_ID</code>, <code>GOOGLE_CLIENT_SECRET</code> y <code>TOKEN_ENCRYPTION_KEY</code> en el servidor (pasos en el README). Mientras tanto puedes pegar enlaces a mano en Favoritos.</p>;

  return (
    <div className="flex flex-col gap-3 text-sm" id="youtube">
      {!status ? (
        <>
          <p className="text-muted">Trae tus «Me gusta» y las listas que elijas a Favoritos. BiBuru solo pide permiso de <strong>lectura</strong>, no puede cambiar nada en tu cuenta, y el acceso se guarda cifrado.</p>
          <a href="/api/google/connect" className="inline-flex min-h-11 items-center justify-center self-start rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground md:min-h-9">Conectar con Google</a>
        </>
      ) : (
        <>
          <p>Conectado como <strong>{status.email ?? "tu cuenta de Google"}</strong>.{" "}
            {status.lastSyncAt ? `Última sincronización: ${formatDate(status.lastSyncAt.slice(0, 10))} (${status.lastAdded} nuevos).` : "Aún no se ha sincronizado."}</p>
          {status.lastError && <p role="alert" className="text-danger">{status.lastError}</p>}
          <label className="flex items-center justify-between gap-3">Importar mis «Me gusta»
            <input type="checkbox" className="size-5" checked={likes} onChange={(e) => { setLikes(e.target.checked); act(() => saveSyncSettings({ sync_likes: e.target.checked, sync_playlists: chosen }), "Guardado"); }} />
          </label>
          <div>
            <p className="mb-1 font-medium">Listas a sincronizar</p>
            {chosen.length === 0 && <p className="text-xs text-muted">Ninguna elegida.</p>}
            <ul>{chosen.map((l) => <li key={l.id} className="flex items-center justify-between py-1"><span>{l.title}</span><button type="button" className="min-h-9 px-2 text-xs text-muted hover:text-danger" onClick={() => { const n = chosen.filter((x) => x.id !== l.id); setChosen(n); act(() => saveSyncSettings({ sync_likes: likes, sync_playlists: n }), "Guardado"); }}>Quitar</button></li>)}</ul>
            <Button type="button" variant="secondary" disabled={pending} onClick={() => start(async () => { const r = await loadPlaylists(); if (r.ok) setAvailable(r.playlists ?? []); else setMsg(r.error ?? "No se pudieron leer tus listas"); })}>Elegir listas…</Button>
            {available && (
              <ul className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-border">
                {available.length === 0 && <li className="p-2 text-muted">No tienes listas propias.</li>}
                {available.map((l) => { const on = chosen.some((c) => c.id === l.id); return (
                  <li key={l.id}><label className="flex min-h-11 items-center justify-between gap-3 px-3"><span className="min-w-0 truncate">{l.title} <span className="text-xs text-muted">({l.count})</span></span>
                    <input type="checkbox" className="size-5" checked={on} onChange={() => { const n = on ? chosen.filter((c) => c.id !== l.id) : [...chosen, { id: l.id, title: l.title }].slice(0, 10); setChosen(n); act(() => saveSyncSettings({ sync_likes: likes, sync_playlists: n }), "Guardado"); }} /></label></li>
                ); })}
              </ul>
            )}
            <p className="mt-2 text-xs text-muted">«Ver más tarde» no se puede importar: Google no la ofrece a ninguna aplicación. Pasa esos vídeos a una lista normal o pega el enlace.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={pending} onClick={() => act(syncYoutubeNow, "Sincronizado")}>{pending ? "Trabajando…" : "Sincronizar ahora"}</Button>
            <Button type="button" variant="secondary" disabled={pending} onClick={() => { if (confirm("¿Desconectar tu cuenta de Google? Los vídeos ya guardados se conservan.")) act(disconnectGoogle, "Cuenta desconectada"); }}>Desconectar</Button>
          </div>
          <p className="text-xs text-muted">Se sincroniza solo cada 6 horas. Las primeras veces se importan los 25–50 más recientes para no gastar tu presupuesto de IA de golpe.</p>
        </>
      )}
      <form className="flex flex-wrap items-center gap-2 border-t border-border pt-3" onSubmit={(e) => { e.preventDefault(); act(() => saveVideoLongMinutes(Number(long)), "Guardado"); }}>
        <label className="flex flex-1 flex-wrap items-center gap-2">Vídeo largo a partir de (min)<Input inputMode="numeric" className="w-20" value={long} onChange={(e) => setLong(e.target.value)} aria-label="Minutos de vídeo largo" /></label>
        <Button type="submit" variant="secondary" disabled={pending}>Guardar</Button>
      </form>
      <p className="text-xs text-muted">Los vídeos más largos no se analizan solos: te muestro el coste estimado y tú decides.</p>
      {msg && <p role="status" className="text-muted">{msg}</p>}
    </div>
  );
}
