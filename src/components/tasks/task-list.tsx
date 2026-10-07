"use client";

import { AlarmClock, Boxes, Check, ListChecks, Repeat } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { receiveForTask } from "@/app/(app)/negocios/stock-actions";
import { completeTask, moveToTomorrow, restoreDueDate, uncompleteTask } from "@/app/(app)/tareas/actions";
import { SwipeRow } from "@/components/ui/swipe-row";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import type { TaskWithSubs } from "@/lib/tasks/data";
import { relativeDay } from "@/lib/tasks/format";
import { PRIORITY_META } from "@/lib/tasks/input";
import { cn } from "@/lib/utils";

export type BizOption = { id: string; name: string; color: string; icon?: string };
type Group = { key: string; title: string; tone?: "danger"; tasks: TaskWithSubs[] };

/**
 * Lista de tareas como Antola: círculo del color de la prioridad para completar (optimista, «¡Hecho! ✓» con «Deshacer»
 * 5 s, se refresca a los ~700 ms y vuelve atrás si falla), y la fila abre el detalle `/tareas/<id>`.
 * Con el dedo: deslizar a la derecha completa y a la izquierda pasa a mañana.
 */
export function TaskList({ groups, businesses, today, empty, compact }: {
  groups: Group[]; businesses: BizOption[]; today: string; empty: { title: string; text?: string }; compact?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [, start] = useTransition();
  const [done, setDone] = useState<Record<string, boolean>>({});   // estado optimista
  const [gone, setGone] = useState<string[]>([]);                  // movidas a mañana
  const [receiving, setReceiving] = useState<TaskWithSubs | null>(null);
  const [units, setUnits] = useState("");
  const bizById = new Map(businesses.map((b) => [b.id, b]));
  const later = () => setTimeout(() => router.refresh(), 700);

  function toggle(t: TaskWithSubs) {
    const wasDone = done[t.id] ?? t.status === "done";
    setDone((s) => ({ ...s, [t.id]: !wasDone }));
    start(async () => {
      if (wasDone) {
        const r = await uncompleteTask(t.id);
        if (!r.ok) { setDone((s) => ({ ...s, [t.id]: true })); toast({ message: r.error }); return; }
        toast({ message: "Marcada como pendiente", durationMs: 3000 });
        later();
        return;
      }
      const r = await completeTask(t.id);
      if (!r.ok) { setDone((s) => ({ ...s, [t.id]: false })); toast({ message: r.error }); return; }
      if (t.external_key?.startsWith("stock:")) {
        // Tarea «Pedir …» de Stock: se tacha como cualquier otra (como en BATU); si quieres, apuntas lo que ha llegado.
        toast({ message: "¡Hecho! ✓", actionLabel: "Apuntar unidades", durationMs: 5000, onAction: () => { setUnits(String(t.stock_missing || "")); setReceiving(t); } });
      } else {
        toast({
          message: "¡Hecho! ✓", actionLabel: "Deshacer", durationMs: 5000,
          onAction: () => { setDone((s) => ({ ...s, [t.id]: false })); void uncompleteTask(t.id).then(() => router.refresh()); },
        });
      }
      later();
    });
  }

  function tomorrow(t: TaskWithSubs) {
    setGone((g) => [...g, t.id]);
    start(async () => {
      const r = await moveToTomorrow(t.id);
      if (!r.ok) { setGone((g) => g.filter((x) => x !== t.id)); toast({ message: r.error }); return; }
      toast({ message: "Pasada a mañana", actionLabel: "Deshacer", durationMs: 5000, onAction: () => { setGone((g) => g.filter((x) => x !== t.id)); void restoreDueDate(t.id, r.previous).then(() => router.refresh()); } });
      later();
    });
  }

  const visible = groups.map((g) => ({ ...g, tasks: g.tasks.filter((t) => !gone.includes(t.id)) })).filter((g) => g.tasks.length > 0);
  if (visible.length === 0) {
    return (
      <div className={cn("rounded-xl border border-dashed border-border text-center", compact ? "p-4" : "px-6 py-10")}>
        <p className="font-semibold">{empty.title}</p>
        {empty.text && <p className="mt-1 text-sm text-muted">{empty.text}</p>}
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-5">
        {visible.map((g) => (
          <section key={g.key} aria-label={g.title || "Tareas"} className={cn(g.tone === "danger" && "rounded-2xl border border-danger/30 bg-danger/5 p-2")}>
            {g.title && <h2 className={cn("mb-1.5 px-1 text-xs font-semibold uppercase tracking-wide", g.tone === "danger" ? "text-danger" : "text-muted")}>{g.title} · {g.tasks.length}</h2>}
            <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
              {g.tasks.map((t) => {
                const isDone = done[t.id] ?? t.status === "done";
                const prio = PRIORITY_META[t.priority] ?? PRIORITY_META[2];
                const biz = t.business_id ? bizById.get(t.business_id) : undefined;
                const subDone = t.subtasks.filter((s) => s.done).length;
                const overdue = !!t.due_date && t.due_date < today && !isDone;
                return (
                  <SwipeRow key={t.id} onRight={() => toggle(t)} onLeft={isDone ? undefined : () => tomorrow(t)} rightLabel={isDone ? "Pendiente" : "¡Hecho! ✓"} leftLabel="Mañana →">
                    <button type="button" onClick={() => toggle(t)} aria-pressed={isDone} aria-label={isDone ? `Marcar «${t.title}» como pendiente` : `Completar «${t.title}» (prioridad ${prio.label.toLowerCase()})`}
                      className="flex w-12 shrink-0 items-center justify-center">
                      <span className={cn("flex size-6 items-center justify-center rounded-full border-2 transition-colors", prio.ring, isDone && "border-good bg-good text-background")}>
                        {isDone && <Check className="size-4" strokeWidth={3} aria-hidden />}
                      </span>
                    </button>
                    <Link href={`/tareas/${t.id}`} className="flex min-h-14 min-w-0 flex-1 flex-col justify-center gap-0.5 py-2 pr-4 hover:bg-surface-2">
                      <span className={cn("truncate text-[0.95rem] font-medium", isDone && "text-muted line-through")}>{t.title}</span>
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
                        {t.due_date && <span className={cn(overdue && "font-medium text-danger")}>{relativeDay(t.due_date, today)}</span>}
                        {t.due_time && <span className="tabular-nums">{t.due_time.slice(0, 5)}</span>}
                        {biz && <span className="inline-flex items-center gap-1"><span className="size-2 rounded-full" style={{ backgroundColor: biz.color }} aria-hidden />{biz.name}</span>}
                        {t.external_key?.startsWith("stock:") && <span className="inline-flex items-center gap-0.5 rounded-full border border-border px-1.5 font-medium"><Boxes className="size-3" aria-hidden />Stock</span>}
                        {t.subtasks.length > 0 && <span className="inline-flex items-center gap-0.5 tabular-nums"><ListChecks className="size-3.5" aria-hidden />{subDone}/{t.subtasks.length}</span>}
                        {t.repeat !== "none" && <Repeat className="size-3.5" aria-label="Se repite" />}
                        {t.remind_at && !isDone && <AlarmClock className="size-3.5" aria-label="Con recordatorio" />}
                      </span>
                    </Link>
                  </SwipeRow>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
      <Sheet open={!!receiving} onClose={() => setReceiving(null)} title="¿Cuántas unidades han entrado?">
        {receiving && (
          <form className="flex flex-col gap-3" onSubmit={(e) => {
            e.preventDefault();
            const t = receiving;
            start(async () => {
              setReceiving(null);
              const r = await receiveForTask({ taskId: t.id, units: Math.max(0, parseInt(units, 10) || 0) });
              toast({ message: r.ok ? "Entrada apuntada en Stock ✔" : r.error });
              router.refresh();
            });
          }}>
            <p className="text-sm text-muted">{receiving.title}: se sumarán al stock.</p>
            <Input inputMode="numeric" value={units} onChange={(e) => setUnits(e.target.value)} aria-label="Unidades que han entrado" autoFocus />
            <Button type="submit">Apuntar entrada</Button>
          </form>
        )}
      </Sheet>
    </>
  );
}
