"use client";

import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove, rectSortingStrategy, SortableContext, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Maximize2, Plus, RotateCcw, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useState, useTransition, type ReactNode } from "react";
import { loadWidgetOptions, resetBusinessLayout, resetHomeLayout, saveBusinessLayout, saveHomeLayout, type WidgetOptions } from "@/app/(app)/home-actions";
import { SearchButton } from "@/components/search/search-button";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { BUSINESS_WIDGETS, GROUP_LABELS, SIZE_CLASSES, SIZE_LABELS, WIDGET_BY_TYPE, WIDGETS, newInstance, type WidgetGroup, type WidgetInstance, type WidgetSize } from "@/lib/home/layout";
import { cn } from "@/lib/utils";
import { WidgetPreview } from "./previews";
import type { BizOption } from "./types";
import { WidgetSkeleton } from "./widget-card";

type Props = {
  layout: WidgetInstance[]; nodes: Record<string, ReactNode>; businesses: BizOption[]; dateLabel: string; toolbar: ReactNode;
  /** Resumen de un negocio: misma rejilla, pero solo widgets de negocio, con el negocio fijo y guardado aparte. */
  businessId?: string;
};

function Item({ w, node, editing, onSize, onSettings, onRemove }: { w: WidgetInstance; node: ReactNode; editing: boolean; onSize: () => void; onSettings: () => void; onRemove: () => void }) {
  const meta = WIDGET_BY_TYPE.get(w.type)!;
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: w.id, disabled: !editing });
  const btn = "flex size-11 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-foreground";
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cn("relative flex min-w-0 flex-col", SIZE_CLASSES[w.size], isDragging && "z-20 opacity-80")}>
      {editing && (
        // En edición, los controles van en una fila encima del widget (no tapan su contenido).
        <div className="mb-1.5 flex items-center justify-between gap-1">
          <button ref={setActivatorNodeRef} type="button" className={cn(btn, "cursor-grab touch-none active:cursor-grabbing")} aria-label={`Mover «${meta.title}»`} {...attributes} {...listeners}><GripVertical className="size-5" aria-hidden /></button>
          <span className="min-w-0 flex-1 truncate text-xs font-medium text-muted">{meta.title} · {SIZE_LABELS[w.size]}</span>
          {meta.sizes.length > 1 && <button type="button" className={btn} onClick={onSize} aria-label={`Tamaño de «${meta.title}»: ${SIZE_LABELS[w.size]}. Cambiar`}><Maximize2 className="size-4" aria-hidden /></button>}
          <button type="button" className={btn} onClick={onSettings} aria-label={`Ajustes de «${meta.title}»`}><SlidersHorizontal className="size-4" aria-hidden /></button>
          <button type="button" className={cn(btn, "text-danger")} onClick={onRemove} aria-label={`Quitar «${meta.title}»`}><X className="size-5" aria-hidden /></button>
        </div>
      )}
      <div className={cn("flex-1", editing && "pointer-events-none max-h-56 select-none overflow-hidden rounded-xl opacity-80 ring-2 ring-accent/40")} aria-hidden={editing || undefined}>
        {node ?? <WidgetSkeleton tall={w.size === "l"} />}
      </div>
    </div>
  );
}

/** Rejilla de Inicio: 2 columnas en móvil y 4 en escritorio. En modo edición: mover (arrastrando, también con el dedo), tamaño, ajustes, quitar y añadir. */
export function HomeGrid({ layout: initial, nodes, businesses, dateLabel, toolbar, businessId }: Props) {
  const save = (next: WidgetInstance[]) => (businessId ? saveBusinessLayout(businessId, next) : saveHomeLayout(next));
  const reset = () => (businessId ? resetBusinessLayout(businessId) : resetHomeLayout());
  const catalog = businessId ? WIDGETS.filter((m) => BUSINESS_WIDGETS.has(m.type)) : WIDGETS;
  const toast = useToast();
  const [layout, setLayout] = useState(initial);
  const [prev, setPrev] = useState(initial);
  if (prev !== initial) { setPrev(initial); setLayout(initial); } // el servidor manda la versión guardada
  const [editing, setEditing] = useState(false);
  const [gallery, setGallery] = useState(false);
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const persist = (next: WidgetInstance[]) => {
    setLayout(next);
    start(async () => { const r = await save(next); if (!r.ok) toast({ message: r.error }); });
  };
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = layout.findIndex((w) => w.id === active.id), to = layout.findIndex((w) => w.id === over.id);
    if (from >= 0 && to >= 0) persist(arrayMove(layout, from, to));
  };
  const update = (id: string, patch: Partial<WidgetInstance>) => persist(layout.map((w) => (w.id === id ? { ...w, ...patch } : w)));
  const cycleSize = (w: WidgetInstance) => { const s = WIDGET_BY_TYPE.get(w.type)!.sizes; update(w.id, { size: s[(s.indexOf(w.size) + 1) % s.length] }); };
  const add = (type: string) => { const w = newInstance(type, crypto.randomUUID()); if (w) { persist([...layout, w]); setGallery(false); toast({ message: "Widget añadido al final" }); } };
  const remove = (w: WidgetInstance) => {
    const before = layout;
    persist(layout.filter((x) => x.id !== w.id));
    toast({ message: `«${WIDGET_BY_TYPE.get(w.type)!.title}» quitado`, actionLabel: "Deshacer", onAction: () => persist(before) });
  };
  const editingW = layout.find((w) => w.id === settingsId) ?? null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex min-h-12 items-center justify-between gap-2">
        <p className="truncate text-sm font-medium text-muted first-letter:uppercase">{dateLabel}</p>
        <div className="flex items-center gap-2">
          {!businessId && <SearchButton />}
          <button type="button" onClick={() => setEditing((e) => !e)} aria-pressed={editing}
            className={cn("min-h-11 rounded-full px-4 text-sm font-semibold", editing ? "bg-accent text-accent-foreground" : "border border-border bg-surface")}>
            {editing ? "Listo" : "Editar"}
          </button>
        </div>
      </div>
      {editing ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => setGallery(true)}><Plus className="size-4" aria-hidden /> Añadir widget</Button>
          <Button type="button" variant="secondary" disabled={pending} onClick={() => { if (confirm(businessId ? "¿Volver al Resumen por defecto de este negocio? Se pierden tus cambios." : "¿Volver a la disposición por defecto? Se pierden tus cambios de Inicio.")) start(async () => { const r = await reset(); toast({ message: r.ok ? (businessId ? "Resumen restablecido" : "Inicio restablecido") : r.error }); }); }}>
            <RotateCcw className="size-4" aria-hidden /> Restablecer
          </Button>
          <p className="w-full text-xs text-muted">Arrastra desde ⠿ para mover. Los cambios se guardan solos y se ven en todos tus dispositivos.</p>
        </div>
      ) : toolbar}

      {layout.length === 0 && <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted">{businessId ? "El Resumen está vacío." : "Inicio está vacío."} Pulsa «Editar» → «Añadir widget».</p>}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={layout.map((w) => w.id)} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-2 gap-3 md:grid-flow-row-dense md:grid-cols-4">
            {layout.map((w) => (
              <Item key={w.id} w={w} node={nodes[w.id]} editing={editing} onSize={() => cycleSize(w)} onSettings={() => setSettingsId(w.id)}
                onRemove={() => remove(w)} />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <Sheet open={gallery} onClose={() => setGallery(false)} title="Añadir widget">
        <div className="flex flex-col gap-5 p-4">
          {(Object.keys(GROUP_LABELS) as WidgetGroup[]).map((g) => {
            const items = catalog.filter((m) => m.group === g);
            if (!items.length) return null;
            return (
              <section key={g}>
                <h3 className="mb-2 text-sm font-semibold">{GROUP_LABELS[g]}</h3>
                <ul className="grid grid-cols-2 gap-2 md:grid-cols-3">
                  {items.map((m) => (
                    <li key={m.type}>
                      <button type="button" onClick={() => add(m.type)} className="flex h-full w-full flex-col gap-2 rounded-xl border border-border bg-background p-2 text-left hover:border-accent">
                        <WidgetPreview kind={m.preview} />
                        <span className="text-sm font-semibold">{m.title}</span>
                        <span className="text-xs text-muted">{m.description}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </Sheet>

      <Sheet open={!!editingW} onClose={() => setSettingsId(null)} title={editingW ? `Ajustes · ${WIDGET_BY_TYPE.get(editingW.type)!.title}` : "Ajustes"}>
        {editingW && <SettingsForm w={editingW} businesses={businesses} fixedBusiness={!!businessId} onSave={(patch) => { update(editingW.id, patch); setSettingsId(null); }} />}
      </Sheet>
    </div>
  );
}

function SettingsForm({ w, businesses, onSave, fixedBusiness }: { w: WidgetInstance; businesses: BizOption[]; onSave: (patch: Partial<WidgetInstance>) => void; fixedBusiness?: boolean }) {
  const base = WIDGET_BY_TYPE.get(w.type)!;
  // Dentro de un negocio, el negocio no se elige: es ese.
  const meta = fixedBusiness ? { ...base, fields: base.fields.filter((f) => f.kind !== "business") } : base;
  const [size, setSize] = useState<WidgetSize>(w.size);
  const [settings, setSettings] = useState(w.settings);
  const needsOptions = meta.fields.some((f) => f.kind === "goal" || f.kind === "folder" || f.kind === "category");
  const [options, setOptions] = useState<WidgetOptions | null>(null);
  useEffect(() => { if (needsOptions) loadWidgetOptions().then(setOptions).catch(() => setOptions({ goals: [], folders: [], categories: [] })); }, [needsOptions]);
  const select = "min-h-11 w-full rounded-lg border border-border bg-background px-3 text-base md:text-sm";
  return (
    <form className="flex flex-col gap-4 p-4" onSubmit={(e) => { e.preventDefault(); onSave({ size, settings }); }}>
      {meta.sizes.length > 1 && (
        <fieldset>
          <legend className="mb-1 text-sm font-medium">Tamaño</legend>
          <div className="flex gap-2">
            {meta.sizes.map((s) => (
              <label key={s} className={cn("flex min-h-11 flex-1 cursor-pointer items-center justify-center rounded-lg border text-sm", size === s ? "border-accent bg-accent/10 font-semibold" : "border-border")}>
                <input type="radio" name="size" value={s} checked={size === s} onChange={() => setSize(s)} className="sr-only" />{SIZE_LABELS[s]}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {meta.fields.map((f) => (
        <label key={f.key} className="flex flex-col gap-1 text-sm font-medium">{f.label}
          <select className={select} value={settings[f.key] ?? ""} onChange={(e) => setSettings({ ...settings, [f.key]: e.target.value })}>
            {f.kind === "business"
              ? <>{f.allowAll ? <option value="all">Todos los negocios</option> : <option value="">Elige un negocio</option>}{businesses.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</>
              : f.kind === "choice"
                ? f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)
                : <>
                    <option value="">{options ? f.emptyLabel : "Cargando…"}</option>
                    {(options?.[f.kind === "goal" ? "goals" : f.kind === "folder" ? "folders" : "categories"] ?? []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </>}
          </select>
        </label>
      ))}
      {meta.sizes.length <= 1 && meta.fields.length === 0 && <p className="text-sm text-muted">Este widget no tiene ajustes.</p>}
      <Button type="submit">Guardar</Button>
    </form>
  );
}
