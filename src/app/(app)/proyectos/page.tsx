import { FolderKanban } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { NewCategory } from "@/components/projects/project-client";
import { EmptyState } from "@/components/ui/empty-state";
import type { CatNode } from "@/lib/categories/tree";
import { getProjectsOverview, type Category, type Counts } from "@/lib/projects/data";

export const metadata = { title: "Proyectos" };

function CountsLine({ c }: { c?: Counts }) {
  if (!c || (!c.videos && !c.notes && !c.tasks)) return <span className="text-xs text-muted">Vacío</span>;
  return (
    <span className="text-xs text-muted tabular-nums">
      {[c.tasks && `${c.tasks} ${c.tasks === 1 ? "tarea" : "tareas"}`, c.notes && `${c.notes} ${c.notes === 1 ? "nota" : "notas"}`, c.videos && `${c.videos} ${c.videos === 1 ? "vídeo" : "vídeos"}`].filter(Boolean).join(" · ")}
    </span>
  );
}

function Branch({ nodes, counts }: { nodes: CatNode<Category>[]; counts: Record<string, Counts> }) {
  return (
    <ul className="flex flex-col">
      {nodes.map((n) => (
        <li key={n.id}>
          <Link href={`/proyectos/${n.id}`} className="flex min-h-11 items-center justify-between gap-3 rounded-lg px-2 py-1.5 hover:bg-fill" style={{ paddingLeft: `${8 + n.depth * 18}px` }}>
            <span className="min-w-0 truncate text-sm">{n.depth ? "› " : ""}{n.name}</span>
            <CountsLine c={counts[n.id]} />
          </Link>
          {n.children.length > 0 && <Branch nodes={n.children} counts={counts} />}
        </li>
      ))}
    </ul>
  );
}

/** Todos tus planes y proyectos en un árbol de categorías (las mismas que Favoritos), con sus tareas, notas y vídeos. */
export default async function ProyectosPage() {
  const { tree, counts } = await getProjectsOverview();
  const flatCats = (function flat(n: CatNode<Category>[]): Category[] { return n.flatMap((x) => [x, ...flat(x.children)]); })(tree);
  return (
    <>
      <PageHeader title="Proyectos" subtitle="Tus planes, ideas y proyectos ordenados por categorías, con sus tareas, notas y vídeos." />
      <div className="mb-4"><NewCategory categories={flatCats} /></div>
      {tree.length === 0 ? (
        <EmptyState icon={FolderKanban} title="Aún no hay categorías">Crea la primera arriba (por ejemplo «Posibles negocios» o «IA»).</EmptyState>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {tree.map((n) => (
            <section key={n.id} className="rounded-xl bg-surface p-3">
              <Link href={`/proyectos/${n.id}`} className="flex min-h-11 items-start justify-between gap-3 px-2 py-1">
                <span className="min-w-0">
                  <span className="block truncate text-base font-semibold">{n.pinned ? "📌 " : ""}{n.name}</span>
                  {n.description && <span className="line-clamp-2 text-xs text-muted">{n.description}</span>}
                </span>
                <CountsLine c={counts[n.id]} />
              </Link>
              {n.children.length > 0 && <div className="mt-1 border-t border-border pt-1"><Branch nodes={n.children} counts={counts} /></div>}
            </section>
          ))}
        </div>
      )}
    </>
  );
}
