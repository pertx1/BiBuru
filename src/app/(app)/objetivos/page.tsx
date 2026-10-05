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

export default async function ObjetivosPage({ searchParams }: { searchParams: Promise<{ v?: string }> }) {
  const { v } = await searchParams;
  const closed = v === "cerrados";
  const [now, goals, businesses] = await Promise.all([getNow(), listGoals({ status: closed ? "done" : "active" }), listBusinesses()]);
  const biz = new Map(businesses.map((b) => [b.id, b]));
  return (
    <>
      <PageHeader title="Objetivos" subtitle="Metas con progreso medible y fecha límite." />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <GoalFormButton businesses={businesses.map((b) => ({ id: b.id, name: b.name }))} />
        <nav aria-label="Estado" className="flex gap-1.5">
          {[["", "Activos"], ["cerrados", "Cumplidos y archivados"]].map(([k, l]) => (
            <Link key={k} href={k ? `/objetivos?v=${k}` : "/objetivos"} aria-current={(k === "cerrados") === closed ? "page" : undefined}
              className={cn("flex min-h-10 items-center rounded-full border border-border px-3.5 text-sm", (k === "cerrados") === closed ? "border-accent bg-accent text-accent-foreground" : "bg-surface hover:bg-surface-2")}>{l}</Link>
          ))}
        </nav>
      </div>
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
