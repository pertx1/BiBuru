"use client";

import { DndContext, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { CheckSquare, ChevronLeft, ChevronRight, GripVertical, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { reschedulePost } from "@/app/(app)/redes/actions";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { addDays, addMonths, endOfMonth, formatDate, startOfMonth, startOfWeek } from "@/lib/dates";
import { itemsForDay, layoutDay, type CalItem } from "@/lib/tasks/calendar";
import type { EventRow } from "@/lib/tasks/data";
import { cn } from "@/lib/utils";
import { EventSheet, type EventDraft } from "./event-sheet";

export type CalView = "mes" | "semana" | "agenda";
type Biz = { id: string; name: string; color: string };
const WEEKDAYS = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];
const MONTH_NAMES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const HOUR_PX = 48, FIRST_H = 6, LAST_H = 23;
const ACCENT = "#0f766e";

const dayNum = (iso: string) => String(+iso.slice(8, 10));
const dowOf = (iso: string) => (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7;
const longDay = (iso: string) => `${["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"][dowOf(iso)]} ${dayNum(iso)} de ${MONTH_NAMES[+iso.slice(5, 7) - 1]}`;

/** Día que acepta publicaciones arrastradas (calendario de contenido). */
function DropDay({ day, className, children, ...rest }: { day: string; className?: string; children: React.ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  const { setNodeRef, isOver } = useDroppable({ id: `day:${day}` });
  return <div ref={setNodeRef} className={cn(className, isOver && "ring-2 ring-inset ring-accent")} {...rest}>{children}</div>;
}

/** Asa para arrastrar una publicación a otro día (con el dedo: mantener pulsado). */
function DragPost({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: `post:${id}` });
  return (
    <div ref={setNodeRef} className={cn("flex items-stretch", isDragging && "relative z-20 opacity-80")} style={transform ? { transform: `translate(${transform.x}px, ${transform.y}px)` } : undefined}>
      <span {...listeners} {...attributes} aria-label="Arrastrar a otro día" className="flex w-5 shrink-0 touch-none cursor-grab items-center justify-center text-muted"><GripVertical className="size-3" aria-hidden /></span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function CalendarClient({
  view, focus, today, items, events, businesses,
}: {
  view: CalView; focus: string; today: string; items: CalItem[]; events: EventRow[]; businesses: Biz[]; goals?: { id: string; title: string }[];
}) {
  const router = useRouter();
  const toast = useToast();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 6 } }));
  async function onDragEnd(e: DragEndEvent) {
    const id = String(e.active.id).replace(/^post:/, ""), day = e.over ? String(e.over.id).replace(/^day:/, "") : null;
    const item = items.find((i) => i.kind === "post" && i.id === id);
    if (!day || !item || item.date === day) return;
    const r = await reschedulePost(id, day);
    toast({ message: r.ok ? `Publicación movida al ${formatDate(day)}` : r.error });
    router.refresh();
  }
  const [dayOpen, setDayOpen] = useState<string | null>(null);
  const [eventOpen, setEventOpen] = useState<{ event: EventRow | null; draft: EventDraft | null } | null>(null);
  const bizById = new Map(businesses.map((b) => [b.id, b]));
  const eventById = new Map(events.map((e) => [e.id, e]));
  const colorOf = (i: CalItem) => (i.businessId ? bizById.get(i.businessId)?.color : undefined) ?? ACCENT;

  async function openItem(i: CalItem) {
    if (i.kind === "post") { router.push(`/redes?vista=publicaciones&abrir=${i.id}`); return; }
    if (i.kind === "event") {
      const e = eventById.get(i.id);
      if (e) setEventOpen({ event: e, draft: null });
    } else router.push(`/tareas/${i.id}`);
  }
  const newEvent = (draft: EventDraft) => { setDayOpen(null); setEventOpen({ event: null, draft }); };

  // ------------------------------------------------------------ navegación
  const href = (v: CalView, d: string) => `/calendario?v=${v}&d=${d}`;
  const [prev, next, title] =
    view === "mes" ? [addMonths(startOfMonth(focus), -1), addMonths(startOfMonth(focus), 1), `${MONTH_NAMES[+focus.slice(5, 7) - 1]} ${focus.slice(0, 4)}`]
    : view === "semana" ? [addDays(focus, -7), addDays(focus, 7), `${formatDate(startOfWeek(focus)).slice(0, 5)} – ${formatDate(addDays(startOfWeek(focus), 6)).slice(0, 5)}`]
    : [addDays(focus, -30), addDays(focus, 30), "Agenda"];

  function Chip({ i, compact }: { i: CalItem; compact?: boolean }) {
    const c = colorOf(i);
    if (i.kind === "post" && !i.done) return <DragPost id={i.id}><ChipButton i={i} c={c} compact={compact} /></DragPost>;
    return <ChipButton i={i} c={c} compact={compact} />;
  }
  function ChipButton({ i, c, compact }: { i: CalItem; c: string; compact?: boolean }) {
    return (
      <button type="button" onClick={(e) => { e.stopPropagation(); void openItem(i); }}
        className={cn("flex w-full items-center gap-1 truncate rounded px-1.5 text-left", compact ? "min-h-5 text-[11px]" : "min-h-11 text-sm md:min-h-8", i.done && "opacity-50 line-through")}
        style={i.kind === "event" ? { backgroundColor: `${c}26`, color: "inherit", borderLeft: `3px solid ${c}` } : { border: `1px solid ${c}`, borderLeftWidth: 3 }}>
        {i.kind === "task" && <CheckSquare className="size-3 shrink-0" aria-hidden />}
        {i.startTime && <span className="shrink-0 tabular-nums text-muted">{i.startTime}</span>}
        <span className="truncate">{i.title}</span>
      </button>
    );
  }

  // -------------------------------------------------------------- vista mes
  function MonthView() {
    const gridStart = startOfWeek(startOfMonth(focus));
    const weeks = Math.ceil((((new Date(`${endOfMonth(focus)}T00:00:00Z`).getTime() - new Date(`${gridStart}T00:00:00Z`).getTime()) / 86_400_000) + 1) / 7);
    const days = Array.from({ length: weeks * 7 }, (_, i) => addDays(gridStart, i));
    return (
      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        <div className="grid grid-cols-7 border-b border-border text-center text-xs text-muted">{WEEKDAYS.map((d) => <div key={d} className="py-1.5">{d}</div>)}</div>
        <div className="grid grid-cols-7">
          {days.map((d, idx) => {
            const dayItems = itemsForDay(items, d);
            const inMonth = d.slice(0, 7) === focus.slice(0, 7);
            return (
              <DropDay key={d} day={d} role="button" tabIndex={0} aria-label={`${longDay(d)}: ${dayItems.length} elementos`} onClick={() => setDayOpen(d)} onKeyDown={(e) => e.key === "Enter" && setDayOpen(d)}
                className={cn("min-h-[4.5rem] cursor-pointer border-b border-r border-border p-1 text-left hover:bg-surface-2 md:min-h-28", (idx + 1) % 7 === 0 && "border-r-0", !inMonth && "bg-surface-2/50 text-muted")}>
                <span className={cn("mb-0.5 inline-flex size-6 items-center justify-center rounded-full text-xs", d === today && "bg-accent font-semibold text-accent-foreground")}>{dayNum(d)}</span>
                {/* móvil: puntos de color; escritorio: chips */}
                <div className="flex flex-wrap gap-0.5 md:hidden">{dayItems.slice(0, 6).map((i) => <span key={i.key} className="size-1.5 rounded-full" style={{ backgroundColor: colorOf(i) }} />)}</div>
                <div className="hidden flex-col gap-0.5 md:flex">
                  {dayItems.slice(0, 3).map((i) => <Chip key={i.key} i={i} compact />)}
                  {dayItems.length > 3 && <span className="px-1 text-[11px] text-muted">+{dayItems.length - 3} más</span>}
                </div>
              </DropDay>
            );
          })}
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------ vista semana
  function WeekView() {
    const start = startOfWeek(focus);
    const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
    const hours = Array.from({ length: LAST_H - FIRST_H + 1 }, (_, i) => FIRST_H + i);
    return (
      <>
        {/* escritorio: cuadrícula con franjas */}
        <div className="hidden overflow-hidden rounded-xl border border-border bg-surface md:block">
          <div className="grid grid-cols-[3rem_repeat(7,1fr)] border-b border-border text-center text-xs">
            <div />
            {days.map((d) => (
              <button key={d} type="button" onClick={() => setDayOpen(d)} className={cn("py-2 hover:bg-surface-2", d === today && "font-semibold text-accent")}>{WEEKDAYS[dowOf(d)]} {dayNum(d)}</button>
            ))}
          </div>
          <div className="grid grid-cols-[3rem_repeat(7,1fr)] border-b border-border">
            <div className="p-1 text-[10px] text-muted">todo el día</div>
            {days.map((d) => <div key={d} className="flex flex-col gap-0.5 border-l border-border p-0.5">{itemsForDay(items, d).filter((i) => i.allDay).map((i) => <Chip key={i.key} i={i} compact />)}</div>)}
          </div>
          <div className="max-h-[34rem] overflow-y-auto">
            <div className="grid grid-cols-[3rem_repeat(7,1fr)]" style={{ height: hours.length * HOUR_PX }}>
              <div>{hours.map((h) => <div key={h} className="pr-1 text-right text-[10px] text-muted" style={{ height: HOUR_PX }}>{String(h).padStart(2, "0")}:00</div>)}</div>
              {days.map((d) => (
                <div key={d} className="relative border-l border-border">
                  {hours.map((h) => (
                    <button key={h} type="button" aria-label={`Nuevo evento ${longDay(d)} a las ${h}:00`} onClick={() => newEvent({ start_date: d, start_time: `${String(h).padStart(2, "0")}:00`, end_time: `${String(Math.min(h + 1, 23)).padStart(2, "0")}:${h + 1 > 23 ? "59" : "00"}` })}
                      className="block w-full border-t border-border/60 hover:bg-surface-2" style={{ height: HOUR_PX }} />
                  ))}
                  {layoutDay(itemsForDay(items, d), d).map((p) => (
                    <div key={p.item.key} className="absolute px-0.5" style={{ top: ((p.top - FIRST_H * 60) / 60) * HOUR_PX, height: Math.max((p.height / 60) * HOUR_PX, 18), left: `${(p.lane / p.lanes) * 100}%`, width: `${100 / p.lanes}%` }}>
                      <button type="button" onClick={() => void openItem(p.item)} className="h-full w-full overflow-hidden rounded px-1 text-left text-[11px]" style={{ backgroundColor: `${colorOf(p.item)}33`, borderLeft: `3px solid ${colorOf(p.item)}` }}>
                        <span className="tabular-nums text-muted">{p.item.startTime}</span> {p.item.title}
                      </button>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
        {/* móvil: lista por días */}
        <div className="flex flex-col gap-3 md:hidden">
          {days.map((d) => <DayBlock key={d} day={d} />)}
        </div>
      </>
    );
  }

  function DayBlock({ day }: { day: string }) {
    const list = itemsForDay(items, day);
    return (
      <DropDay day={day} className="rounded-xl border border-border bg-surface p-3" aria-label={longDay(day)}>
        <div className="mb-1 flex items-center justify-between">
          <h3 className={cn("text-sm font-semibold first-letter:uppercase", day === today && "text-accent")}>{longDay(day)}{day === today && " · hoy"}</h3>
          <button type="button" aria-label={`Añadir a ${longDay(day)}`} onClick={() => setDayOpen(day)} className="flex size-10 items-center justify-center rounded-lg text-muted hover:bg-surface-2"><Plus className="size-4" aria-hidden /></button>
        </div>
        {list.length === 0 ? <p className="text-xs text-muted">Nada este día.</p> : <ul className="flex flex-col gap-1">{list.map((i) => <li key={i.key}><Chip i={i} /></li>)}</ul>}
      </DropDay>
    );
  }

  // ----------------------------------------------------------- vista agenda
  function AgendaView() {
    const days = Array.from({ length: 30 }, (_, i) => addDays(focus, i)).filter((d) => itemsForDay(items, d).length > 0);
    if (days.length === 0) return <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted">Sin eventos ni tareas con fecha en los próximos 30 días.</p>;
    return <div className="flex flex-col gap-3">{days.map((d) => <DayBlock key={d} day={d} />)}</div>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Link href={href(view, prev)} aria-label="Anterior" className="flex size-11 items-center justify-center rounded-lg border border-border bg-surface hover:bg-surface-2 md:size-9"><ChevronLeft className="size-4" aria-hidden /></Link>
          <Link href={href(view, next)} aria-label="Siguiente" className="flex size-11 items-center justify-center rounded-lg border border-border bg-surface hover:bg-surface-2 md:size-9"><ChevronRight className="size-4" aria-hidden /></Link>
          <Link href={href(view, today)} className="flex min-h-11 items-center rounded-lg border border-border bg-surface px-3 text-sm hover:bg-surface-2 md:min-h-9">Hoy</Link>
        </div>
        <h2 className="flex-1 text-lg font-semibold first-letter:uppercase">{title}</h2>
        <nav aria-label="Vista" className="flex gap-1">
          {([["mes", "Mes"], ["semana", "Semana"], ["agenda", "Agenda"]] as const).map(([v, l]) => (
            <Link key={v} href={href(v, focus)} aria-current={v === view ? "page" : undefined}
              className={cn("flex min-h-11 md:min-h-10 items-center rounded-full border border-border px-3.5 text-sm", v === view ? "border-accent bg-accent text-accent-foreground" : "bg-surface hover:bg-surface-2")}>{l}</Link>
          ))}
        </nav>
        <Button onClick={() => newEvent({ start_date: focus < today && view !== "mes" ? today : (view === "mes" && focus.slice(0, 7) !== today.slice(0, 7) ? focus : today) })}><Plus className="size-4" aria-hidden /> Evento</Button>
      </div>

      <DndContext sensors={sensors} onDragEnd={(e) => void onDragEnd(e)}>
        {view === "mes" ? <MonthView /> : view === "semana" ? <WeekView /> : <AgendaView />}
      </DndContext>

      <Sheet open={dayOpen !== null} onClose={() => setDayOpen(null)} title={dayOpen ? longDay(dayOpen) : ""}>
        {dayOpen && (
          <div className="flex flex-col gap-3">
            <ul className="flex flex-col gap-1">{itemsForDay(items, dayOpen).map((i) => <li key={i.key}><Chip i={i} /></li>)}</ul>
            {itemsForDay(items, dayOpen).length === 0 && <p className="text-sm text-muted">No hay nada este día.</p>}
            <div className="grid grid-cols-2 gap-2">
              <Button onClick={() => newEvent({ start_date: dayOpen })}><Plus className="size-4" aria-hidden /> Evento</Button>
              <Button variant="secondary" onClick={() => router.push(`/tareas/nueva?fecha=${dayOpen}&volver=${encodeURIComponent(`/calendario?d=${dayOpen}`)}`)}><Plus className="size-4" aria-hidden /> Tarea</Button>
            </div>
          </div>
        )}
      </Sheet>
      <EventSheet open={eventOpen !== null} onClose={() => setEventOpen(null)} event={eventOpen?.event ?? null} draft={eventOpen?.draft ?? null} businesses={businesses} />
    </div>
  );
}
