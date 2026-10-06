import { hasGeminiKey } from "@/lib/ai/gemini";
import { getHomeNote } from "@/lib/ai/home";
import { getBudget } from "@/lib/ai/run";
import { getContext } from "@/lib/context";
import { AiAskForm, AiNote } from "../ai-client";
import { WidgetCard } from "../widget-card";
import type { WidgetProps } from "../types";

const euros = (micros: number) => (micros / 1_000_000).toLocaleString("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 2 });

export function AiAskWidget() {
  return <WidgetCard title="Preguntar al asistente" href="/chat"><AiAskForm /></WidgetCard>;
}

/** Resumen del día: se genera una vez al día (la primera vez que abres Inicio) y se guarda. */
export async function AiBriefWidget() {
  const note = await getHomeNote("brief");
  return <WidgetCard title="Resumen del día"><AiNote kind="brief" initial={note?.content ?? null} stale={false} hasKey={hasGeminiKey()} /></WidgetCard>;
}

/** Sugerencia de qué hacer ahora: solo al pulsar; se reutiliza 3 horas. */
export async function AiSuggestWidget() {
  const note = await getHomeNote("suggestion");
  const mins = note?.minutesLeft ?? 0;
  return (
    <WidgetCard title="¿Qué hago ahora?">
      <AiNote kind="suggestion" initial={note?.content ?? null} stale={note?.stale ?? false} hasKey={hasGeminiKey()} />
      {note && !note.stale && <p className="mt-2 text-xs text-muted">Podrás pedir otra en {mins >= 60 ? `${Math.floor(mins / 60)} h ${mins % 60} min` : `${mins} min`}.</p>}
    </WidgetCard>
  );
}

/** Gasto de IA del mes frente al presupuesto (anillo). */
export async function AiUsageWidget({ w }: WidgetProps) {
  const { supabase, workspaceId, userId, timezone } = await getContext();
  const { data: p } = await supabase.from("profiles").select("ai_monthly_budget_cents").eq("user_id", userId).maybeSingle();
  const b = await getBudget({ supabase, workspaceId, timezone, budgetCents: p?.ai_monthly_budget_cents ?? 1000 });
  const pct = Math.min(100, Math.round(b.budgetMicros ? (b.spentMicros / b.budgetMicros) * 100 : 0));
  const color = pct >= 100 ? "var(--bad)" : pct >= 80 ? "#f59e0b" : "var(--accent)";
  const r = 15.5, c = 2 * Math.PI * r;
  return (
    <WidgetCard title="Consumo de IA" href="/ajustes">
      <div className="flex items-center gap-3">
        <svg viewBox="0 0 36 36" width={w.size === "s" ? 64 : 80} height={w.size === "s" ? 64 : 80} role="img" aria-label={`${pct} % del presupuesto`} className="shrink-0">
          <circle cx="18" cy="18" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="3.5" />
          <circle cx="18" cy="18" r={r} fill="none" stroke={color} strokeWidth="3.5" strokeLinecap="round" strokeDasharray={`${(pct / 100) * c} ${c}`} transform="rotate(-90 18 18)" />
          <text x="18" y="20.5" textAnchor="middle" fontSize="8" fontWeight="700" fill="var(--foreground)">{pct}%</text>
        </svg>
        <div className="min-w-0 text-sm">
          <p className="font-bold tabular-nums">{euros(b.spentMicros)}</p>
          <p className="text-xs text-muted">de {euros(b.budgetMicros)} este mes</p>
          {w.size !== "s" && <p className="mt-1 text-xs text-muted">{b.byFeature.reduce((s, f) => s + f.calls, 0)} usos</p>}
        </div>
      </div>
    </WidgetCard>
  );
}
