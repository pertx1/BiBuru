"use client";

import { useState, useTransition } from "react";
import { saveWeeklyReview } from "@/app/(app)/objetivos/actions";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

const DAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

/** Día y hora del aviso semanal para actualizar el avance de los objetivos (los avisos llegan en la Fase 5). */
export function ReviewSettings({ dow, time }: { dow: number; time: string }) {
  const [d, setD] = useState(String(dow));
  const [t, setT] = useState(time.slice(0, 5));
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await saveWeeklyReview(Number(d), t); setMsg(r.ok ? "Guardado" : r.error); }); }}>
      <div className="grid grid-cols-2 gap-2">
        <Select aria-label="Día de la revisión" value={d} onChange={(e) => setD(e.target.value)}>{DAYS.map((n, i) => <option key={n} value={i}>{n}</option>)}</Select>
        <Input aria-label="Hora de la revisión" type="time" value={t} onChange={(e) => setT(e.target.value)} required />
      </div>
      <div className="flex items-center gap-3"><Button type="submit" disabled={pending}>Guardar</Button>{msg && <span role="status" className="text-sm text-muted">{msg}</span>}</div>
    </form>
  );
}
