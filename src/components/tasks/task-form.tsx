"use client";

import { Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createTask, updateTask } from "@/app/(app)/tareas/actions";
import { Button } from "@/components/ui/button";
import { Select, Textarea } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { addDays } from "@/lib/dates";
import { PRIORITIES, PRIORITY_META, type TaskFieldsParsed } from "@/lib/tasks/input";
import { REPEAT_LABEL, REPEATS, WEEKDAY_BUTTONS, type Repeat } from "@/lib/tasks/repeat";
import { REMINDER_BEFORE_LABEL, REMINDER_BEFORE_OPTIONS, type ReminderMode } from "@/lib/tasks/timing";
import { cn } from "@/lib/utils";
import type { BizOption } from "./task-list";

export type GoalOption = { id: string; title: string };

const label = "mb-1.5 block text-sm font-medium";
const seg = (on: boolean) => cn("min-h-11 flex-1 rounded-xl px-2 text-[15px] font-semibold transition-colors md:min-h-10", on ? "bg-accent text-accent-foreground" : "bg-surface-2 text-foreground hover:bg-border/60");

/**
 * Formulario de tarea (crear y editar), como el de Antola: título, notas, fecha (Hoy / Mañana / Sin fecha + calendario)
 * y hora opcional, prioridad, negocio (proyecto), objetivo, repetición, recordatorio y, al crear, subtareas.
 */
export function TaskForm({ taskId, initial, businesses, goals, today, returnTo }: {
  taskId?: string; initial?: Partial<TaskFieldsParsed>; businesses: BizOption[]; goals: GoalOption[]; today: string; returnTo: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [saving, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState(initial?.title ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [priority, setPriority] = useState<number>(initial?.priority ?? 2);
  const [dueDate, setDueDate] = useState(initial?.dueDate ?? "");
  const [time, setTime] = useState(initial?.time ?? "");
  const [businessId, setBusinessId] = useState(initial?.businessId ?? "");
  const [goalId, setGoalId] = useState(initial?.goalId ?? "");
  const [repeat, setRepeat] = useState<Repeat>(initial?.repeat ?? "none");
  const [days, setDays] = useState<number[]>(initial?.repeatDays ?? []);
  const [mode, setMode] = useState<ReminderMode>(initial?.reminderMode ?? "none");
  const [remDate, setRemDate] = useState(initial?.reminderDate ?? "");
  const [remTime, setRemTime] = useState(initial?.reminderTime ?? "");
  const [before, setBefore] = useState<number>(initial?.reminderMinutesBefore ?? 15);
  const [subtasks, setSubtasks] = useState<string[]>([]);
  const [newSub, setNewSub] = useState("");

  function chooseMode(m: ReminderMode) {
    setMode(m);
    if (m === "at_time") {
      if (!remDate) setRemDate(dueDate || today);
      if (!remTime) setRemTime(time || "09:00");
    }
  }
  const addSub = () => { const s = newSub.trim(); if (s && subtasks.length < 50) { setSubtasks([...subtasks, s]); setNewSub(""); } };

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    if (mode === "before" && !dueDate && repeat === "none") return setError("Para avisar antes, la tarea necesita una fecha.");
    if (mode === "at_time" && (!remDate || !remTime)) return setError("Elige el día y la hora del recordatorio.");
    setError(null);
    const fields = {
      title: title.trim(), notes: notes.trim() || null, priority, dueDate: dueDate || null, time: dueDate && time ? time : null,
      businessId: businessId || null, goalId: goalId || null, repeat, repeatDays: repeat === "weekdays" ? days : [],
      reminderMode: mode, reminderDate: mode === "at_time" ? remDate : null, reminderTime: mode === "at_time" ? remTime : null,
      reminderMinutesBefore: mode === "before" ? before : null,
    };
    start(async () => {
      if (taskId) {
        const r = await updateTask(taskId, fields);
        if (!r.ok) return setError(r.error);
        toast({ message: "Cambios guardados", durationMs: 2500 });
        router.push(returnTo);
        router.refresh();
      } else {
        const extra = newSub.trim();
        const r = await createTask({ fields, subtasks: extra ? [...subtasks, extra] : subtasks });
        if (!r.ok) return setError(r.error);
        toast({ message: r.inbox ? "Guardada en la Bandeja" : "Tarea creada", durationMs: 2500 });
        router.push(returnTo);
        router.refresh();
      }
    });
  }

  const tomorrow = addDays(today, 1);
  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="¿Qué hay que hacer?" aria-label="Título" autoFocus={!taskId} required maxLength={300} className="text-lg font-semibold md:text-lg" />
      <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notas" aria-label="Notas" maxLength={5000} className="min-h-20 resize-y" />

      <div>
        <span className={label}>Fecha</span>
        <div className="mb-2 flex gap-2">
          {[{ v: today, l: "Hoy" }, { v: tomorrow, l: "Mañana" }, { v: "", l: "Sin fecha" }].map((o) => (
            <button key={o.l} type="button" aria-pressed={dueDate === o.v} onClick={() => setDueDate(o.v)} className={seg(dueDate === o.v)}>{o.l}</button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} aria-label="Fecha" />
          <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} disabled={!dueDate} aria-label="Hora (opcional)" />
        </div>
      </div>

      <div>
        <span className={label}>Prioridad</span>
        <div className="flex gap-2" role="radiogroup" aria-label="Prioridad">
          {PRIORITIES.map((p) => (
            <button key={p} type="button" role="radio" aria-checked={priority === p} onClick={() => setPriority(p)} className={seg(priority === p)}>{PRIORITY_META[p].emoji} {PRIORITY_META[p].label}</button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block"><span className={label}>Proyecto</span>
          <Select value={businessId} onChange={(e) => setBusinessId(e.target.value)}>
            <option value="">Sin proyecto</option>
            {businesses.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        </label>
        <label className="block"><span className={label}>Objetivo vinculado</span>
          <Select value={goalId} onChange={(e) => setGoalId(e.target.value)}>
            <option value="">Ninguno</option>
            {goals.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
          </Select>
        </label>
      </div>

      <div>
        <label className="block"><span className={label}>Repetir</span>
          <Select value={repeat} onChange={(e) => setRepeat(e.target.value as Repeat)}>
            {REPEATS.map((r) => <option key={r} value={r}>{REPEAT_LABEL[r]}</option>)}
          </Select>
        </label>
        {repeat === "weekdays" && (
          <div className="mt-3 flex gap-1.5" role="group" aria-label="Días de la semana">
            {WEEKDAY_BUTTONS.map((d) => {
              const on = days.includes(d.day);
              return <button key={d.day} type="button" aria-pressed={on} aria-label={d.name} onClick={() => setDays(on ? days.filter((x) => x !== d.day) : [...days, d.day])}
                className={cn("flex min-h-11 flex-1 items-center justify-center rounded-full text-sm font-semibold md:min-h-10", on ? "bg-accent text-accent-foreground" : "bg-surface-2")}>{d.short}</button>;
            })}
          </div>
        )}
        {repeat !== "none" && (
          <p className="mt-1.5 px-1 text-sm text-muted">
            {repeat === "daily"
              ? "La tendrás cada día en Hoy, con su aviso. Si un día no la haces, pasa al siguiente sin quedarse atrasada."
              : "Al marcarla aparece la siguiente. Si no la haces, pasa a la siguiente fecha que le toque."}
            {!dueDate ? " Empieza hoy." : ""}
          </p>
        )}
      </div>

      <div>
        <span className={label}>Recordatorio</span>
        <div className="flex gap-2" role="radiogroup" aria-label="Recordatorio">
          {([["none", "No"], ["at_time", "A una hora"], ["before", "Antes"]] as const).map(([m, l]) => (
            <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => chooseMode(m)} className={seg(mode === m)}>{l}</button>
          ))}
        </div>
        {mode === "at_time" && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Input type="date" value={remDate} onChange={(e) => setRemDate(e.target.value)} aria-label="Día del aviso" />
            <Input type="time" value={remTime} onChange={(e) => setRemTime(e.target.value)} aria-label="Hora del aviso" />
          </div>
        )}
        {mode === "before" && (
          <div className="mt-3">
            <Select value={before} onChange={(e) => setBefore(Number(e.target.value))} aria-label="Cuánto antes">
              {REMINDER_BEFORE_OPTIONS.map((m) => <option key={m} value={m}>{REMINDER_BEFORE_LABEL[m]}</option>)}
            </Select>
            {!time && <p className="mt-1.5 text-xs text-muted">Sin hora, se cuenta desde las 9:00.</p>}
          </div>
        )}
      </div>

      {!taskId && (
        <div>
          <span className={label}>Subtareas</span>
          {subtasks.length > 0 && (
            <ul className="mb-2 flex flex-col gap-1.5">
              {subtasks.map((s, i) => (
                <li key={i} className="flex items-center gap-2 rounded-xl bg-surface-2 pl-3">
                  <span className="flex-1 text-sm">{s}</span>
                  <button type="button" aria-label={`Quitar ${s}`} onClick={() => setSubtasks(subtasks.filter((_, j) => j !== i))} className="flex size-11 items-center justify-center text-muted md:size-10"><X className="size-4" aria-hidden /></button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            <Input value={newSub} onChange={(e) => setNewSub(e.target.value)} placeholder="Añadir subtarea" aria-label="Nueva subtarea" maxLength={300}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSub(); } }} />
            <Button type="button" variant="secondary" aria-label="Añadir subtarea" onClick={addSub} className="md:min-h-10"><Plus className="size-5" aria-hidden /></Button>
          </div>
        </div>
      )}

      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <Button type="submit" disabled={saving || !title.trim()} className="w-full md:min-h-10">{saving ? "Guardando…" : taskId ? "Guardar cambios" : "Crear tarea"}</Button>
    </form>
  );
}
