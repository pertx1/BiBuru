import Link from "next/link";
import { Target } from "lucide-react";
import { GoalCard } from "@/components/goals/goal-card";
import { GoalFormButton } from "@/components/goals/goal-form";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { listBusinesses } from "@/lib/data";
import { getNow, listGoals } from "@/lib/tasks/data";
import { cn } from "@/lib/utils";

export const metadata = { title: "Objetivos" };

export default async function ObjetivosPage({ searchParams }: { searchParams: Promise<{ v?: string; negocio?: string }> }) {
  const { v, negocio } = await searchParams;
  const closed = v === "cerrados";
  const businessId = negocio && /^[0-9a-f-]{36}$/i.test(negocio) ? negocio : undefined;
  const [now, goals, businesses] = await Promise.all([getNow(), listGoals({ status: closed ? "done" : "active", businessId }), listBusinesses()]);
  const biz = new Map(businesses.map((b) => [b.id, b]));
  const href = (o: { v?: string; negocio?: string }) => { const q = new URLSearchParams(Object.entries(o).filter(([, x]) => x) as [string, string][]).toString(); return q ? `/objetivos?${q}` : "/objetivos"; };
  return (
    <>
      <PageHeader title="Objetivos" subtitle="Metas con progreso medible y fecha límite." />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <GoalFormButton businesses={businesses.map((b) => ({ id: b.id, name: b.name }))} defaultBusinessId={businessId} />
        <nav aria-label="Estado" className="flex gap-1.5">
          {[["", "Activos"], ["cerrados", "Cumplidos y archivados"]].map(([k, l]) => (
            <Link key={k} href={href({ v: k, negocio: businessId })} aria-current={(k === "cerrados") === closed ? "page" : undefined}
              className={cn("flex min-h-11 items-center rounded-full border border-border px-3.5 text-sm md:min-h-10", (k === "cerrados") === closed ? "border-accent bg-accent text-accent-foreground" : "bg-surface hover:bg-surface-2")}>{l}</Link>
          ))}
        </nav>
      </div>
      {businesses.length > 0 && (
        <nav aria-label="Negocio" className="-mx-4 mb-4 flex gap-1.5 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0">
          {[{ id: "", name: "Todos" }, ...businesses].map((b) => (
            <Link key={b.id || "all"} href={href({ v: closed ? "cerrados" : "", negocio: b.id })} aria-current={(b.id || undefined) === businessId ? "page" : undefined}
              className={cn("flex min-h-11 shrink-0 items-center rounded-full px-3.5 text-sm md:min-h-9", (b.id || undefined) === businessId ? "bg-accent text-accent-foreground" : "bg-fill")}>{b.name}</Link>
          ))}
        </nav>
      )}
      {goals.length === 0 ? (
        <EmptyState icon={Target} title={closed ? "Aún no hay objetivos cerrados" : "Define tu primer objetivo"}>
          {closed ? "Aquí aparecerán los que cumplas o archives." : "Por ejemplo «ingresar 5.000 € este trimestre» (se actualiza solo con tus pedidos) o «lanzar la nueva colección» (con hitos)."}
        </EmptyState>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {goals.map((g) => <li key={g.id}><GoalCard goal={g} today={now.date} businessName={g.business_id ? biz.get(g.business_id)?.name : undefined} businessColor={g.business_id ? biz.get(g.business_id)?.color : undefined} /></li>)}
        </ul>
      )}
    </>
  );
}
