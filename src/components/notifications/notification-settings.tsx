"use client";

import { useState, useTransition } from "react";
import { saveNotificationSettings, type NotificationSettings } from "@/app/(app)/ajustes/actions";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

const DAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const LEADS = [[0, "A su hora"], [5, "5 minutos antes"], [10, "10 minutos antes"], [15, "15 minutos antes"], [30, "30 minutos antes"], [60, "1 hora antes"], [120, "2 horas antes"], [1440, "1 día antes"]] as const;

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex flex-col gap-1.5 border-b border-border py-2.5 text-sm last:border-0 sm:grid sm:grid-cols-[1fr_auto] sm:items-center sm:gap-3"><span className="font-medium sm:font-normal">{label}</span><span className="flex flex-wrap items-center gap-2">{children}</span></div>;
}

/** Tipos de aviso, antelaciones y horas de silencio. */
export function NotificationSettingsForm({ initial }: { initial: NotificationSettings }) {
  const [s, setS] = useState(initial);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof NotificationSettings>(k: K, v: NotificationSettings[K]) => { setS((x) => ({ ...x, [k]: v })); setMsg(null); };
  const lead = (v: number) => LEADS.some(([m]) => m === v) ? LEADS : ([...LEADS, [v, `${v} minutos antes`]] as const);
  const time = (k: "daily_digest_time" | "overdue_alert_time" | "weekly_review_time" | "quiet_hours_start" | "quiet_hours_end") => (
    <Input type="time" aria-label={k} className="w-32" value={s[k].slice(0, 5)} onChange={(e) => set(k, e.target.value)} required />
  );
  const check = (k: "daily_digest_enabled" | "overdue_alert_enabled" | "weekly_review_enabled", label: string) => (
    <input type="checkbox" className="size-5" aria-label={label} checked={s[k]} onChange={(e) => set(k, e.target.checked)} />
  );

  return (
    <form className="flex flex-col gap-1" onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await saveNotificationSettings({ ...s, daily_digest_time: s.daily_digest_time.slice(0, 5), overdue_alert_time: s.overdue_alert_time.slice(0, 5), weekly_review_time: s.weekly_review_time.slice(0, 5), quiet_hours_start: s.quiet_hours_start.slice(0, 5), quiet_hours_end: s.quiet_hours_end.slice(0, 5) }); setMsg(r.ok ? "Guardado" : r.error); }); }}>
      <Row label="Tareas con hora">
        <Select aria-label="Antelación de tareas" value={s.task_lead_minutes} onChange={(e) => set("task_lead_minutes", Number(e.target.value))} className="w-full sm:w-44">{lead(s.task_lead_minutes).map(([m, l]) => <option key={m} value={m}>{l}</option>)}</Select>
      </Row>
      <Row label="Eventos con hora">
        <Select aria-label="Antelación de eventos" value={s.event_lead_minutes} onChange={(e) => set("event_lead_minutes", Number(e.target.value))} className="w-full sm:w-44">{lead(s.event_lead_minutes).map(([m, l]) => <option key={m} value={m}>{l}</option>)}</Select>
      </Row>
      <Row label="Resumen de la mañana">{check("daily_digest_enabled", "Resumen diario")}{time("daily_digest_time")}</Row>
      <Row label="Aviso de tareas atrasadas">{check("overdue_alert_enabled", "Aviso de atrasadas")}{time("overdue_alert_time")}</Row>
      <Row label="Revisión semanal de objetivos">{check("weekly_review_enabled", "Revisión semanal")}
        <Select aria-label="Día de la revisión" value={s.weekly_review_dow} onChange={(e) => set("weekly_review_dow", Number(e.target.value))} className="w-40 sm:w-32">{DAYS.map((n, i) => <option key={n} value={i}>{n}</option>)}</Select>{time("weekly_review_time")}
      </Row>
      <Row label="Horas de silencio">{time("quiet_hours_start")}<span className="text-muted">a</span>{time("quiet_hours_end")}</Row>
      <p className="text-xs text-muted">En horas de silencio no se envía nada; lo que caiga en ese tramo llega al terminar si sigue siendo útil.</p>
      <div className="mt-2 flex items-center gap-3"><Button type="submit" disabled={pending}>{pending ? "Guardando…" : "Guardar"}</Button>{msg && <span role="status" className="text-sm text-muted">{msg}</span>}</div>
    </form>
  );
}
