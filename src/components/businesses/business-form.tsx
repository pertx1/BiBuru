"use client";

import { Pencil, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { saveBusiness } from "@/app/(app)/negocios/actions";
import { Button } from "@/components/ui/button";
import { Field, Select, Textarea } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Sheet } from "@/components/ui/sheet";
import { BUSINESS_COLORS, BUSINESS_ICONS } from "@/lib/schemas";
import type { Business } from "@/lib/data";
import { cn } from "@/lib/utils";

const ICON_LABELS: Record<string, string> = {
  briefcase: "Maletín", shirt: "Camiseta", "shopping-bag": "Bolsa", store: "Tienda", palette: "Paleta", camera: "Cámara",
  code: "Código", utensils: "Cubiertos", dumbbell: "Pesa", music: "Música", home: "Casa", sparkles: "Destellos",
};

export function BusinessFormButton({ business }: { business?: Business }) {
  const [open, setOpen] = useState(false);
  const [color, setColor] = useState(business?.color ?? BUSINESS_COLORS[0]);
  const router = useRouter();
  const [state, action, pending] = useActionState(saveBusiness, null);

  useEffect(() => {
    if (state?.ok) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOpen(false);
      if (!business && state.id) router.push(`/negocios/${state.id}`);
      else router.refresh();
    }
  }, [state, business, router]);

  return (
    <>
      <Button variant={business ? "secondary" : "primary"} onClick={() => setOpen(true)}>
        {business ? <Pencil className="size-4" aria-hidden /> : <Plus className="size-4" aria-hidden />}
        {business ? "Editar" : "Nuevo negocio"}
      </Button>
      <Sheet open={open} onClose={() => setOpen(false)} title={business ? "Editar negocio" : "Nuevo negocio"}>
        <form action={action} className="flex flex-col gap-4">
          {business && <input type="hidden" name="id" value={business.id} />}
          <input type="hidden" name="color" value={color} />
          <Field label="Nombre" htmlFor="b-name">
            <Input id="b-name" name="name" defaultValue={business?.name} maxLength={60} required autoFocus={!business} />
          </Field>
          <Field label="Descripción breve" htmlFor="b-desc" hint="La IA la usará como contexto para entender tu negocio (qué vendes, a quién).">
            <Textarea id="b-desc" name="description" defaultValue={business?.description ?? ""} maxLength={500} />
          </Field>
          <Field label="Icono" htmlFor="b-icon">
            <Select id="b-icon" name="icon" defaultValue={business?.icon ?? "briefcase"}>
              {BUSINESS_ICONS.map((i) => <option key={i} value={i}>{ICON_LABELS[i]}</option>)}
            </Select>
          </Field>
          <label className="flex min-h-11 items-start gap-3 text-sm">
            <input type="checkbox" name="production_enabled" defaultChecked={business?.production_enabled} className="mt-1 size-5" />
            <span><span className="font-medium">Módulo de producción</span><br /><span className="text-xs text-muted">Stock de prendas y DTF, bolsa para la imprenta, reglas de color y facturas (como en PROFITY).</span></span>
          </label>
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium">Color</legend>
            <div className="flex flex-wrap gap-2">
              {BUSINESS_COLORS.map((c) => (
                <button
                  key={c} type="button" onClick={() => setColor(c)} aria-label={`Color ${c}`} aria-pressed={color === c}
                  className={cn("size-10 rounded-full border-2 border-transparent", color === c && "border-foreground")}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </fieldset>
          {state && !state.ok && <p role="alert" className="text-sm text-danger">{state.error}</p>}
          <Button type="submit" disabled={pending}>{pending ? "Guardando…" : "Guardar"}</Button>
        </form>
      </Sheet>
    </>
  );
}
