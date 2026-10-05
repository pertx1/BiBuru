"use client";

import { Select } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { Recurrence } from "@/lib/tasks/recurrence";
import { cn } from "@/lib/utils";

const DAYS = ["L", "M", "X", "J", "V", "S", "D"];
const DAY_NAMES = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];

/** Selector de repetición: ninguna, diaria, semanal (con días), mensual, anual. */
export function RecurrenceField({ value, onChange }: { value: Recurrence | null; onChange: (r: Recurrence | null) => void }) {
  const freq = value?.freq ?? "";
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <Select aria-label="Repetir" value={freq} onChange={(e) => {
          const f = e.target.value;
          onChange(f ? { freq: f as Recurrence["freq"], interval: value?.interval ?? 1, ...(f === "weekly" && value?.byweekday ? { byweekday: value.byweekday } : {}), ...(value?.until ? { until: value.until } : {}) } : null);
        }}>
          <option value="">No se repite</option><option value="daily">Cada día</option><option value="weekly">Cada semana</option><option value="monthly">Cada mes</option><option value="yearly">Cada año</option>
        </Select>
        {value && (
          <label className="flex items-center gap-2 text-sm text-muted">cada
            <Input aria-label="Cada cuántos" inputMode="numeric" className="w-16" value={value.interval} onChange={(e) => onChange({ ...value, interval: Math.max(1, Math.min(365, parseInt(e.target.value, 10) || 1)) })} />
          </label>
        )}
      </div>
      {value?.freq === "weekly" && (
        <div role="group" aria-label="Días de la semana" className="flex gap-1.5">
          {DAYS.map((d, i) => {
            const on = value.byweekday?.includes(i) ?? false;
            return (
              <button key={d} type="button" aria-pressed={on} aria-label={DAY_NAMES[i]}
                onClick={() => { const cur = new Set(value.byweekday ?? []); if (on) cur.delete(i); else cur.add(i); onChange({ ...value, byweekday: [...cur].sort() }); }}
                className={cn("size-10 rounded-full border border-border text-sm font-medium", on ? "border-accent bg-accent text-accent-foreground" : "bg-surface")}>{d}</button>
            );
          })}
        </div>
      )}
      {value && (
        <label className="flex flex-col gap-1 text-xs text-muted">Hasta (opcional)
          <Input type="date" value={value.until ?? ""} onChange={(e) => onChange({ ...value, until: e.target.value || undefined })} />
        </label>
      )}
    </div>
  );
}
