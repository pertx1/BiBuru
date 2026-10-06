"use client";

import { Check, KeyRound, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createAntolaToken, deleteRule, revokeAntolaToken, saveDesignRule, saveShirtRule } from "@/app/(app)/negocios/actions-production";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { formatDate } from "@/lib/dates";

type Props = {
  businessId: string;
  designs: string[];
  shirtRules: { id: string; shirt_color: string; dtf_color: string }[];
  designRules: { id: string; design: string; dtf_color: string }[];
  antolaCreatedAt: string | null;
  origin: string;
};

export function RulesView({ businessId, designs, shirtRules, designRules, antolaCreatedAt, origin }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const r = await fn();
      setError(r.ok ? null : (r.error ?? "Error"));
      router.refresh();
    });

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <section className="rounded-xl border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold">Color de DTF según la prenda</h2>
        <p className="mb-3 text-xs text-muted">Por defecto: prenda blanca → DTF negro; prenda negra o sudadera → DTF blanco. Añade reglas para otros colores (rojo, azul…).</p>
        <ul className="mb-3 divide-y divide-border">
          {shirtRules.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2 py-1.5 text-sm"><span>Prenda <strong>{r.shirt_color}</strong> → DTF <strong>{r.dtf_color}</strong></span>
              <button type="button" aria-label="Eliminar regla" className="flex size-11 md:size-10 items-center justify-center text-muted hover:text-danger" onClick={() => { run(() => deleteRule("shirt", r.id)); toast({ message: "Regla eliminada", actionLabel: "Deshacer", onAction: () => run(() => saveShirtRule({ businessId, shirtColor: r.shirt_color, dtfColor: r.dtf_color })) }); }}><Trash2 className="size-4" aria-hidden /></button></li>
          ))}
          {shirtRules.length === 0 && <li className="py-1.5 text-sm text-muted">Sin reglas propias.</li>}
        </ul>
        <form className="grid grid-cols-[1fr_1fr_auto] gap-2" action={(fd) => run(() => saveShirtRule({ businessId, shirtColor: String(fd.get("s") ?? ""), dtfColor: String(fd.get("d") ?? "") }))}>
          <Input name="s" placeholder="Color de prenda" aria-label="Color de prenda" maxLength={40} required /><Input name="d" placeholder="Color del DTF" aria-label="Color del DTF" maxLength={40} required /><Button type="submit">Añadir</Button>
        </form>
      </section>

      <section className="rounded-xl border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold">DTF especial de un diseño</h2>
        <p className="mb-3 text-xs text-muted">Para diseños a todo color u otros casos: tiene prioridad sobre la regla de la prenda.</p>
        <ul className="mb-3 divide-y divide-border">
          {designRules.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2 py-1.5 text-sm"><span><strong>{r.design}</strong> → DTF <strong>{r.dtf_color}</strong></span>
              <button type="button" aria-label="Eliminar regla" className="flex size-11 md:size-10 items-center justify-center text-muted hover:text-danger" onClick={() => { run(() => deleteRule("design", r.id)); toast({ message: "Regla eliminada", actionLabel: "Deshacer", onAction: () => run(() => saveDesignRule({ businessId, design: r.design, dtfColor: r.dtf_color })) }); }}><Trash2 className="size-4" aria-hidden /></button></li>
          ))}
          {designRules.length === 0 && <li className="py-1.5 text-sm text-muted">Sin reglas por diseño.</li>}
        </ul>
        <form className="grid grid-cols-[1fr_1fr_auto] gap-2" action={(fd) => run(() => saveDesignRule({ businessId, design: String(fd.get("g") ?? ""), dtfColor: String(fd.get("d") ?? "") }))}>
          <Select name="g" aria-label="Diseño" required defaultValue=""><option value="" disabled>Diseño…</option>{designs.map((d) => <option key={d} value={d}>{d}</option>)}</Select>
          <Input name="d" placeholder="Ej. todo color" aria-label="DTF especial" maxLength={40} required /><Button type="submit">Añadir</Button>
        </form>
      </section>

      <section className="rounded-xl border border-border bg-surface p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold"><KeyRound className="size-4" aria-hidden /> Conectar con Antola</h2>
        <p className="mb-3 text-xs text-muted">Antola consulta aquí qué hay que pedir (la lista «Pedir ya»). Genera una clave y pégala en Antola. Se muestra <strong>una sola vez</strong>; si la pierdes, genera otra (la anterior deja de valer).</p>
        {token ? (
          <div className="flex flex-col gap-2">
            <code className="break-all rounded-lg bg-surface-2 p-3 text-xs">{token}</code>
            <Button variant="secondary" onClick={async () => { await navigator.clipboard.writeText(token); setCopied(true); }}>{copied ? <><Check className="size-4" aria-hidden /> Copiada</> : "Copiar clave"}</Button>
            <p className="text-xs text-muted">Dirección: <code>{origin}/api/antola/stock</code> · cabecera <code>Authorization: Bearer &lt;clave&gt;</code></p>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => start(async () => { const r = await createAntolaToken(businessId); if (r.ok) { setToken(r.token); setCopied(false); } else setError(r.error); router.refresh(); })}>{antolaCreatedAt ? "Generar clave nueva" : "Generar clave"}</Button>
            {antolaCreatedAt && <><span className="text-xs text-muted">Conectado desde {formatDate(antolaCreatedAt.slice(0, 10))}</span><Button variant="ghost" onClick={() => run(() => revokeAntolaToken(businessId))}>Desconectar</Button></>}
          </div>
        )}
      </section>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </div>
  );
}
