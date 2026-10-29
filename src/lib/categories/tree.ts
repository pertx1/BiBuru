/**
 * Árbol de categorías («IA › Claude»). Lógica pura: sirve a Favoritos, Proyectos, notas, tareas y a la IA que clasifica vídeos.
 */
export type CatRow = { id: string; name: string; parent_id: string | null; pinned?: boolean };
export type CatNode<T extends CatRow = CatRow> = T & { depth: number; path: string; children: CatNode<T>[] };

export const SEP = " › ";
const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();

/** Árbol ordenado (fijadas primero, luego por nombre). Una categoría con un padre que ya no existe sale arriba. */
export function buildTree<T extends CatRow>(rows: T[]): CatNode<T>[] {
  const ids = new Set(rows.map((r) => r.id));
  const kids = new Map<string | null, T[]>();
  for (const r of rows) {
    const p = r.parent_id && ids.has(r.parent_id) && r.parent_id !== r.id ? r.parent_id : null;
    kids.set(p, [...(kids.get(p) ?? []), r]);
  }
  const sort = (a: T, b: T) => Number(!!b.pinned) - Number(!!a.pinned) || a.name.localeCompare(b.name, "es");
  const seen = new Set<string>();
  const make = (parent: string | null, depth: number, prefix: string): CatNode<T>[] =>
    (kids.get(parent) ?? []).sort(sort).filter((r) => !seen.has(r.id) && seen.add(r.id)).map((r) => {
      const path = prefix ? `${prefix}${SEP}${r.name}` : r.name;
      return { ...r, depth, path, children: make(r.id, depth + 1, path) };
    });
  return make(null, 0, "");
}

/** Lista plana en orden de árbol (para desplegables y chips), con su ruta completa. */
export function flatten<T extends CatRow>(tree: CatNode<T>[]): CatNode<T>[] {
  return tree.flatMap((n) => [n, ...flatten(n.children)]);
}

/** El id y todos los de sus subcategorías (para filtrar «IA» con «IA › Claude» dentro). */
export function descendantIds(rows: CatRow[], id: string): string[] {
  const out = [id];
  for (let i = 0; i < out.length; i++) for (const r of rows) if (r.parent_id === out[i] && !out.includes(r.id)) out.push(r.id);
  return out;
}

/** Ruta de una categoría: [IA, Claude]. */
export function ancestors<T extends CatRow>(rows: T[], id: string): T[] {
  const by = new Map(rows.map((r) => [r.id, r]));
  const out: T[] = [];
  let cur = by.get(id);
  while (cur && out.length < 20 && !out.includes(cur)) { out.unshift(cur); cur = cur.parent_id ? by.get(cur.parent_id) : undefined; }
  return out;
}

/** Rutas para la IA que clasifica («IA › Claude»). */
export const categoryPaths = (rows: CatRow[]) => flatten(buildTree(rows)).map((n) => n.path);

/**
 * Categoría propuesta por la IA: ruta exacta («IA › Claude»), o el nombre de una hoja si es único, o una nueva
 * (con `parentPath` si la propuesta trae ruta y el padre existe).
 */
export function resolveProposed(proposed: string, rows: CatRow[]): { id: string | null; name: string; parentId: string | null } {
  const flat = flatten(buildTree(rows));
  const q = norm(proposed.replace(/\s*(›|>|\/)\s*/g, SEP));
  const byPath = flat.find((n) => norm(n.path) === q);
  if (byPath) return { id: byPath.id, name: byPath.name, parentId: byPath.parent_id };
  const parts = q.split(norm(SEP)).map((p) => p.trim()).filter(Boolean);
  const leaf = parts.at(-1) ?? "";
  const sameName = flat.filter((n) => norm(n.name) === leaf);
  if (sameName.length === 1 && parts.length === 1) return { id: sameName[0].id, name: sameName[0].name, parentId: sameName[0].parent_id };
  const raw = proposed.split(/\s*(?:›|>|\/)\s*/).map((s) => s.trim()).filter(Boolean);
  const name = (raw.at(-1) ?? proposed).slice(0, 60);
  const parent = raw.length > 1 ? flat.find((n) => norm(n.path) === parts.slice(0, -1).join(norm(SEP))) : undefined;
  if (parent) { const hit = parent.children.find((c) => norm(c.name) === leaf); if (hit) return { id: hit.id, name: hit.name, parentId: parent.id }; }
  return { id: null, name: name.charAt(0).toUpperCase() + name.slice(1), parentId: parent?.id ?? null };
}
