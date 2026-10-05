"use client";

import { useState, useTransition } from "react";
import { saveAiSettings } from "@/app/(app)/ajustes/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Price = { model: string; input: number; output: number };
const FEATURES: Record<string, string> = { classify: "Clasificar capturas", chat: "Chat", voice: "Dictado por voz", video: "Análisis de vídeo", video_light: "Análisis ligero de vídeo" };
const eur = (n: number) => n.toLocaleString("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 4 });

/** Consumo del mes, presupuesto, autoaplicación y precios por modelo. */
export function AiSettingsForm({ hasKey, budgetEur, autoApply, spentMicros, pct, byFeature, prices }: {
  hasKey: boolean; budgetEur: number; autoApply: boolean; spentMicros: number; pct: number;
  byFeature: { feature: string; calls: number; costMicros: number }[]; prices: Price[];
}) {
  const [budget, setBudget] = useState(String(budgetEur));
  const [auto, setAuto] = useState(autoApply);
  const [pr, setPr] = useState(prices);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const num = (v: string) => Number(v.replace(",", "."));
  const setPrice = (i: number, k: "input" | "output", v: string) => { setPr((a) => a.map((x, j) => (j === i ? { ...x, [k]: num(v) } : x))); setMsg(null); };

  return (
    <form className="flex flex-col gap-3 text-sm" onSubmit={(e) => { e.preventDefault(); start(async () => { const b = num(budget); const r = Number.isFinite(b) ? await saveAiSettings({ budget_eur: b, auto_apply: auto, prices: pr }) : { ok: false as const, error: "Presupuesto no válido" }; setMsg(r.ok ? "Guardado" : r.error); }); }}>
      <p className={hasKey ? "text-muted" : "text-amber-600"}>{hasKey ? "Clave de Gemini configurada en el servidor ✔" : "Falta GEMINI_API_KEY en el servidor: la IA está desactivada y la captura funciona sin ella."}</p>
      <div>
        <div className="mb-1 flex justify-between"><span>Este mes: {eur(spentMicros / 1_000_000)}</span><span className="text-muted">{Math.round(pct)} %</span></div>
        <div className="h-2 overflow-hidden rounded-full bg-surface-2"><div className={`h-full ${pct >= 100 ? "bg-danger" : pct >= 80 ? "bg-amber-500" : "bg-accent"}`} style={{ width: `${Math.min(100, pct)}%` }} /></div>
        {byFeature.length > 0 && <ul className="mt-2 text-xs text-muted">{byFeature.map((f) => <li key={f.feature} className="flex justify-between"><span>{FEATURES[f.feature] ?? f.feature} · {f.calls} llamadas</span><span>{eur(f.costMicros / 1_000_000)}</span></li>)}</ul>}
      </div>
      <label className="flex flex-col gap-1.5 sm:grid sm:grid-cols-[1fr_auto] sm:items-center">Presupuesto mensual (€)
        <Input inputMode="decimal" aria-label="Presupuesto mensual" className="w-32" value={budget} onChange={(e) => { setBudget(e.target.value); setMsg(null); }} />
      </label>
      <label className="flex items-center justify-between gap-3">Aplicar solo (sin preguntar) tareas, notas, ideas y eventos claros
        <input type="checkbox" className="size-5" checked={auto} onChange={(e) => { setAuto(e.target.checked); setMsg(null); }} />
      </label>
      <p className="text-xs text-muted">Los gastos y pedidos siempre piden confirmación. Las aplicadas solas aparecen en la Bandeja con «Deshacer».</p>
      <div>
        <p className="mb-1 font-medium">Precios por millón de tokens (€)</p>
        {pr.map((x, i) => (
          <div key={x.model} className="flex flex-wrap items-center gap-2 border-t border-border py-2">
            <span className="min-w-0 flex-1 break-all text-xs">{x.model}</span>
            <Input inputMode="decimal" aria-label={`Entrada ${x.model}`} className="w-24" defaultValue={x.input} onChange={(e) => setPrice(i, "input", e.target.value)} />
            <Input inputMode="decimal" aria-label={`Salida ${x.model}`} className="w-24" defaultValue={x.output} onChange={(e) => setPrice(i, "output", e.target.value)} />
          </div>
        ))}
        <p className="text-xs text-muted">Entrada · salida. Son estimaciones: ajústalas a la tarifa vigente de Google para que el control de gasto sea exacto.</p>
      </div>
      <div className="flex items-center gap-3"><Button type="submit" disabled={pending}>{pending ? "Guardando…" : "Guardar"}</Button>{msg && <span role="status" className="text-muted">{msg}</span>}</div>
    </form>
  );
}
