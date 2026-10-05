"use client";

import { Sparkles, Undo2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { restoreInbox } from "@/app/(app)/bandeja/actions";

type Row = { id: string; text: string; result?: { kind: string; id: string; label: string; href: string } };

/** Capturas que la IA aplicó sola (ajuste «aplicar automáticamente»), con enlace y deshacer. */
export function AutoApplied({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const [gone, setGone] = useState<string[]>([]);
  const [, start] = useTransition();
  const list = rows.filter((r) => r.result && !gone.includes(r.id));
  if (list.length === 0) return null;
  return (
    <section aria-label="Aplicadas automáticamente" className="mt-8">
      <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><Sparkles className="size-4 text-accent" aria-hidden /> Aplicadas automáticamente</h2>
      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
        {list.map((r) => (
          <li key={r.id} className="flex items-center gap-2 pl-4">
            <span className="min-w-0 flex-1 py-2.5 text-sm"><span className="block truncate text-muted">{r.text}</span><Link href={r.result!.href} className="text-accent underline">{r.result!.label}</Link></span>
            <button type="button" aria-label="Deshacer" className="flex size-11 items-center justify-center text-muted hover:text-foreground" onClick={() => { setGone((g) => [...g, r.id]); start(async () => { await restoreInbox(r.id, { kind: r.result!.kind as "task", id: r.result!.id }); router.refresh(); }); }}><Undo2 className="size-4" aria-hidden /></button>
          </li>
        ))}
      </ul>
    </section>
  );
}
