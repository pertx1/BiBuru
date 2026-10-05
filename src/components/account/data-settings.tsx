"use client";

import { Download } from "lucide-react";
import { useState, useTransition } from "react";
import { deleteAccount } from "@/app/(app)/ajustes/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const SETS = [["pedidos", "Pedidos"], ["lineas", "Líneas de pedido"], ["gastos", "Gastos"], ["ingresos", "Ingresos"], ["tareas", "Tareas"], ["notas", "Notas"], ["videos", "Vídeos"]] as const;

/** Exportación de datos y borrado de cuenta. */
export function DataSettings({ email }: { email: string }) {
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const link = "inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-sm hover:bg-surface-2 md:min-h-9";
  return (
    <div className="flex flex-col gap-4 text-sm">
      <div>
        <p className="mb-2 text-muted">Tus datos son tuyos. Descárgalos cuando quieras.</p>
        <a href="/api/export?formato=json" download className={link}><Download className="size-4" aria-hidden /> Todo (JSON)</a>
        <p className="mb-1 mt-3 font-medium">Para Excel (CSV)</p>
        <div className="flex flex-wrap gap-2">{SETS.map(([k, l]) => <a key={k} href={`/api/export?formato=csv&conjunto=${k}`} download className={link}>{l}</a>)}</div>
      </div>
      <details className="rounded-xl border border-danger/40 p-3">
        <summary className="min-h-9 cursor-pointer font-medium text-danger">Borrar mi cuenta y todos mis datos</summary>
        <form className="mt-3 flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await deleteAccount(confirm); // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- navegación completa: el service worker borra las copias sin conexión al abrir /login
 if (r.ok) window.location.assign("/login"); else setMsg(r.error); }); }}>
          <p className="text-muted">Se borra todo para siempre: negocios, pedidos, gastos, notas, tareas, vídeos y tickets. <strong>No se puede deshacer.</strong> Descarga antes una copia. Escribe <strong>{email}</strong> para confirmar.</p>
          <Input type="email" autoComplete="off" aria-label="Escribe tu correo para confirmar" value={confirm} onChange={(e) => { setConfirm(e.target.value); setMsg(null); }} placeholder={email} />
          <Button type="submit" disabled={pending || confirm.trim().toLowerCase() !== email.toLowerCase()} className="self-start bg-danger text-white">{pending ? "Borrando…" : "Borrar definitivamente"}</Button>
          {msg && <p role="alert" className="text-danger">{msg}</p>}
        </form>
      </details>
    </div>
  );
}
