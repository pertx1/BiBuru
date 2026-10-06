import Link from "next/link";
import { Folder, Lightbulb, Pin, Star } from "lucide-react";
import { getContext } from "@/lib/context";
import { formatDate } from "@/lib/dates";
import { WidgetCard } from "../widget-card";
import type { WidgetProps } from "../types";

const limitFor = (size: string) => (size === "l" ? 8 : size === "s" ? 3 : 5);
const clean = (body: string) => body.replace(/[#>*_`~\-\[\]()!]/g, "").replace(/\s+/g, " ").trim().slice(0, 90);

async function NotesList({ w, pinned }: WidgetProps & { pinned: boolean }) {
  const { supabase, workspaceId } = await getContext();
  let q = supabase.from("notes").select("id, title, body, updated_at").eq("workspace_id", workspaceId).order("updated_at", { ascending: false }).limit(limitFor(w.size));
  if (pinned) q = q.eq("pinned", true);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (
    <WidgetCard title={pinned ? "Notas fijadas" : "Últimas notas"} href="/notas">
      {(data ?? []).length === 0 ? <p className="text-sm text-muted">{pinned ? "No tienes notas fijadas." : "Aún no hay notas."}</p> : (
        <ul className="flex flex-col divide-y divide-border">
          {data!.map((n) => (
            <li key={n.id}>
              <Link href={`/notas/${n.id}`} className="flex min-h-11 min-w-0 flex-col justify-center py-1.5 text-sm">
                <span className="flex items-center gap-1.5 font-medium">{pinned && <Pin className="size-3.5 shrink-0 text-accent" aria-hidden />}<span className="truncate">{n.title || "Sin título"}</span></span>
                {w.size !== "s" && <span className="truncate text-xs text-muted">{clean(n.body) || formatDate(n.updated_at.slice(0, 10))}</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </WidgetCard>
  );
}
export const NotesPinnedWidget = (p: WidgetProps) => <NotesList {...p} pinned />;
export const NotesRecentWidget = (p: WidgetProps) => <NotesList {...p} pinned={false} />;

/** Acceso directo a una carpeta: nombre, cuántas notas tiene y las últimas. */
export async function FolderShortcutWidget({ w }: WidgetProps) {
  const { supabase, workspaceId } = await getContext();
  const id = w.settings.folder;
  const folder = id ? (await supabase.from("folders").select("id, name").eq("workspace_id", workspaceId).eq("id", id).maybeSingle()).data : null;
  if (!folder) return <WidgetCard title="Carpeta" href="/notas"><p className="text-sm text-muted">Pulsa «Editar» → ajustes de este widget y elige una carpeta.</p></WidgetCard>;
  const { data, count } = await supabase.from("notes").select("id, title", { count: "exact" }).eq("workspace_id", workspaceId).eq("folder_id", folder.id).order("updated_at", { ascending: false }).limit(w.size === "s" ? 0 : 3);
  return (
    <WidgetCard title="Carpeta" href={`/notas?carpeta=${folder.id}`}>
      <Link href={`/notas?carpeta=${folder.id}`} className="flex items-center gap-2"><Folder className="size-6 shrink-0 text-accent" aria-hidden /><span className="truncate text-lg font-bold">{folder.name}</span></Link>
      <p className="text-xs text-muted">{count ?? 0} {count === 1 ? "nota" : "notas"}</p>
      {(data ?? []).length > 0 && <ul className="mt-2 flex flex-col gap-1 text-sm">{data!.map((n) => <li key={n.id}><Link href={`/notas/${n.id}`} className="block truncate">{n.title || "Sin título"}</Link></li>)}</ul>}
    </WidgetCard>
  );
}

type VideoRow = { id: string; title: string; thumbnail_url: string | null; utility: number | null; channel: string | null };

function VideoList({ rows, size }: { rows: VideoRow[]; size: string }) {
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((v) => (
        <li key={v.id}>
          <Link href={`/favoritos?abrir=${v.id}`} className="flex min-w-0 items-center gap-2 text-sm">
            {/* eslint-disable-next-line @next/next/no-img-element -- miniatura externa pequeña */}
            {size !== "s" && (v.thumbnail_url ? <img src={v.thumbnail_url} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-9 w-14 shrink-0 rounded-md object-cover" /> : <span className="h-9 w-14 shrink-0 rounded-md bg-surface-2" />)}
            <span className="min-w-0 flex-1"><span className="line-clamp-2 leading-snug">{v.title}</span>{v.channel && size !== "s" ? <span className="block truncate text-xs text-muted">{v.channel}</span> : null}</span>
            {v.utility ? <span className="flex shrink-0 items-center gap-0.5 text-xs font-semibold text-amber-500"><Star className="size-3 fill-current" aria-hidden />{v.utility}</span> : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Vídeos con utilidad 4–5 que no están archivados. */
export async function VideosTopWidget({ w }: WidgetProps) {
  const { supabase, workspaceId } = await getContext();
  const { data, error } = await supabase.from("saved_videos").select("id, title, thumbnail_url, utility, channel").eq("workspace_id", workspaceId)
    .gte("utility", 4).neq("status", "archivado").order("utility", { ascending: false }).order("created_at", { ascending: false }).limit(limitFor(w.size));
  if (error) throw new Error(error.message);
  return <WidgetCard title="Vídeos más útiles" href="/favoritos?orden=util">{(data ?? []).length ? <VideoList rows={data!} size={w.size} /> : <p className="text-sm text-muted">Aún no hay vídeos con utilidad 4 o 5.</p>}</WidgetCard>;
}

export async function VideosRecentWidget({ w }: WidgetProps) {
  const { supabase, workspaceId } = await getContext();
  const { data, error } = await supabase.from("saved_videos").select("id, title, thumbnail_url, utility, channel").eq("workspace_id", workspaceId).order("created_at", { ascending: false }).limit(limitFor(w.size));
  if (error) throw new Error(error.message);
  return <WidgetCard title="Últimos guardados" href="/favoritos?estado=todos&orden=fecha">{(data ?? []).length ? <VideoList rows={data!} size={w.size} /> : <p className="text-sm text-muted">Aún no has guardado vídeos.</p>}</WidgetCard>;
}

/** Ideas accionables de vídeos analizados que todavía no se han convertido en tarea. */
export async function VideoIdeasWidget({ w }: WidgetProps) {
  const { supabase, workspaceId } = await getContext();
  const { data, error } = await supabase.from("saved_videos").select("id, title, actions").eq("workspace_id", workspaceId)
    .is("task_id", null).neq("status", "archivado").neq("status", "aplicado").eq("analysis_status", "ready").order("utility", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false }).limit(20);
  if (error) throw new Error(error.message);
  const ideas = (data ?? []).flatMap((v) => (Array.isArray(v.actions) ? (v.actions as unknown[]) : []).filter((a): a is string => typeof a === "string").map((a) => ({ video: v, idea: a }))).slice(0, w.size === "l" ? 8 : 4);
  return (
    <WidgetCard title="Ideas sin convertir" href="/favoritos">
      {ideas.length === 0 ? <p className="text-sm text-muted">No hay ideas pendientes de tus vídeos.</p> : (
        <ul className="flex flex-col gap-2">
          {ideas.map(({ video, idea }, i) => (
            <li key={`${video.id}-${i}`}>
              <Link href={`/favoritos?abrir=${video.id}`} className="flex gap-2 text-sm">
                <Lightbulb className="mt-0.5 size-4 shrink-0 text-amber-500" aria-hidden />
                <span className="min-w-0"><span className="line-clamp-2">{idea}</span><span className="block truncate text-xs text-muted">{video.title}</span></span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </WidgetCard>
  );
}

/** Recuento por categoría (o los vídeos de una categoría elegida). */
export async function VideosCategoryWidget({ w }: WidgetProps) {
  const { supabase, workspaceId } = await getContext();
  const [cats, vids] = await Promise.all([
    supabase.from("video_categories").select("id, name").eq("workspace_id", workspaceId),
    supabase.from("saved_videos").select("id, title, thumbnail_url, utility, channel, category_id").eq("workspace_id", workspaceId).neq("status", "archivado").order("created_at", { ascending: false }).limit(2000),
  ]);
  if (cats.error || vids.error) throw new Error((cats.error ?? vids.error)!.message);
  const chosen = (cats.data ?? []).find((c) => c.id === w.settings.category);
  if (chosen) {
    const list = (vids.data ?? []).filter((v) => v.category_id === chosen.id);
    return <WidgetCard title={`Vídeos · ${chosen.name}`} href={`/favoritos?estado=todos&cat=${chosen.id}`}><p className="mb-2 text-xs text-muted">{list.length} vídeos</p><VideoList rows={list.slice(0, limitFor(w.size))} size={w.size} /></WidgetCard>;
  }
  const counts = new Map<string, number>();
  for (const v of vids.data ?? []) counts.set(v.category_id ?? "none", (counts.get(v.category_id ?? "none") ?? 0) + 1);
  const rows = [...counts].map(([id, n]) => ({ id, n, name: id === "none" ? "Sin categoría" : ((cats.data ?? []).find((c) => c.id === id)?.name ?? "—") })).sort((a, b) => b.n - a.n).slice(0, w.size === "s" ? 4 : 6);
  const max = Math.max(1, ...rows.map((r) => r.n));
  return (
    <WidgetCard title="Vídeos por categoría" href="/favoritos?estado=todos">
      {rows.length === 0 ? <p className="text-sm text-muted">Aún no hay vídeos.</p> : (
        <ul className="flex flex-col gap-2">
          {rows.map((r) => (
            <li key={r.id}>
              <Link href={`/favoritos?estado=todos&cat=${r.id}`} className="block text-sm">
                <span className="flex justify-between gap-2"><span className="truncate">{r.name}</span><span className="tabular-nums text-muted">{r.n}</span></span>
                <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-surface-2"><span className="block h-full rounded-full bg-accent" style={{ width: `${(r.n / max) * 100}%` }} /></span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </WidgetCard>
  );
}
