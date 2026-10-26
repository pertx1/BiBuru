"use client";

import { Check, Copy } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createWidgetToken, revokeWidgetToken } from "@/app/(app)/ajustes/actions";
import { Button } from "@/components/ui/button";

/**
 * Widgets de iPhone con la app Scriptable (iOS no deja a una app web poner widgets). BiBuru genera el código con una
 * clave personal de solo lectura; se pega una vez en Scriptable y se añade el widget.
 */
export function WidgetSetup({ origin, status }: { origin: string; status: { createdAt: string; lastUsedAt: string | null } | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [script, setScript] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const fmt = (iso: string) => new Date(iso).toLocaleString("es-ES", { timeZone: "Europe/Madrid", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

  const create = () => start(async () => {
    if (status && !confirm("Se creará un código nuevo y los widgets que ya tengas dejarán de funcionar hasta que pegues el nuevo. ¿Seguir?")) return;
    const r = await createWidgetToken(origin);
    if (r.ok) { setScript(r.script); setMsg(null); } else setMsg(r.error);
    router.refresh();
  });
  const copy = () => { if (!script) return; void navigator.clipboard?.writeText(script); setCopied(true); setTimeout(() => setCopied(false), 2000); };

  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="text-muted">iPhone no deja que una app web ponga widgets en la pantalla de inicio. Se hace con la app gratuita <strong>Scriptable</strong>: muestra tus tareas de hoy, las ventas del día y del mes, pedidos sin hacer, lo que te deben y el stock a pedir. Se actualiza solo (cada ~15 min) y al tocarlo abre BiBuru.</p>
      {status && !script && <p className="text-muted">Widget activo desde el {fmt(status.createdAt)}{status.lastUsedAt ? ` · última vez que pidió datos: ${fmt(status.lastUsedAt)}` : " · aún no ha pedido datos"}.</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={pending} onClick={create}>{status ? "Generar código nuevo" : "Generar el código del widget"}</Button>
        {script && <Button type="button" variant="secondary" onClick={copy}>{copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}{copied ? "Copiado" : "Copiar código"}</Button>}
        {status && <Button type="button" variant="secondary" disabled={pending} onClick={() => { if (confirm("¿Desactivar? Los widgets dejarán de mostrar datos.")) start(async () => { const r = await revokeWidgetToken(); setScript(null); setMsg(r.ok ? "Widget desactivado" : (r.error ?? "No se pudo")); router.refresh(); }); }}>Desactivar</Button>}
      </div>
      {script && <p className="text-xs text-muted">El código lleva tu clave personal (solo sirve para leer este resumen). Cópialo ahora: no se vuelve a mostrar.</p>}
      <ol className="list-decimal space-y-1.5 pl-5">
        <li>Instala <strong>Scriptable</strong> desde la App Store (gratis).</li>
        <li>Aquí: <strong>Generar el código</strong> → <strong>Copiar código</strong>.</li>
        <li>En Scriptable: <strong>+</strong> (arriba a la derecha) → pega el código → arriba, ponle de nombre <strong>BiBuru</strong> → <strong>Hecho</strong>. Puedes tocar ▶︎ para ver cómo queda.</li>
        <li>En la pantalla de inicio: mantén pulsado → <strong>Editar</strong> → <strong>Añadir widget</strong> → <strong>Scriptable</strong> → elige tamaño (pequeño, mediano o grande).</li>
        <li>Mantén pulsado el widget → <strong>Editar widget</strong> → Script: <strong>BiBuru</strong>. En «Parameter» puedes poner <code>tareas</code> o <code>dinero</code> para un widget solo de eso (vacío = resumen). Puedes poner varios.</li>
      </ol>
      {msg && <p role="status" className="text-muted">{msg}</p>}
    </div>
  );
}
