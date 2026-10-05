"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteEvent, saveEvent } from "@/app/(app)/calendario/actions";
import { Button } from "@/components/ui/button";
import { Field, Select, Textarea } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import type { EventRow } from "@/lib/tasks/data";
import { parseRecurrence, type Recurrence } from "@/lib/tasks/recurrence";
import { RecurrenceField } from "@/components/tasks/recurrence-field";

export type EventDraft = { start_date: string; start_time?: string; end_time?: string; all_day?: boolean };

const toInput = (e: EventRow) => ({
  id: e.id, title: e.title, notes: e.notes ?? undefined, location: e.location ?? undefined, all_day: e.all_day,
  start_date: e.start_date, start_time: e.start_time?.slice(0, 5), end_date: e.end_date, end_time: e.end_time?.slice(0, 5),
  business_id: e.business_id, recurrence: parseRecurrence(e.recurrence) ?? undefined,
});

/** Alta y edición de eventos. `event` = edición; `draft` = valores iniciales de uno nuevo. */
export function EventSheet({
  open, onClose, event, draft, businesses,
}: { open: boolean; onClose: () => void; event: EventRow | null; draft: EventDraft | null; businesses: { id: string; name: string }[] }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [allDay, setAllDay] = useState(event?.all_day ?? draft?.all_day ?? false);
  const [rec, setRec] = useState<Recurrence | null>(parseRecurrence(event?.recurrence));
  const finish = () => { onClose(); router.refresh(); };

  const sd = event?.start_date ?? draft?.start_date ?? "";
  const st = event?.start_time?.slice(0, 5) ?? draft?.start_time ?? "09:00";
  const et = event?.end_time?.slice(0, 5) ?? draft?.end_time ?? "10:00";

  function submit(fd: FormData) {
    start(async () => {
      const r = await saveEvent({
        id: event?.id, title: String(fd.get("title") ?? ""), notes: String(fd.get("notes") ?? ""), location: String(fd.get("location") ?? ""),
        all_day: allDay, start_date: String(fd.get("start_date") ?? ""), start_time: String(fd.get("start_time") ?? ""),
        end_date: String(fd.get("end_date") ?? "") || String(fd.get("start_date") ?? ""), end_time: String(fd.get("end_time") ?? ""),
        business_id: String(fd.get("business_id") ?? ""), recurrence: rec ?? undefined,
      });
      if (r.ok) finish(); else setError(r.error);
    });
  }

  function remove() {
    if (!event) return;
    const snap = toInput(event);
    start(async () => {
      const r = await deleteEvent(event.id);
      if (!r.ok) return setError(r.error);
      finish();
      toast({ message: "Evento eliminado", actionLabel: "Deshacer", onAction: () => void saveEvent(snap).then(() => router.refresh()) });
    });
  }

  return (
    <Sheet open={open} onClose={onClose} title={event ? "Evento" : "Nuevo evento"}>
      <form key={event?.id ?? `new-${sd}-${st}`} action={submit} className="flex flex-col gap-4">
        <Field label="Título" htmlFor="ev-title"><Input id="ev-title" name="title" defaultValue={event?.title ?? ""} maxLength={200} required autoFocus={!event} /></Field>
        <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} className="size-5" /> Todo el día</label>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Inicio" htmlFor="ev-sd"><Input id="ev-sd" name="start_date" type="date" defaultValue={sd} required /></Field>
          {!allDay ? <Field label="Hora de inicio" htmlFor="ev-st"><Input id="ev-st" name="start_time" type="time" defaultValue={st} required /></Field> : <span />}
          <Field label="Fin" htmlFor="ev-ed"><Input id="ev-ed" name="end_date" type="date" defaultValue={event?.end_date ?? sd} required /></Field>
          {!allDay ? <Field label="Hora de fin" htmlFor="ev-et"><Input id="ev-et" name="end_time" type="time" defaultValue={et} required /></Field> : <span />}
        </div>
        <Field label="Lugar" htmlFor="ev-loc"><Input id="ev-loc" name="location" defaultValue={event?.location ?? ""} maxLength={200} /></Field>
        <Field label="Negocio" htmlFor="ev-biz"><Select id="ev-biz" name="business_id" defaultValue={event?.business_id ?? ""}><option value="">Ninguno</option>{businesses.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select></Field>
        <Field label="Repetir" htmlFor="ev-rec"><RecurrenceField value={rec} onChange={setRec} /></Field>
        <Field label="Notas" htmlFor="ev-notes"><Textarea id="ev-notes" name="notes" defaultValue={event?.notes ?? ""} maxLength={5000} className="min-h-16" /></Field>
        {event && rec && <p className="text-xs text-muted">Los cambios se aplican a toda la serie.</p>}
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <div className="flex gap-2">
          <Button type="submit" disabled={pending} className="flex-1">{pending ? "Guardando…" : "Guardar"}</Button>
          {event && <Button type="button" variant="secondary" onClick={remove} disabled={pending}><Trash2 className="size-4" aria-hidden /> Eliminar</Button>}
        </div>
      </form>
    </Sheet>
  );
}
