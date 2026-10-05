"use client";

import { CheckSquare, Euro, FileText, Search, ShoppingBag, Video } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { searchGlobal } from "@/app/(app)/buscar/actions";
import type { SearchHit } from "@/lib/notes/data";
import { formatDate } from "@/lib/dates";
import { cn } from "@/lib/utils";

export const OPEN_SEARCH_EVENT = "biburu:open-search";
const ICONS = { note: FileText, task: CheckSquare, order: ShoppingBag, expense: Euro, video: Video } as const;
const LABELS = { note: "Nota", task: "Tarea", order: "Pedido", expense: "Gasto", video: "Vídeo" } as const;

export function hitHref(h: SearchHit): string {
  switch (h.kind) {
    case "note": return `/notas/${h.id}`;
    case "task": return `/tareas?v=todas&abrir=${h.id}`;
    case "order": return h.business_id ? `/negocios/${h.business_id}/pedidos?abrir=${h.id}` : "/negocios";
    case "expense": return h.business_id ? `/negocios/${h.business_id}/gastos?abrir=${h.id}` : "/negocios";
    case "video": return `/favoritos?abrir=${h.id}`;
  }
}

/** Buscador global (Ctrl/Cmd+K): notas, tareas, pedidos, gastos y vídeos. */
export function SearchPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [result, setResult] = useState<{ q: string; hits: SearchHit[] }>({ q: "", hits: [] });
  const [active, setActive] = useState(0);
  const hits = q.trim() ? result.hits : [];
  const loading = !!q.trim() && result.q !== q;
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const seq = useRef(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((o) => !o); }
      if (e.key === "Escape") setOpen(false);
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_SEARCH_EVENT, onOpen);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener(OPEN_SEARCH_EVENT, onOpen); };
  }, []);

  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 30); }, [open]);

  useEffect(() => {
    if (!open || !q.trim()) return;
    const id = ++seq.current;
    const t = setTimeout(async () => {
      const r = await searchGlobal(q);
      if (id === seq.current) { setResult({ q, hits: r }); setActive(0); }
    }, 180);
    return () => clearTimeout(t);
  }, [q, open]);

  function go(h: SearchHit) {
    setOpen(false);
    setQ("");
    router.push(hitHref(h));
  }

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 p-4 pt-[max(1rem,env(safe-area-inset-top))] md:pt-24" onClick={(e) => e.target === e.currentTarget && setOpen(false)} role="presentation">
      <div role="dialog" aria-modal="true" aria-label="Buscar" className="w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-surface shadow-xl">
        <div className="flex items-center gap-2 border-b border-border px-3">
          <Search className="size-4 text-muted" aria-hidden />
          <input
            ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar en notas, tareas, pedidos y gastos…" aria-label="Buscar"
            className="min-h-12 flex-1 bg-transparent text-base outline-none placeholder:text-muted md:text-sm"
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, hits.length - 1)); }
              if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
              if (e.key === "Enter" && hits[active]) go(hits[active]);
            }}
          />
          <kbd className="hidden rounded border border-border px-1.5 text-xs text-muted md:block">Esc</kbd>
        </div>
        <ul role="listbox" className="max-h-[60dvh] overflow-y-auto p-1">
          {hits.map((h, i) => {
            const Icon = ICONS[h.kind];
            return (
              <li key={`${h.kind}-${h.id}-${i}`} role="option" aria-selected={i === active}>
                <button type="button" onClick={() => go(h)} onMouseEnter={() => setActive(i)} className={cn("flex min-h-12 w-full items-start gap-3 rounded-lg px-3 py-2 text-left", i === active && "bg-surface-2")}>
                  <Icon className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{h.title}</span>
                    {h.snippet && <span className="block truncate text-xs text-muted">{h.snippet.replace(/<\/?b>/g, "").replace(/[#*_`>\[\]]/g, "").replace(/\s+/g, " ")}</span>}
                  </span>
                  <span className="shrink-0 text-xs text-muted">{LABELS[h.kind]}{h.happened_on ? ` · ${formatDate(h.happened_on)}` : ""}</span>
                </button>
              </li>
            );
          })}
          {q.trim() && !loading && hits.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted">Nada encontrado para «{q}».</li>}
          {!q.trim() && <li className="px-3 py-6 text-center text-sm text-muted">Escribe para buscar. Atajo: Ctrl/Cmd + K</li>}
        </ul>
      </div>
    </div>
  );
}
