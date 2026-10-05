"use client";

import { CornerDownLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { createTaskQuick } from "@/app/(app)/tareas/actions";
import { useToast } from "@/components/ui/toast";
import { describeRecurrence } from "@/lib/tasks/recurrence";
import { dueLabel } from "@/lib/tasks/format";
import { parseQuickTask } from "@/lib/tasks/quick-parse";
import { cn } from "@/lib/utils";

/** Una línea: escribe, Enter y listo. Muestra en vivo cómo se ha entendido la fecha. */
export function QuickAdd({
  today, nowTime, businessId, goalId, placeholder = "Nueva tarea… ej. llamar a la imprenta mañana a las 10", autoFocus,
}: { today: string; nowTime: string; businessId?: string; goalId?: string; placeholder?: string; autoFocus?: boolean }) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const parsed = useMemo(() => (text.trim() ? parseQuickTask(text, today, nowTime) : null), [text, today, nowTime]);

  function submit() {
    const value = text.trim();
    if (!value) return;
    setText("");
    setError(null);
    start(async () => {
      const r = await createTaskQuick(value, { businessId, goalId });
      if (r.ok) { toast({ message: "Tarea añadida", durationMs: 2500 }); router.refresh(); }
      else { setText(value); setError(r.error); }
    });
  }

  const due = parsed?.date ? dueLabel(parsed.date, parsed.time, today) : null;
  return (
    <div className="flex flex-col gap-1.5">
      <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 focus-within:border-accent">
        <input
          value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} aria-label="Nueva tarea" autoFocus={autoFocus}
          enterKeyHint="done" maxLength={500} className="min-h-12 flex-1 bg-transparent text-base outline-none placeholder:text-muted md:min-h-11 md:text-sm"
        />
        <button type="submit" disabled={pending || !text.trim()} aria-label="Añadir tarea" className="flex size-10 items-center justify-center rounded-lg text-muted enabled:text-accent disabled:opacity-40">
          <CornerDownLeft className="size-5" aria-hidden />
        </button>
      </form>
      {parsed && (
        <p className="flex flex-wrap gap-1.5 px-1 text-xs text-muted" aria-live="polite">
          <span className="font-medium text-foreground">{parsed.title}</span>
          {due && <span className={cn("rounded-full bg-surface-2 px-2 py-0.5", due.overdue && "text-danger")}>{due.text}</span>}
          {parsed.recurrence && <span className="rounded-full bg-surface-2 px-2 py-0.5">{describeRecurrence(parsed.recurrence)}</span>}
          {parsed.priority > 0 && <span className="rounded-full bg-surface-2 px-2 py-0.5">Prioridad {parsed.priority === 3 ? "alta" : "media"}</span>}
          {parsed.businessHint && <span className="rounded-full bg-surface-2 px-2 py-0.5">#{parsed.businessHint}</span>}
        </p>
      )}
      {error && <p role="alert" className="px-1 text-sm text-danger">{error}</p>}
    </div>
  );
}
