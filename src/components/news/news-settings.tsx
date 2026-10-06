"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, CircleAlert, CircleCheck, CircleDashed, RefreshCw, Trash2 } from "lucide-react";
import { addNewsSource, checkNewsSource, deleteNewsSource, deleteNewsTopic, reorderNewsTopics, saveNewsSettings, saveNewsTopic, updateNewsSource } from "@/app/(app)/noticias/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { KIND_LABELS, type SourceKind } from "@/lib/news/sources";
import { cn } from "@/lib/utils";

export type TopicRow = { id: string; name: string; description: string | null; keywords: string[]; color: string; active: boolean };
export type SourceView = { id: string; kind: SourceKind; name: string; handle: string | null; topic_id: string | null; active: boolean; status: string; last_error: string | null; last_checked_at: string | null; preset: boolean };

const PLACEHOLDER: Record<SourceKind, string> = {
  rss: "https://medio.com/rss", google_news: "palabras clave, p. ej. ayudas autónomos", youtube: "https://www.youtube.com/channel/UC…",
  bluesky: "@cuenta.bsky.social", mastodon: "@usuario@mastodon.social", blog: "https://tunewsletter.substack.com",
};
const STATUS = {
  ok: { icon: CircleCheck, label: "Funciona", cls: "text-good" },
  down: { icon: CircleAlert, label: "Caída", cls: "text-bad" },
  unchecked: { icon: CircleDashed, label: "Sin comprobar", cls: "text-muted" },
} as const;

/** Ajustes → Noticias: hora del resumen, fines de semana, temas (crear, editar, ordenar, desactivar) y fuentes (añadir, quitar, activar). */
export function NewsSettings({ settings, topics, sources }: { settings: { enabled: boolean; time: string; weekends: boolean }; topics: TopicRow[]; sources: SourceView[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [s, setS] = useState(settings);
  const [kind, setKind] = useState<SourceKind>("rss");
  const [input, setInput] = useState("");
  const [topicId, setTopicId] = useState<string>("");
  const [lang, setLang] = useState<"es" | "en">("es");
  const [editing, setEditing] = useState<TopicRow | "new" | null>(null);
  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string, then?: () => void) =>
    start(async () => { const r = await fn(); setMsg(r.ok ? ok : (r.error ?? "No se pudo")); if (r.ok) then?.(); router.refresh(); });
  const saveSettings = (next: typeof s) => { setS(next); act(() => saveNewsSettings(next), "Guardado"); };
  const move = (i: number, d: -1 | 1) => { const ids = topics.map((t) => t.id); [ids[i], ids[i + d]] = [ids[i + d], ids[i]]; act(() => reorderNewsTopics(ids), "Orden guardado"); };
  const select = "min-h-11 rounded-lg border border-border bg-background px-3 text-base md:text-sm";

  return (
    <div className="flex flex-col gap-5 text-sm">
      <div className="flex flex-col gap-3">
        <label className="flex min-h-11 items-center justify-between gap-3">Resumen diario de noticias
          <input type="checkbox" className="size-5" checked={s.enabled} onChange={(e) => saveSettings({ ...s, enabled: e.target.checked })} /></label>
        <label className="flex min-h-11 items-center justify-between gap-3">Hora del resumen y del aviso
          <input type="time" className={select} value={s.time} onChange={(e) => setS({ ...s, time: e.target.value })} onBlur={() => saveSettings(s)} /></label>
        <label className="flex min-h-11 items-center justify-between gap-3">También sábados y domingos
          <input type="checkbox" className="size-5" checked={s.weekends} onChange={(e) => saveSettings({ ...s, weekends: e.target.checked })} /></label>
      </div>

      <section>
        <div className="mb-2 flex items-center justify-between"><h3 className="font-semibold">Temas</h3><Button type="button" variant="secondary" onClick={() => setEditing("new")}>Nuevo tema</Button></div>
        <ul className="divide-y divide-border rounded-lg border border-border">
          {topics.map((t, i) => (
            <li key={t.id} className={cn("flex items-center gap-2 px-3 py-2", !t.active && "opacity-50")}>
              <span className="size-3 shrink-0 rounded-full" style={{ background: t.color }} aria-hidden />
              <button type="button" className="min-h-11 min-w-0 flex-1 text-left" onClick={() => setEditing(t)}><span className="block truncate font-medium">{t.name}</span><span className="block truncate text-xs text-muted">{t.keywords.slice(0, 6).join(", ")}</span></button>
              <button type="button" className="size-11 disabled:opacity-30 md:size-9" disabled={i === 0 || pending} onClick={() => move(i, -1)} aria-label={`Subir ${t.name}`}><ArrowUp className="mx-auto size-4" /></button>
              <button type="button" className="size-11 disabled:opacity-30 md:size-9" disabled={i === topics.length - 1 || pending} onClick={() => move(i, 1)} aria-label={`Bajar ${t.name}`}><ArrowDown className="mx-auto size-4" /></button>
            </li>
          ))}
        </ul>
        {editing && <TopicForm topic={editing === "new" ? null : editing} pending={pending} onCancel={() => setEditing(null)}
          onSave={(t) => act(() => saveNewsTopic(t), "Tema guardado", () => setEditing(null))}
          onDelete={(id) => { if (confirm("¿Borrar el tema? Sus fuentes y noticias se quedan sin tema.")) act(() => deleteNewsTopic(id), "Tema borrado", () => setEditing(null)); }} />}
      </section>

      <section>
        <h3 className="mb-2 font-semibold">Fuentes</h3>
        <form className="mb-3 flex flex-col gap-2 rounded-lg border border-border p-3" onSubmit={(e) => { e.preventDefault(); act(() => addNewsSource(kind, input, topicId || null, lang), "Fuente añadida y comprobada", () => setInput("")); }}>
          <div className="flex flex-wrap gap-2">
            <select className={select} value={kind} onChange={(e) => setKind(e.target.value as SourceKind)} aria-label="Tipo de fuente">
              {(Object.keys(KIND_LABELS) as SourceKind[]).map((k) => <option key={k} value={k}>{k === "rss" ? "Periódico o medio (RSS)" : KIND_LABELS[k]}</option>)}
            </select>
            <select className={select} value={topicId} onChange={(e) => setTopicId(e.target.value)} aria-label="Tema"><option value="">Tema automático</option>{topics.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
            {kind === "google_news" && <select className={select} value={lang} onChange={(e) => setLang(e.target.value as "es" | "en")} aria-label="Idioma"><option value="es">Español</option><option value="en">Inglés</option></select>}
          </div>
          <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder={PLACEHOLDER[kind]} aria-label="Dirección, cuenta o búsqueda" />
          <Button type="submit" disabled={pending || input.trim().length < 2} className="self-start">{pending ? "Comprobando…" : "Añadir fuente"}</Button>
          <p className="text-xs text-muted">Antes de añadirla se comprueba que existe y responde. Solo se guardan titulares, entradillas y enlaces. X, Instagram y TikTok no están incluidos.</p>
        </form>
        <ul className="divide-y divide-border rounded-lg border border-border">
          {sources.map((src) => {
            const st = STATUS[(src.status as keyof typeof STATUS)] ?? STATUS.unchecked;
            return (
              <li key={src.id} className={cn("flex items-center gap-2 px-3 py-2", !src.active && "opacity-50")}>
                <st.icon className={cn("size-4 shrink-0", st.cls)} aria-label={st.label} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{src.name}</span>
                  <span className="block truncate text-xs text-muted">{KIND_LABELS[src.kind]}{topics.find((t) => t.id === src.topic_id) ? ` · ${topics.find((t) => t.id === src.topic_id)!.name}` : ""}{src.status === "down" && src.last_error ? ` · ${src.last_error}` : ""}</span>
                </span>
                <button type="button" className="size-11 md:size-9" disabled={pending} onClick={() => act(() => checkNewsSource(src.id), "Fuente comprobada")} aria-label={`Comprobar ${src.name}`}><RefreshCw className="mx-auto size-4" /></button>
                <input type="checkbox" className="size-5" checked={src.active} disabled={pending} onChange={(e) => act(() => updateNewsSource(src.id, { active: e.target.checked }), e.target.checked ? "Activada" : "Desactivada")} aria-label={`Activar ${src.name}`} />
                <button type="button" className="size-11 text-muted hover:text-danger md:size-9" disabled={pending} onClick={() => { if (confirm(`¿Quitar «${src.name}»?`)) act(() => deleteNewsSource(src.id), "Fuente quitada"); }} aria-label={`Quitar ${src.name}`}><Trash2 className="mx-auto size-4" /></button>
              </li>
            );
          })}
        </ul>
      </section>
      {msg && <p role="status" className="text-muted">{msg}</p>}
    </div>
  );
}

function TopicForm({ topic, pending, onSave, onDelete, onCancel }: { topic: TopicRow | null; pending: boolean; onSave: (t: { id?: string; name: string; description?: string; keywords: string[]; color: string; active: boolean }) => void; onDelete: (id: string) => void; onCancel: () => void }) {
  const [name, setName] = useState(topic?.name ?? "");
  const [description, setDescription] = useState(topic?.description ?? "");
  const [keywords, setKeywords] = useState((topic?.keywords ?? []).join(", "));
  const [color, setColor] = useState(topic?.color ?? "#7b6cf6");
  const [active, setActive] = useState(topic?.active ?? true);
  return (
    <form className="mt-3 flex flex-col gap-2 rounded-lg border border-accent/40 p-3" onSubmit={(e) => { e.preventDefault(); onSave({ id: topic?.id, name, description, keywords: keywords.split(",").map((k) => k.trim()).filter(Boolean), color, active }); }}>
      <p className="font-semibold">{topic ? "Editar tema" : "Nuevo tema"}</p>
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre" aria-label="Nombre del tema" />
      <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Qué te interesa de este tema (opcional)" aria-label="Descripción" />
      <Input value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="Palabras clave separadas por comas" aria-label="Palabras clave" />
      <div className="flex items-center gap-3"><label className="flex items-center gap-2">Color <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="size-9" /></label>
        <label className="flex items-center gap-2"><input type="checkbox" className="size-5" checked={active} onChange={(e) => setActive(e.target.checked)} />Activo</label></div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending || !name.trim()}>Guardar</Button>
        <Button type="button" variant="secondary" onClick={onCancel}>Cancelar</Button>
        {topic && <Button type="button" variant="ghost" className="text-danger" onClick={() => onDelete(topic.id)}>Borrar</Button>}
      </div>
    </form>
  );
}
