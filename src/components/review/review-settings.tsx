"use client";

import { useState, useTransition } from "react";
import { saveReviewPrefs, type ReviewPrefsInput } from "@/app/(app)/revision/actions";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

const DAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

/** Ajustes › Revisiones: cuándo se genera (y avisa) cada revisión. */
export function ReviewSettings({ initial }: { initial: ReviewPrefsInput }) {
  const [s, setS] = useState(initial);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof ReviewPrefsInput>(k: K, v: ReviewPrefsInput[K]) => { setS((x) => ({ ...x, [k]: v })); setMsg(null); };
  const row = "flex flex-col gap-1.5 border-b border-border py-2.5 text-sm last:border-0 sm:grid sm:grid-cols-[1fr_auto] sm:items-center sm:gap-3";
  return (
    <form className="flex flex-col gap-1" onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await saveReviewPrefs(s); setMsg(r.ok ? "Guardado" : r.error); }); }}>
      <div className={row}><span>Diaria (cada mañana)</span><span className="flex items-center gap-2">
        <input type="checkbox" className="size-5" aria-label="Revisión diaria" checked={s.review_daily_enabled} onChange={(e) => set("review_daily_enabled", e.target.checked)} />
        <Input type="time" aria-label="Hora de la revisión diaria" className="w-32" value={s.review_daily_time} onChange={(e) => set("review_daily_time", e.target.value)} required />
      </span></div>
      <div className={row}><span>Semanal</span><span className="flex flex-wrap items-center gap-2">
        <input type="checkbox" className="size-5" aria-label="Revisión semanal" checked={s.review_weekly_enabled} onChange={(e) => set("review_weekly_enabled", e.target.checked)} />
        <Select aria-label="Día de la revisión semanal" value={s.review_weekly_dow} onChange={(e) => set("review_weekly_dow", Number(e.target.value))} className="w-36">{DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}</Select>
        <Input type="time" aria-label="Hora de la revisión semanal" className="w-32" value={s.review_weekly_time} onChange={(e) => set("review_weekly_time", e.target.value)} required />
      </span></div>
      <div className={row}><span>Mensual (el día 1)</span><span className="flex items-center gap-2">
        <input type="checkbox" className="size-5" aria-label="Revisión mensual" checked={s.review_monthly_enabled} onChange={(e) => set("review_monthly_enabled", e.target.checked)} />
        <Input type="time" aria-label="Hora de la revisión mensual" className="w-32" value={s.review_monthly_time} onChange={(e) => set("review_monthly_time", e.target.value)} required />
      </span></div>
      <p className="text-xs text-muted">Se generan solas a esa hora (con tus datos reales) y te llega un aviso, salvo en horas de silencio. La semanal de viernes a domingo revisa esa semana; otro día, la anterior.</p>
      <div className="mt-2 flex items-center gap-3"><Button type="submit" disabled={pending}>{pending ? "Guardando…" : "Guardar"}</Button>{msg && <span role="status" className="text-sm text-muted">{msg}</span>}</div>
    </form>
  );
}
