"use client";

import { Check, Clock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { completeReminder, snoozeReminder } from "@/app/(app)/aviso/actions";
import { Button } from "@/components/ui/button";
import { SNOOZE_LABELS, type SnoozeOption } from "@/lib/tasks/snooze";

/** Botones grandes «Hecho» y «Posponer» para resolver un recordatorio suelto con un toque. */
export function NoticeActions({ id, done }: { kind: "reminder"; id: string; done: boolean }) {
  const router = useRouter();
  const [result, setResult] = useState<string | null>(done ? "Ya estaba hecha ✔" : null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const run = (label: string, fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => { const r = await fn(); if (r.ok) { setResult(label); setError(null); router.refresh(); } else setError(r.error ?? "No se pudo completar"); });

  if (result) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p role="status" className="inline-flex items-center gap-2 rounded-xl bg-emerald-500/10 px-4 py-3 font-medium text-emerald-700 dark:text-emerald-400"><Check className="size-5" aria-hidden /> {result}</p>
        <Button variant="secondary" onClick={() => router.push("/tareas")}>Ir a Hoy</Button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <Button className="min-h-14 w-full text-base" disabled={pending} onClick={() => run("Hecho ✔", () => completeReminder(id))}><Check className="size-5" aria-hidden /> Hecho</Button>
      <div>
        <p className="mb-2 flex items-center gap-1.5 text-sm font-medium"><Clock className="size-4" aria-hidden /> Posponer</p>
        <div className="grid grid-cols-2 gap-2">
          {(Object.keys(SNOOZE_LABELS) as SnoozeOption[]).map((o) => (
            <Button key={o} variant="secondary" disabled={pending} className="min-h-12" onClick={() => run(`Pospuesta: ${SNOOZE_LABELS[o].toLowerCase()}`, () => snoozeReminder(id, o))}>{SNOOZE_LABELS[o]}</Button>
          ))}
        </div>
      </div>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </div>
  );
}
