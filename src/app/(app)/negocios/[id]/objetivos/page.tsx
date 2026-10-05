import { GoalCard } from "@/components/goals/goal-card";
import { GoalFormButton } from "@/components/goals/goal-form";
import { listBusinesses } from "@/lib/data";
import { getNow, listGoals } from "@/lib/tasks/data";

export const metadata = { title: "Objetivos del negocio" };

export default async function ObjetivosNegocioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [now, goals, businesses] = await Promise.all([getNow(), listGoals({ status: "active", businessId: id }), listBusinesses()]);
  return (
    <div className="flex flex-col gap-4">
      <div><GoalFormButton businesses={businesses.map((b) => ({ id: b.id, name: b.name }))} defaultBusinessId={id} /></div>
      {goals.length === 0 ? <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted">Este negocio no tiene objetivos activos.</p> : (
        <ul className="grid gap-3 md:grid-cols-2">{goals.map((g) => <li key={g.id}><GoalCard goal={g} today={now.date} /></li>)}</ul>
      )}
    </div>
  );
}
