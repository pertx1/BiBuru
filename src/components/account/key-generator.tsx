"use client";

import { Copy } from "lucide-react";
import { useState, useTransition } from "react";
import { generateSetupKeys } from "@/app/(app)/ajustes/actions";
import { Button } from "@/components/ui/button";

/** Genera las claves de configuración (no se guardan: cópialas a Vercel). */
export function KeyGenerator() {
  const [keys, setKeys] = useState<Record<string, string> | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="text-muted">Para configurar avisos, cron y YouTube hacen falta cuatro claves aleatorias. Pulsa y cópialas una a una a Vercel → Settings → Environment Variables. <strong>No se guardan en ningún sitio</strong> y son secretas: no se las enseñes a nadie. Si generas otras, las anteriores dejan de valer.</p>
      <Button type="button" variant="secondary" className="self-start" disabled={pending} onClick={() => start(async () => { const r = await generateSetupKeys(); if (r.ok && r.keys) setKeys(r.keys); })}>{keys ? "Generar otras" : "Generar claves"}</Button>
      {keys && (
        <ul className="flex flex-col gap-2">
          {Object.entries(keys).map(([k, v]) => (
            <li key={k} className="rounded-lg border border-border p-2">
              <p className="text-xs font-medium">{k}</p>
              <div className="mt-1 flex items-center gap-2"><code className="min-w-0 flex-1 break-all rounded bg-surface-2 px-2 py-1 text-xs">{v}</code>
                <button type="button" aria-label={`Copiar ${k}`} onClick={() => { void navigator.clipboard.writeText(v).then(() => setCopied(k)); }} className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-border hover:bg-surface-2 md:size-9"><Copy className="size-4" aria-hidden /></button></div>
              {copied === k && <p className="mt-1 text-xs text-emerald-600">Copiada ✔</p>}
            </li>
          ))}
          <li className="text-xs text-muted">Además: <code>VAPID_SUBJECT</code> = <code>mailto:</code> + tu correo.</li>
        </ul>
      )}
    </div>
  );
}
