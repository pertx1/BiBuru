"use client";

import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { useState, useTransition } from "react";
import { resetMobileTabs, saveMobileTabs } from "@/app/(app)/home-actions";
import { SECTION_ICONS } from "@/components/layout/nav-items";
import { Button } from "@/components/ui/button";
import { maxTabs, SECTION_BY_KEY, SECTIONS, type SectionKey } from "@/lib/home/nav";
import { cn } from "@/lib/utils";

function Row({ k, onRemove }: { k: SectionKey; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: k });
  const s = SECTION_BY_KEY.get(k)!;
  const Icon = SECTION_ICONS[k];
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cn("flex min-h-12 items-center gap-2 bg-surface px-1", isDragging && "relative z-10 rounded-lg shadow-lg")}>
      <button ref={setActivatorNodeRef} type="button" className="flex size-11 cursor-grab touch-none items-center justify-center text-muted" aria-label={`Mover ${s.long}`} {...attributes} {...listeners}><GripVertical className="size-5" aria-hidden /></button>
      <Icon className="size-5 text-accent" aria-hidden />
      <span className="flex-1 text-sm font-medium">{s.long}</span>
      <button type="button" onClick={onRemove} className="min-h-11 px-3 text-xs text-muted hover:text-danger">Quitar</button>
    </li>
  );
}

/** Ajustes → Navegación: hasta 5 secciones en la barra inferior (4 con el botón +), en el orden que quieras. «Más» es fijo. */
export function NavSettings({ tabs: initial, showCapture: initialCapture }: { tabs: SectionKey[]; showCapture: boolean }) {
  const [tabs, setTabs] = useState(initial);
  const [capture, setCapture] = useState(initialCapture);
  const MAX = maxTabs(capture);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const save = (next: SectionKey[], withCapture = capture) => {
    const fitted = next.slice(0, maxTabs(withCapture));
    setTabs(fitted); setCapture(withCapture);
    start(async () => { const r = await saveMobileTabs(fitted, withCapture); setMsg(r.ok ? (fitted.length < next.length ? "Guardado. Con el botón + caben 4: se ha quitado la última." : "Guardado") : r.error); });
  };
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (over && active.id !== over.id) save(arrayMove(tabs, tabs.indexOf(active.id as SectionKey), tabs.indexOf(over.id as SectionKey)));
  };
  const rest = SECTIONS.filter((s) => !tabs.includes(s.key));
  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="text-muted">Elige hasta {MAX} secciones para la barra de abajo del móvil y ordénalas arrastrando desde ⠿. «Más» siempre está al final y tiene lo que no pongas aquí.</p>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={tabs} strategy={verticalListSortingStrategy}>
          <ol className="divide-y divide-border overflow-hidden rounded-lg border border-border" aria-label="Secciones en la barra">
            {tabs.map((k) => <Row key={k} k={k} onRemove={() => tabs.length > 1 ? save(tabs.filter((t) => t !== k)) : setMsg("Deja al menos una sección")} />)}
          </ol>
        </SortableContext>
      </DndContext>
      <div>
        <p className="mb-1 font-medium">Añadir a la barra</p>
        <div className="flex flex-wrap gap-2">
          {rest.map((s) => {
            const Icon = SECTION_ICONS[s.key];
            return (
              <button key={s.key} type="button" disabled={pending || tabs.length >= MAX} onClick={() => save([...tabs, s.key])}
                className="flex min-h-11 items-center gap-1.5 rounded-full border border-border bg-background px-3 disabled:opacity-40">
                <Icon className="size-4" aria-hidden />{s.label}
              </button>
            );
          })}
        </div>
        {tabs.length >= MAX && <p className="mt-1 text-xs text-muted">La barra está llena: quita una para añadir otra.</p>}
      </div>
      <label className="flex min-h-11 items-center justify-between gap-3 border-t border-border pt-3">
        <span><span className="font-medium">Botón + de captura en la barra</span><span className="block text-xs text-muted">Ocupa un hueco (caben 4 secciones). Sin él, la captura rápida está en Inicio.</span></span>
        <input type="checkbox" className="size-5 shrink-0" checked={capture} disabled={pending} onChange={(e) => save(tabs, e.target.checked)} />
      </label>
      <Button type="button" variant="secondary" className="self-start" disabled={pending} onClick={() => start(async () => { const r = await resetMobileTabs(); if (r.ok) { setTabs(["inicio", "tareas", "negocios"]); setCapture(false); } setMsg(r.ok ? "Barra restablecida" : r.error); })}>Restablecer</Button>
      {msg && <p role="status" className="text-muted">{msg}</p>}
    </div>
  );
}
