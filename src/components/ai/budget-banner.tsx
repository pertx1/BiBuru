import Link from "next/link";
import { getContext } from "@/lib/context";
import { getBudget } from "@/lib/ai/run";
import { microsToEuros } from "@/lib/ai/pricing";

/** Aviso del gasto de IA: desde el 80 % del presupuesto mensual (y al 100 %, cuando se pausa). */
export async function BudgetBanner() {
  let b: Awaited<ReturnType<typeof getBudget>> | null = null;
  try {
    const { supabase, workspaceId, userId, timezone } = await getContext();
    const { data: p } = await supabase.from("profiles").select("ai_monthly_budget_cents").eq("user_id", userId).maybeSingle();
    b = await getBudget({ supabase, workspaceId, timezone, budgetCents: p?.ai_monthly_budget_cents ?? 1000 });
  } catch {
    return null;
  }
  if (b.level === "ok") return null;
  const eur = (m: number) => microsToEuros(m).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
  return (
    <div role="status" className={`mb-4 rounded-xl border px-4 py-3 text-sm ${b.level === "blocked" ? "border-danger/40 bg-danger/5" : "border-amber-500/40 bg-amber-500/5"}`}>
      {b.level === "blocked"
        ? <>Has llegado al presupuesto de IA de este mes ({eur(b.budgetMicros)}). El chat, el dictado y el análisis de vídeo se pausan hasta el mes que viene; la captura sigue funcionando. </>
        : <>Llevas gastado el {Math.round(b.pct)} % del presupuesto de IA ({eur(b.spentMicros)} de {eur(b.budgetMicros)}). </>}
      <Link href="/ajustes" className="font-medium text-accent underline">Ver consumo</Link>
    </div>
  );
}
