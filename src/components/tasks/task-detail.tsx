"use client";

import { AlarmClock, CalendarClock, Check, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { addSubtask, completeTask, deleteSubtask, deleteTask, moveToTomorrow, restoreDueDate, snoozeTask, uncompleteTask, updateSubtask } from "@/app/(app)/tareas/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import type { Subtask } from "@/lib/tasks/data";
import { cn } from "@/lib/utils";

const quick = "min-h-12 justify-center gap-1.5 whitespace-nowrap px-3 text-[15px] font-semibold";

/** Acciones rápidas del detalle (destino de la notificación): Hecho / Marcar pendiente, Mañana, Posponer 15 min y 1 h. */
export function TaskQuickActions({ id, done }: { id: string; done: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<void>) => start(fn);

  return (
    <div className="grid grid-cols-2 gap-2">
      {done ? (
        <Button variant="secondary" className={quick} disabled={pending} onClick={() => run(async () => {
          const r = await uncompleteTask(id);
          toast({ message: r.ok ? "Marcada como pendiente" : r.error });
          router.refresh();
        })}><RotateCcw className="size-5" aria-hidden /> Marcar pendiente</Button>
      ) : (
        <Button className={cn(quick, "bg-good text-background hover:opacity-90")} disabled={pending} onClick={() => run(async () => {
          const r = await completeTask(id);
          if (!r.ok) return toast({ message: r.error });
          toast({ message: "¡Hecho! ✓", actionLabel: "Deshacer", durationMs: 5000, onAction: () => void uncompleteTask(id).then(() => router.refresh()) });
          router.refresh();
        })}><Check className="size-5" aria-hidden /> Hecho</Button>
      )}
      <Button variant="secondary" className={quick} disabled={pending || done} onClick={() => run(async () => {
        const r = await moveToTomorrow(id);
        if (!r.ok) return toast({ message: r.error });
        toast({ message: "Pasada a mañana", actionLabel: "Deshacer", durationMs: 5000, onAction: () => void restoreDueDate(id, r.previous).then(() => router.refresh()) });
        router.refresh();
      })}><CalendarClock className="size-5" aria-hidden /> Mañana</Button>
      {([15, 60] as const).map((m) => (
        <Button key={m} variant="secondary" className={quick} disabled={pending || done} onClick={() => run(async () => {
          const r = await snoozeTask(id, m);
          toast({ message: r.ok ? `Te aviso dentro de ${m === 15 ? "15 min" : "1 h"}` : r.error });
          router.refresh();
        })}><AlarmClock className="size-5" aria-hidden /> Posponer {m === 15 ? "15 min" : "1 h"}</Button>
      ))}
    </div>
  );
}

/** Subtareas editables: marcar, renombrar (al salir del campo), quitar y añadir. */
export function SubtaskEditor({ taskId, subtasks }: { taskId: string; subtasks: Subtask[] }) {
  const router = useRouter();
  const toast = useToast();
  const [, start] = useTransition();
  const [items, setItems] = useState(subtasks);
  const [text, setText] = useState("");
  // Al refrescar desde el servidor llegan las subtareas nuevas: se toman (sin efecto, como recomienda React).
  const [seen, setSeen] = useState(subtasks);
  if (seen !== subtasks) { setSeen(subtasks); setItems(subtasks); }

  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, revert?: () => void) => start(async () => {
    const r = await fn();
    if (!r.ok) { revert?.(); toast({ message: r.error ?? "No se pudo guardar" }); }
    router.refresh();
  });
  const add = () => {
    const t = text.trim();
    if (!t) return;
    setText("");
    act(() => addSubtask(taskId, t), () => setText(t));
  };

  return (
    <section aria-label="Subtareas" className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold">Subtareas{items.length > 0 && <span className="ml-1 font-normal text-muted">{items.filter((s) => s.done).length}/{items.length}</span>}</h2>
      {items.length > 0 && (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
          {items.map((s) => (
            <li key={s.id} className="flex items-center">
              <button type="button" aria-pressed={s.done} aria-label={s.done ? `Desmarcar ${s.title}` : `Marcar ${s.title}`} className="flex size-12 shrink-0 items-center justify-center"
                onClick={() => { setItems((xs) => xs.map((x) => (x.id === s.id ? { ...x, done: !s.done } : x))); act(() => updateSubtask(s.id, { done: !s.done }), () => setItems((xs) => xs.map((x) => (x.id === s.id ? { ...x, done: s.done } : x)))); }}>
                <span className={cn("flex size-5 items-center justify-center rounded-md border-2", s.done ? "border-good bg-good text-background" : "border-muted/60")}>{s.done && <Check className="size-3.5" strokeWidth={3} aria-hidden />}</span>
              </button>
              <input defaultValue={s.title} aria-label="Subtarea" maxLength={300}
                className={cn("min-h-12 min-w-0 flex-1 bg-transparent text-base outline-none md:text-sm", s.done && "text-muted line-through")}
                onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== s.title) act(() => updateSubtask(s.id, { title: v })); else e.target.value = s.title; }}
                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
              <button type="button" aria-label={`Quitar ${s.title}`} className="flex size-12 shrink-0 items-center justify-center text-muted hover:text-danger"
                onClick={() => { setItems((xs) => xs.filter((x) => x.id !== s.id)); act(() => deleteSubtask(s.id)); }}><X className="size-4" aria-hidden /></button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Añadir subtarea" aria-label="Nueva subtarea" maxLength={300}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
        <Button type="button" variant="secondary" aria-label="Añadir subtarea" disabled={!text.trim()} onClick={add} className="md:min-h-10"><Plus className="size-5" aria-hidden /></Button>
      </div>
    </section>
  );
}

/** Eliminar con confirmación de dos toques (el segundo, en 4 s). */
export function DeleteTaskButton({ id }: { id: string }) {
  const router = useRouter();
  const toast = useToast();
  const [armed, setArmed] = useState(false);
  const [pending, start] = useTransition();
  useEffect(() => { if (!armed) return; const t = setTimeout(() => setArmed(false), 4000); return () => clearTimeout(t); }, [armed]);
  return (
    <Button variant="secondary" disabled={pending} className={cn("w-full md:min-h-10", armed ? "border-danger bg-danger text-background hover:bg-danger" : "text-danger")}
      onClick={() => {
        if (!armed) return setArmed(true);
        start(async () => {
          const r = await deleteTask(id);
          if (!r.ok) return toast({ message: r.error });
          toast({ message: "Tarea eliminada", durationMs: 2500 });
          router.push("/tareas");
          router.refresh();
        });
      }}><Trash2 className="size-4" aria-hidden /> {armed ? "Toca otra vez para eliminar" : "Eliminar"}</Button>
  );
}
