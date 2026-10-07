"use client";

import { Boxes, Flag, ListChecks, Repeat } from "lucide-react";
import { useRouter } from "next/navigation";
import { useOptimistic, useState, useTransition } from "react";
import { receiveForTask } from "@/app/(app)/negocios/stock-actions";
import { setTaskDue, snoozeTask, toggleTask, undoComplete } from "@/app/(app)/tareas/actions";
import { SwipeRow } from "@/components/ui/swipe-row";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import type { TaskWithSubs } from "@/lib/tasks/data";
import { dueLabel, PRIORITY_COLORS } from "@/lib/tasks/format";
import { cn } from "@/lib/utils";
import { TaskSheet, type BizOption, type GoalOption } from "./task-sheet";

type Group = { key: string; title: string; tone?: "danger"; tasks: TaskWithSubs[] };

export function TaskList({
  groups, businesses, goals, today, emptyText, showDone, defaultBusinessId, openTask,
}: {
  groups: Group[]; businesses: BizOption[]; goals: GoalOption[]; today: string; emptyText: string; showDone?: boolean; defaultBusinessId?: string; openTask?: TaskWithSubs | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [, start] = useTransition();
  const [editing, setEditing] = useState<TaskWithSubs | null>(openTask ?? null);
  const bizById = new Map(businesses.map((b) => [b.id, b]));
  const [hidden, hide] = useOptimistic<string[], string>([], (s, id) => [...s, id]);

  const [receiving, setReceiving] = useState<TaskWithSubs | null>(null);
  const [units, setUnits] = useState("");

  function toggle(t: TaskWithSubs) {
    const completing = t.status !== "done";
    // Tarea «Reponer» de Stock: antes de cerrarla se pregunta cuántas unidades han entrado.
    if (completing && t.stock_key) { setUnits(String(t.stock_missing ?? "")); setReceiving(t); return; }
    start(async () => {
      hide(t.id);
      const r = await toggleTask(t.id, completing);
      if (r.ok) {
        toast({
          message: completing ? "Hecha ✔" : "Reabierta", actionLabel: "Deshacer",
          onAction: () => void (completing ? undoComplete(t.id, r.nextId) : toggleTask(t.id, true)).then(() => router.refresh()),
        });
      }
      router.refresh();
    });
  }

  /** Deslizar a la izquierda: posponer a mañana (con «Deshacer»). */
  function postpone(t: TaskWithSubs) {
    start(async () => {
      hide(t.id);
      const r = await snoozeTask(t.id, "manana");
      if (r.ok && r.previous) {
        const prev = r.previous;
        toast({ message: "Pospuesta a mañana", actionLabel: "Deshacer", onAction: () => void setTaskDue(t.id, prev).then(() => router.refresh()) });
      }
      router.refresh();
    });
  }

  const total = groups.reduce((n, g) => n + g.tasks.length, 0);
  if (total === 0) return <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted">{emptyText}</p>;

  return (
    <>
      <div className="flex flex-col gap-5">
        {groups.filter((g) => g.tasks.length > 0).map((g) => (
          <section key={g.key} aria-label={g.title}>
            <h2 className={cn("mb-1.5 px-1 text-xs font-semibold uppercase tracking-wide", g.tone === "danger" ? "text-danger" : "text-muted")}>{g.title} · {g.tasks.length}</h2>
            <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
              {g.tasks.filter((t) => !hidden.includes(t.id)).map((t) => {
                const due = dueLabel(t.due_date, t.due_time, today);
                const biz = t.business_id ? bizById.get(t.business_id) : undefined;
                const subDone = t.subtasks.filter((s) => s.status === "done").length;
                return (
                  <SwipeRow key={t.id} onRight={() => toggle(t)} onLeft={t.status === "done" ? undefined : () => postpone(t)} rightLabel={t.status === "done" ? "Reabrir" : "Hecha ✔"} leftLabel="Mañana →">
                    <label className="flex w-12 shrink-0 cursor-pointer items-center justify-center" aria-label={`Marcar «${t.title}»`}>
                      <input type="checkbox" checked={t.status === "done"} onChange={() => toggle(t)} className="size-5 accent-[var(--accent)]" />
                    </label>
                    <button type="button" onClick={() => setEditing(t)} className="flex min-h-14 min-w-0 flex-1 flex-col justify-center gap-0.5 py-2 pr-4 text-left hover:bg-surface-2">
                      <span className={cn("truncate text-sm font-medium", t.status === "done" && "text-muted line-through")}>{t.title}</span>
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
                        {due.text && <span className={cn(due.overdue && "font-medium text-danger", due.today && "font-medium text-accent")}>{due.text}</span>}
                        {biz && <span className="inline-flex items-center gap-1"><span className="size-2 rounded-full" style={{ backgroundColor: biz.color }} aria-hidden />{biz.name}</span>}
                        {t.stock_key && <span className="inline-flex items-center gap-0.5 rounded-full border border-border px-1.5 font-medium"><Boxes className="size-3" aria-hidden />Stock</span>}
                        {t.priority > 0 && <Flag className="size-3.5" style={{ color: PRIORITY_COLORS[t.priority] }} aria-label={`Prioridad ${t.priority}`} />}
                        {t.recurrence != null && <Repeat className="size-3.5" aria-label="Se repite" />}
                        {t.subtasks.length > 0 && <span className="inline-flex items-center gap-0.5"><ListChecks className="size-3.5" aria-hidden />{subDone}/{t.subtasks.length}</span>}
                      </span>
                    </button>
                  </SwipeRow>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
      <TaskSheet task={editing} open={editing !== null} onClose={() => { setEditing(null); router.refresh(); }} businesses={businesses} goals={goals} today={today} defaultBusinessId={defaultBusinessId} />
      {showDone ? null : null}
      <Sheet open={!!receiving} onClose={() => setReceiving(null)} title="¿Cuántas unidades han entrado?">
        {receiving && (
          <form className="flex flex-col gap-3" onSubmit={(e) => {
            e.preventDefault();
            const t = receiving;
            start(async () => {
              hide(t.id); setReceiving(null);
              const r = await receiveForTask({ taskId: t.id, units: Math.max(0, parseInt(units, 10) || 0) });
              toast({ message: r.ok ? "Entrada registrada y tarea hecha ✔" : r.error });
              router.refresh();
            });
          }}>
            <p className="text-sm text-muted">{receiving.title}. Se sumarán al stock y la tarea se cerrará. Si aún faltan, se abrirá otra con lo que quede.</p>
            <Input inputMode="numeric" value={units} onChange={(e) => setUnits(e.target.value)} aria-label="Unidades que han entrado" autoFocus />
            <Button type="submit">Registrar entrada y completar</Button>
            <Button type="button" variant="secondary" onClick={() => { const t = receiving; setUnits("0"); start(async () => { hide(t.id); setReceiving(null); await receiveForTask({ taskId: t.id, units: 0 }); router.refresh(); }); }}>Completar sin registrar nada</Button>
          </form>
        )}
      </Sheet>
    </>
  );
}
