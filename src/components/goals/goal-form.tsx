"use client";

import { Pencil, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveGoal } from "@/app/(app)/objetivos/actions";
import { Button } from "@/components/ui/button";
import { Field, Select, Textarea } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Sheet } from "@/components/ui/sheet";
import { formatDecimal } from "@/lib/money";
import type { Goal } from "@/lib/tasks/data";

type Biz = { id: string; name: string };

export function GoalFormButton({ goal, businesses, defaultBusinessId }: { goal?: Goal; businesses: Biz[]; defaultBusinessId?: string }) {
  const [open, setOpen] = useState(false);
  const [measure, setMeasure] = useState<string>(goal?.measure_type ?? "number");
  const [auto, setAuto] = useState<string>(goal?.auto_source ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const autoOptions = measure === "euros"
    ? [["", "A mano"], ["income", "Ingresos del periodo (automático)"], ["profit", "Beneficio del periodo (automático)"]]
    : measure === "milestones" ? [] : [["", "A mano"], ["tasks", "Tareas vinculadas completadas (automático)"]];
  const metric = auto === "income" || auto === "profit";

  function submit(fd: FormData) {
    start(async () => {
      const r = await saveGoal({
        id: goal?.id, title: String(fd.get("title") ?? ""), description: String(fd.get("description") ?? ""), business_id: String(fd.get("business_id") ?? ""),
        measure_type: measure as "number", target: String(fd.get("target") ?? ""), auto_source: (auto || undefined) as "income" | undefined,
        period_start: String(fd.get("period_start") ?? ""), deadline: String(fd.get("deadline") ?? ""),
      });
      if (!r.ok) return setError(r.error);
      setOpen(false);
      if (!goal && r.id) router.push(`/objetivos/${r.id}`); else router.refresh();
    });
  }

  return (
    <>
      <Button variant={goal ? "secondary" : "primary"} onClick={() => setOpen(true)}>{goal ? <Pencil className="size-4" aria-hidden /> : <Plus className="size-4" aria-hidden />}{goal ? "Editar" : "Nuevo objetivo"}</Button>
      <Sheet open={open} onClose={() => setOpen(false)} title={goal ? "Editar objetivo" : "Nuevo objetivo"}>
        <form action={submit} className="flex flex-col gap-4">
          <Field label="Título" htmlFor="g-title"><Input id="g-title" name="title" defaultValue={goal?.title ?? ""} maxLength={200} required autoFocus={!goal} placeholder="Ej. Vender 200 camisetas este trimestre" /></Field>
          <Field label="Descripción" htmlFor="g-desc"><Textarea id="g-desc" name="description" defaultValue={goal?.description ?? ""} maxLength={2000} className="min-h-16" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Se mide en" htmlFor="g-m">
              <Select id="g-m" value={measure} onChange={(e) => { setMeasure(e.target.value); setAuto(""); }}>
                <option value="number">Número</option><option value="euros">Euros</option><option value="percent">Porcentaje</option><option value="milestones">Hitos</option>
              </Select>
            </Field>
            {measure !== "milestones" && (
              <Field label={measure === "euros" ? "Objetivo (€)" : measure === "percent" ? "Objetivo (%)" : "Objetivo"} htmlFor="g-t">
                <Input id="g-t" name="target" inputMode="decimal" defaultValue={goal ? formatDecimal(goal.target_value) : ""} placeholder={measure === "percent" ? "100" : "0"} />
              </Field>
            )}
          </div>
          {autoOptions.length > 0 && (
            <Field label="Cómo se actualiza" htmlFor="g-a"><Select id="g-a" value={auto} onChange={(e) => setAuto(e.target.value)}>{autoOptions.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
          )}
          <Field label="Negocio" htmlFor="g-b" hint={metric ? "Vacío = suma de todos los negocios." : undefined}>
            <Select id="g-b" name="business_id" defaultValue={goal?.business_id ?? defaultBusinessId ?? ""}><option value="">Ninguno / todos</option>{businesses.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            {metric && <Field label="Desde" htmlFor="g-ps"><Input id="g-ps" name="period_start" type="date" defaultValue={goal?.period_start ?? ""} /></Field>}
            <Field label="Fecha límite" htmlFor="g-dl" className={metric ? "" : "col-span-2"}><Input id="g-dl" name="deadline" type="date" defaultValue={goal?.deadline ?? ""} /></Field>
          </div>
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
          <Button type="submit" disabled={pending}>{pending ? "Guardando…" : "Guardar"}</Button>
        </form>
      </Sheet>
    </>
  );
}
