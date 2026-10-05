"use client";

import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addSubtask, deleteTask, saveTask, setTaskDue, snoozeTask, toggleTask } from "@/app/(app)/tareas/actions";
import { Button } from "@/components/ui/button";
import { Field, Select, Textarea } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import type { TaskWithSubs } from "@/lib/tasks/data";
import { PRIORITY_LABELS } from "@/lib/tasks/format";
import { parseRecurrence, type Recurrence } from "@/lib/tasks/recurrence";
import { SNOOZE_LABELS, type SnoozeOption } from "@/lib/tasks/snooze";
import { RecurrenceField } from "./recurrence-field";

export type BizOption = { id: string; name: string; color: string };
export type GoalOption = { id: string; title: string };

/** Detalle y edición de una tarea (o alta completa si `task` es null). */
export function TaskSheet({
  task, open, onClose, businesses, goals, today, defaultBusinessId, defaultDate,
}: {
  task: TaskWithSubs | null; open: boolean; onClose: () => void; businesses: BizOption[]; goals: GoalOption[]; today: string;
  defaultBusinessId?: string; defaultDate?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [rec, setRec] = useState<Recurrence | null>(parseRecurrence(task?.recurrence));
  const [sub, setSub] = useState("");
  const done = () => { onClose(); router.refresh(); };

  function submit(fd: FormData) {
    start(async () => {
      const r = await saveTask({
        id: task?.id, title: String(fd.get("title") ?? ""), notes: String(fd.get("notes") ?? ""),
        due_date: String(fd.get("due_date") ?? ""), due_time: String(fd.get("due_time") ?? ""), priority: Number(fd.get("priority") ?? 0),
        business_id: String(fd.get("business_id") ?? ""), goal_id: String(fd.get("goal_id") ?? ""), parent_id: task?.parent_id ?? null,
        recurrence: rec ?? undefined, status: (task?.status as "open" | "done" | undefined) ?? "open",
      });
      if (r.ok) done(); else setError(r.error);
    });
  }

  function remove() {
    if (!task) return;
    const snap = { ...task };
    const subs = task.subtasks;
    start(async () => {
      const r = await deleteTask(task.id);
      if (!r.ok) return setError(r.error);
      done();
      toast({
        message: "Tarea eliminada", actionLabel: "Deshacer",
        onAction: () => void (async () => {
          const toInput = (t: typeof snap) => ({ id: t.id, title: t.title, notes: t.notes ?? undefined, due_date: t.due_date ?? undefined, due_time: t.due_time?.slice(0, 5), priority: t.priority, business_id: t.business_id, goal_id: t.goal_id, parent_id: t.parent_id, recurrence: parseRecurrence(t.recurrence) ?? undefined, status: t.status as "open" | "done" });
          await saveTask(toInput(snap));
          for (const s of subs) await saveTask(toInput({ ...s, subtasks: [] } as typeof snap));
          router.refresh();
        })(),
      });
    });
  }

  function doSnooze(o: SnoozeOption) {
    if (!task) return;
    start(async () => {
      const r = await snoozeTask(task.id, o);
      if (!r.ok) return setError(r.error);
      const prev = r.previous;
      done();
      toast({ message: `Pospuesta: ${SNOOZE_LABELS[o].toLowerCase()}`, actionLabel: "Deshacer", onAction: () => void setTaskDue(task.id, prev ?? { date: null, time: null }).then(() => router.refresh()) });
    });
  }

  return (
    <Sheet open={open} onClose={onClose} title={task ? "Tarea" : "Nueva tarea"}>
      <form key={task?.id ?? "new"} action={submit} className="flex flex-col gap-4">
        <Field label="Título" htmlFor="t-title"><Input id="t-title" name="title" defaultValue={task?.title ?? ""} maxLength={200} required autoFocus={!task} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Fecha" htmlFor="t-date"><Input id="t-date" name="due_date" type="date" defaultValue={task?.due_date ?? defaultDate ?? ""} /></Field>
          <Field label="Hora" htmlFor="t-time"><Input id="t-time" name="due_time" type="time" defaultValue={task?.due_time?.slice(0, 5) ?? ""} /></Field>
          <Field label="Prioridad" htmlFor="t-prio"><Select id="t-prio" name="priority" defaultValue={String(task?.priority ?? 0)}>{PRIORITY_LABELS.map((l, i) => <option key={l} value={i}>{l}</option>)}</Select></Field>
          <Field label="Negocio" htmlFor="t-biz">
            <Select id="t-biz" name="business_id" defaultValue={task?.business_id ?? defaultBusinessId ?? ""}><option value="">Ninguno</option>{businesses.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select>
          </Field>
          {goals.length > 0 && (
            <Field label="Objetivo" htmlFor="t-goal" className="col-span-2"><Select id="t-goal" name="goal_id" defaultValue={task?.goal_id ?? ""}><option value="">Ninguno</option>{goals.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}</Select></Field>
          )}
        </div>
        {!task?.parent_id && <Field label="Repetir" htmlFor="t-rec"><RecurrenceField value={rec} onChange={setRec} /></Field>}
        <Field label="Notas" htmlFor="t-notes"><Textarea id="t-notes" name="notes" defaultValue={task?.notes ?? ""} maxLength={5000} className="min-h-20" /></Field>

        {task && !task.parent_id && (
          <section aria-label="Subtareas" className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">Subtareas</h3>
            <ul className="flex flex-col">
              {task.subtasks.map((s) => (
                <li key={s.id} className="flex items-center gap-3">
                  <label className="flex min-h-11 flex-1 cursor-pointer items-center gap-3 text-sm">
                    <input type="checkbox" defaultChecked={s.status === "done"} className="size-5" onChange={(e) => start(async () => { await toggleTask(s.id, e.target.checked); router.refresh(); })} />
                    <span className={s.status === "done" ? "text-muted line-through" : ""}>{s.title}</span>
                  </label>
                  <button type="button" aria-label={`Eliminar ${s.title}`} className="flex size-10 items-center justify-center text-muted hover:text-danger" onClick={() => start(async () => { await deleteTask(s.id); router.refresh(); })}><Trash2 className="size-4" aria-hidden /></button>
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <Input value={sub} onChange={(e) => setSub(e.target.value)} placeholder="Añadir subtarea" aria-label="Nueva subtarea" maxLength={200}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (sub.trim()) { const t = sub; setSub(""); start(async () => { await addSubtask(task.id, t); router.refresh(); }); } } }} />
              <Button type="button" variant="secondary" aria-label="Añadir subtarea" disabled={!sub.trim()} onClick={() => { const t = sub; setSub(""); start(async () => { await addSubtask(task.id, t); router.refresh(); }); }}><Plus className="size-4" aria-hidden /></Button>
            </div>
          </section>
        )}

        {task && task.status === "open" && (
          <section aria-label="Posponer" className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">Posponer</h3>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(SNOOZE_LABELS) as SnoozeOption[]).map((o) => (
                <button key={o} type="button" disabled={pending} onClick={() => doSnooze(o)} className="min-h-11 rounded-full border border-border bg-surface px-3.5 text-sm hover:bg-surface-2 md:min-h-9">{SNOOZE_LABELS[o]}</button>
              ))}
            </div>
          </section>
        )}

        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <div className="flex gap-2">
          <Button type="submit" disabled={pending} className="flex-1">{pending ? "Guardando…" : "Guardar"}</Button>
          {task && <Button type="button" variant="secondary" onClick={remove} disabled={pending}><Trash2 className="size-4" aria-hidden /> Eliminar</Button>}
        </div>
        <input type="hidden" value={today} readOnly />
      </form>
    </Sheet>
  );
}
