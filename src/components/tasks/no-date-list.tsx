"use client";

import { CalendarPlus, Check } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { completeTask, rescheduleTasks, restoreDueDate, uncompleteTask } from "@/app/(app)/tareas/actions";
import { useToast } from "@/components/ui/toast";
import { addDays } from "@/lib/dates";
import { PRIORITY_META } from "@/lib/tasks/input";
import { cn } from "@/lib/utils";

export type NoDateTask = { id: string; title: string; priority: number; business: { name: string; color: string } | null };

/**
 * Tareas sin fecha (bloque fijo de Inicio y revisión diaria): completar (con «Deshacer»), ponerles fecha (hoy, mañana o
 * una fecha) o abrirlas. No cuentan como atrasadas y siguen aquí cada día hasta que se hacen.
 */
export function NoDateList({ tasks, total, today, allHref = "/tareas?f=sinfecha" }: { tasks: NoDateTask[]; total: number; today: string; allHref?: string }) {
  const router = useRouter();
  const toast = useToast();
  const [, start] = useTransition();
  const [hidden, setHidden] = useState<string[]>([]);
  const [dating, setDating] = useState<string | null>(null);
  const shown = tasks.filter((t) => !hidden.includes(t.id));
  const hide = (id: string) => setHidden((h) => [...h, id]);
  const unhide = (id: string) => setHidden((h) => h.filter((x) => x !== id));

  const done = (t: NoDateTask) => {
    hide(t.id);
    start(async () => {
      const r = await completeTask(t.id);
      if (!r.ok) { unhide(t.id); toast({ message: r.error }); return; }
      toast({ message: "¡Hecho! ✓", actionLabel: "Deshacer", durationMs: 5000, onAction: () => { unhide(t.id); void uncompleteTask(t.id).then(() => router.refresh()); } });
      setTimeout(() => router.refresh(), 700);
    });
  };
  const setDate = (t: NoDateTask, date: string) => {
    if (!date) return;
    setDating(null); hide(t.id);
    start(async () => {
      const r = await rescheduleTasks([t.id], date);
      if (!r.ok) { unhide(t.id); toast({ message: r.error }); return; }
      toast({ message: date === today ? "Para hoy" : date === addDays(today, 1) ? "Para mañana" : "Fecha puesta", actionLabel: "Deshacer", onAction: () => { unhide(t.id); void restoreDueDate(t.id, null).then(() => router.refresh()); } });
      router.refresh();
    });
  };

  if (shown.length === 0) return <p className="text-sm text-muted">No hay tareas sin fecha. 👌</p>;
  return (
    <div className="flex flex-col gap-1">
      <ul className="flex flex-col divide-y divide-border">
        {shown.map((t) => (
          <li key={t.id} className="py-1">
            <div className="flex min-h-11 items-center gap-2">
              <button type="button" onClick={() => done(t)} aria-label={`Completar «${t.title}»`}
                className={cn("flex size-11 shrink-0 items-center justify-center rounded-full")}>
                <span className={cn("flex size-5 items-center justify-center rounded-full border-2", PRIORITY_META[t.priority]?.ring ?? "border-muted/60")}><Check className="size-3 opacity-0" aria-hidden /></span>
              </button>
              <Link href={`/tareas/${t.id}`} className="min-w-0 flex-1 truncate text-sm">
                {t.title}
                {t.business && <span className="ml-1.5 text-xs text-muted">· {t.business.name}</span>}
              </Link>
              <button type="button" onClick={() => setDating(dating === t.id ? null : t.id)} aria-expanded={dating === t.id} aria-label={`Poner fecha a «${t.title}»`}
                className="flex size-11 shrink-0 items-center justify-center rounded-full text-muted hover:text-foreground">
                <CalendarPlus className="size-4" aria-hidden />
              </button>
            </div>
            {dating === t.id && (
              <div className="flex flex-wrap items-center gap-2 pb-2 pl-11">
                <button type="button" onClick={() => setDate(t, today)} className="min-h-11 rounded-full bg-fill px-3 text-sm md:min-h-9">Hoy</button>
                <button type="button" onClick={() => setDate(t, addDays(today, 1))} className="min-h-11 rounded-full bg-fill px-3 text-sm md:min-h-9">Mañana</button>
                <label className="flex items-center gap-1 text-sm text-muted">Otra
                  <input type="date" min={today} onChange={(e) => setDate(t, e.target.value)} className="min-h-11 rounded-lg bg-fill px-2 text-base md:min-h-9 md:text-sm" />
                </label>
              </div>
            )}
          </li>
        ))}
      </ul>
      {total > tasks.length && <Link href={allHref} className="inline-flex min-h-11 items-center text-sm font-medium text-accent">Ver todas ({total})</Link>}
    </div>
  );
}
