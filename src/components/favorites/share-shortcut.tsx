"use client";

import { Check, Copy } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createShareToken, revokeShareToken } from "@/app/(app)/favoritos/actions";
import { Button } from "@/components/ui/button";

function CopyField({ label, value }: { label: string; value: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="flex items-center gap-2 rounded-lg bg-fill p-2">
      <div className="min-w-0 flex-1"><p className="text-xs text-muted">{label}</p><p className="truncate font-mono text-xs">{value}</p></div>
      <Button type="button" variant="secondary" aria-label={`Copiar ${label}`} onClick={() => { void navigator.clipboard?.writeText(value); setDone(true); setTimeout(() => setDone(false), 1500); }}>
        {done ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}{done ? "Copiado" : "Copiar"}
      </Button>
    </div>
  );
}

/** Atajo de iPhone: en TikTok (o YouTube) Compartir → BiBuru, y el vídeo entra en Favoritos y se analiza sin abrir la app. */
export function ShareShortcut({ status, origin }: { status: { createdAt: string; lastUsedAt: string | null; uses: number } | null; origin: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [token, setToken] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const endpoint = `${origin}/api/compartir`;

  const create = () => start(async () => {
    if (status && !confirm("Se creará una clave nueva y la anterior dejará de funcionar (tendrás que cambiarla en el atajo). ¿Seguir?")) return;
    const r = await createShareToken();
    if (!r.ok) setMsg(r.error ?? "No se pudo crear la clave"); else if (r.token) { setToken(r.token); setMsg(null); }
    router.refresh();
  });

  return (
    <details className="mt-3 rounded-xl bg-surface p-3 text-sm">
      <summary className="flex min-h-11 cursor-pointer items-center font-medium md:min-h-9">Atajo de iPhone: Compartir → BiBuru</summary>
      <p className="mt-2 text-muted">En TikTok o YouTube pulsas <strong>Compartir → BiBuru</strong> y el vídeo entra en Favoritos y se analiza, sin abrir la app. Se monta una vez en la app <strong>Atajos</strong> (2 minutos).</p>

      <div className="mt-3 flex flex-col gap-2">
        {token ? (
          <>
            <p className="font-medium">Tu clave (cópiala ahora: no se vuelve a mostrar)</p>
            <CopyField label="Clave" value={token} />
          </>
        ) : status ? (
          <p className="text-muted">Clave creada el {new Date(status.createdAt).toLocaleDateString("es-ES", { timeZone: "Europe/Madrid" })}{status.lastUsedAt ? ` · usada ${status.uses} ${status.uses === 1 ? "vez" : "veces"}, la última el ${new Date(status.lastUsedAt).toLocaleDateString("es-ES", { timeZone: "Europe/Madrid" })}` : " · aún sin usar"}.</p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={pending} onClick={create}>{status ? "Crear clave nueva" : "Crear mi clave"}</Button>
          {status && <Button type="button" variant="secondary" disabled={pending} onClick={() => { if (confirm("¿Borrar la clave? El atajo dejará de funcionar.")) start(async () => { const r = await revokeShareToken(); setToken(null); setMsg(r.ok ? "Clave borrada" : (r.error ?? "No se pudo")); router.refresh(); }); }}>Borrar clave</Button>}
        </div>
        <CopyField label="Dirección" value={endpoint} />
      </div>

      <ol className="mt-3 list-decimal space-y-2 pl-5">
        <li>Abre la app <strong>Atajos</strong> → pestaña <strong>Atajos</strong> → <strong>+</strong>. Arriba, ponle de nombre <strong>BiBuru</strong>.</li>
        <li>Toca <strong>ⓘ</strong> (abajo) → activa <strong>Mostrar en hoja de compartir</strong>. Toca <strong>Hecho</strong>. Arriba saldrá «Recibir <em>Cualquiera</em> de Hoja de compartir»: déjalo así.</li>
        <li>Busca la acción <strong>Obtener contenido de URL</strong> y añádela. Toca «URL» y pega la <strong>Dirección</strong> de arriba.</li>
        <li>Toca la flecha <strong>›</strong> de esa acción: <strong>Método</strong> = <strong>POST</strong>; <strong>Cuerpo de la solicitud</strong> = <strong>JSON</strong>.</li>
        <li><strong>Añadir nuevo campo → Texto</strong>: clave <code>clave</code>, valor = pega tu <strong>Clave</strong>.</li>
        <li>Otro campo <strong>Texto</strong>: clave <code>enlace</code>, valor = toca y elige la variable <strong>Entrada del atajo</strong>.</li>
        <li>Añade la acción <strong>Mostrar notificación</strong> y pon como texto <strong>Contenido de la URL</strong>. Listo.</li>
      </ol>
      <p className="mt-2 text-xs text-muted">Para usarlo: en un vídeo de TikTok, <strong>Compartir</strong> → desliza la fila de apps hasta el final → <strong>Más</strong> → <strong>BiBuru</strong> (puedes ponerlo en favoritos para que salga el primero). Si TikTok no lo muestra, usa <strong>Copiar enlace</strong> y compártelo desde ahí, o pega el enlace aquí. La clave solo sirve para guardar enlaces en tus Favoritos; si la pierdes o alguien la ve, crea una nueva.</p>
      {msg && <p role="status" className="mt-2 text-muted">{msg}</p>}
    </details>
  );
}
