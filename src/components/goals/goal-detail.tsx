"use client";

import { Archive, Check, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addMilestone, deleteGoal, deleteMilestone, saveGoal, setGoalProgress, setGoalStatus, toggleMilestone } from "@/app/(app)/objetivos/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { formatDecimal } from "@/lib/money";
import type { GoalView } from "@/lib/tasks/data";

/** Acciones del detalle: actualizar avance, hitos, archivar y eliminar (con deshacer). */
export function GoalActions({ goal, canEditValue }: { goal: GoalView; canEditValue: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ms, setMs] = useState("");
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) =>
    start(async () => { const r = await fn(); if (!r.ok) setError(r.error ?? "Error"); else { setError(null); after?.(); } router.refresh(); });

  return (
    <div className="flex flex-col gap-5">
      {canEditValue && (
        <form className="rounded-xl border border-border bg-surface p-4" action={(fd) => run(() => setGoalProgress(goal.id, String(fd.get("v") ?? ""), String(fd.get("n") ?? "")))}>
          <h2 className="mb-2 text-sm font-semibold">Actualizar avance</h2>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <Input name="v" inputMode="decimal" aria-label="Valor actual" defaultValue={formatDecimal(goal.current_value)} required />
            <Button type="submit" disabled={pending}><Check className="size-4" aria-hidden /> Guardar</Button>
            <Input name="n" aria-label="Nota (opcional)" placeholder="Nota (opcional)" maxLength={500} className="col-span-2" />
          </div>
        </form>
      )}

      {goal.measure_type === "milestones" && (
        <section className="rounded-xl border border-border bg-surface p-4">
          <h2 className="mb-2 text-sm font-semibold">Hitos</h2>
          <ul className="mb-2 divide-y divide-border">
            {goal.milestones.map((m) => (
              <li key={m.id} className="flex items-center gap-2">
                <label className="flex min-h-11 flex-1 cursor-pointer items-center gap-3 text-sm">
                  <input type="checkbox" checked={m.done} onChange={(e) => run(() => toggleMilestone(m.id, e.target.checked))} className="size-5" />
                  <span className={m.done ? "text-muted line-through" : ""}>{m.title}</span>
                </label>
                <button type="button" aria-label={`Eliminar ${m.title}`} className="flex size-10 items-center justify-center text-muted hover:text-danger" onClick={() => run(() => deleteMilestone(m.id))}><Trash2 className="size-4" aria-hidden /></button>
              </li>
            ))}
            {goal.milestones.length === 0 && <li className="py-2 text-sm text-muted">Añade el primer hito.</li>}
          </ul>
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); const t = ms; setMs(""); if (t.trim()) run(() => addMilestone(goal.id, t)); }}>
            <Input value={ms} onChange={(e) => setMs(e.target.value)} placeholder="Nuevo hito" aria-label="Nuevo hito" maxLength={200} /><Button type="submit" disabled={!ms.trim()}>Añadir</Button>
          </form>
        </section>
      )}

      <div className="flex flex-wrap gap-2">
        {goal.status === "active" ? (
          <Button variant="secondary" disabled={pending} onClick={() => { run(() => setGoalStatus(goal.id, "completed")); toast({ message: "Objetivo marcado como cumplido", actionLabel: "Deshacer", onAction: () => run(() => setGoalStatus(goal.id, "active")) }); }}><Check className="size-4" aria-hidden /> Marcar cumplido</Button>
        ) : (
          <Button variant="secondary" disabled={pending} onClick={() => run(() => setGoalStatus(goal.id, "active"))}>Reactivar</Button>
        )}
        {goal.status !== "archived" && <Button variant="ghost" disabled={pending} onClick={() => { run(() => setGoalStatus(goal.id, "archived")); toast({ message: "Objetivo archivado", actionLabel: "Deshacer", onAction: () => run(() => setGoalStatus(goal.id, goal.status as "active")) }); }}><Archive className="size-4" aria-hidden /> Archivar</Button>}
        <Button variant="ghost" disabled={pending} onClick={() => {
          const snap = { id: goal.id, title: goal.title, description: goal.description ?? undefined, business_id: goal.business_id, measure_type: goal.measure_type as "number", target: formatDecimal(goal.target_value), auto_source: (goal.auto_source ?? undefined) as "income" | undefined, period_start: goal.period_start ?? undefined, deadline: goal.deadline ?? undefined };
          const msSnap = goal.milestones;
          start(async () => {
            const r = await deleteGoal(goal.id);
            if (!r.ok) return setError(r.error);
            router.push("/objetivos");
            toast({ message: "Objetivo eliminado", actionLabel: "Deshacer", onAction: () => void (async () => { await saveGoal(snap); for (const m of msSnap) await addMilestone(goal.id, m.title); router.refresh(); })() });
          });
        }}><Trash2 className="size-4" aria-hidden /> Eliminar</Button>
      </div>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </div>
  );
}
