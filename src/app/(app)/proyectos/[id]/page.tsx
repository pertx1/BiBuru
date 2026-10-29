import { CheckSquare, ChevronLeft, FolderKanban, NotebookText, Play, Video } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { NewCategory, NewProjectNote, ProjectDescription, QuickProjectTask } from "@/components/projects/project-client";
import { formatDate } from "@/lib/dates";
import { getProject } from "@/lib/projects/data";

export const metadata = { title: "Proyecto" };

function Section({ title, icon: Icon, action, children }: { title: string; icon: typeof Video; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-xl bg-surface p-4">
      <header className="mb-2 flex items-center justify-between gap-2"><h2 className="flex items-center gap-2 text-sm font-semibold"><Icon className="size-4 text-accent" aria-hidden />{title}</h2>{action}</header>
      {children}
    </section>
  );
}

/** Un proyecto (categoría): descripción, subcategorías y todo lo suyo (y de sus subcategorías): tareas, notas y vídeos. */
export default async function ProyectoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const p = await getProject(id);
  if (!p) notFound();
  const name = new Map(p.all.map((c) => [c.id, c.name]));
  // Si algo es de una subcategoría, se dice de cuál.
  const sub = (catId: string | null) => (catId && catId !== id ? <span className="ml-1 rounded bg-fill px-1.5 text-[11px] text-muted">{name.get(catId)}</span> : null);
  const parent = p.trail.length > 1 ? p.trail[p.trail.length - 2] : null;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href={parent ? `/proyectos/${parent.id}` : "/proyectos"} className="mb-1 inline-flex min-h-11 items-center gap-1 text-sm text-muted hover:text-foreground"><ChevronLeft className="size-4" aria-hidden />{parent ? parent.name : "Proyectos"}</Link>
        <p className="text-xs text-muted">{p.trail.map((c) => c.name).join(" › ")}</p>
        <h1 className="text-[2rem] font-bold leading-tight tracking-[-0.02em]">{p.category.name}</h1>
      </div>
      <ProjectDescription categoryId={id} initial={p.category.description} />

      <Section title={p.children.length ? `Dentro de ${p.category.name}` : "Subcategorías"} icon={FolderKanban}>
        {p.children.length > 0 && (
          <ul className="mb-3 flex flex-wrap gap-2">
            {p.children.map((c) => {
              const n = p.counts[c.id];
              return <li key={c.id}><Link href={`/proyectos/${c.id}`} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-fill px-3 text-sm md:min-h-9">{c.name}<span className="text-xs text-muted">{(n?.tasks ?? 0) + (n?.notes ?? 0) + (n?.videos ?? 0)}</span></Link></li>;
            })}
          </ul>
        )}
        <NewCategory categories={p.all} parentId={id} compact />
      </Section>

      <div className="grid gap-4 md:grid-cols-2">
        <Section title={`Tareas · ${p.tasks.length}`} icon={CheckSquare} action={<Link href={`/tareas/nueva?categoria=${id}&volver=/proyectos/${id}`} className="text-xs text-accent">Con fecha…</Link>}>
          <QuickProjectTask categoryId={id} />
          {p.tasks.length === 0 ? <p className="mt-2 text-sm text-muted">Nada pendiente.</p> : (
            <ul className="mt-2 flex flex-col divide-y divide-border">
              {p.tasks.map((t) => (
                <li key={t.id}><Link href={`/tareas/${t.id}`} className="flex min-h-11 items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate">{t.priority === 3 ? "❗ " : ""}{t.title}{sub(t.category_id)}</span>
                  {t.due_date && <span className="shrink-0 text-xs text-muted tabular-nums">{formatDate(t.due_date)}{t.due_time ? ` ${t.due_time.slice(0, 5)}` : ""}</span>}
                </Link></li>
              ))}
            </ul>
          )}
          {p.doneTasks > 0 && <p className="mt-2 text-xs text-muted">{p.doneTasks} hechas</p>}
        </Section>

        <Section title={`Notas · ${p.notes.length}`} icon={NotebookText} action={<NewProjectNote categoryId={id} />}>
          {p.notes.length === 0 ? <p className="text-sm text-muted">Apunta aquí ideas, planes o lo que vayas aprendiendo.</p> : (
            <ul className="flex flex-col divide-y divide-border">
              {p.notes.map((n) => (
                <li key={n.id}><Link href={`/notas/${n.id}`} className="block py-2 text-sm">
                  <span className="font-medium">{n.pinned ? "📌 " : ""}{n.title || "Sin título"}</span>{sub(n.category_id)}
                  {n.body && <span className="line-clamp-2 text-xs text-muted">{n.body.replace(/[#*_>`-]/g, "").slice(0, 200)}</span>}
                </Link></li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <Section title={`Vídeos · ${p.videos.length}`} icon={Video} action={<Link href={`/favoritos?estado=todos&cat=${id}`} className="text-xs text-accent">Ver en Favoritos</Link>}>
        {p.videos.length === 0 ? <p className="text-sm text-muted">Ningún vídeo en esta categoría. En Favoritos, abre un vídeo y elígela en «Categoría» (la IA también la usa al analizar).</p> : (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {p.videos.map((v) => (
              <li key={v.id}><Link href={`/favoritos?estado=todos&abrir=${v.id}`} className="flex gap-3 rounded-lg p-2 hover:bg-fill">
                <span className="relative flex aspect-video w-28 shrink-0 items-center justify-center overflow-hidden rounded-md bg-fill">
                  {/* eslint-disable-next-line @next/next/no-img-element -- miniaturas externas */}
                  {v.thumbnail_url ? <img src={v.thumbnail_url} alt="" loading="lazy" referrerPolicy="no-referrer" className="size-full object-cover" /> : <Play className="size-5 text-muted" aria-hidden />}
                </span>
                <span className="min-w-0 text-sm">
                  <span className="line-clamp-2 font-medium">{v.title}</span>
                  <span className="text-xs text-muted">{v.utility ? "★".repeat(v.utility) + " " : ""}{v.status === "por_ver" ? "Por ver" : v.status === "visto" ? "Visto" : "Aplicado"}</span>{sub(v.category_id)}
                </span>
              </Link></li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
