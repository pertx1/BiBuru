import { buildTree, flatten, type CatRow } from "@/lib/categories/tree";

/** <option>s de categorías en orden de árbol, con sangría («IA», «   › Claude»). `exclude`: no ofrecer esas (p. ej. ella misma y sus hijas). */
export function CategoryOptions({ categories, exclude = [] }: { categories: CatRow[]; exclude?: string[] }) {
  return flatten(buildTree(categories)).filter((n) => !exclude.includes(n.id)).map((n) => (
    <option key={n.id} value={n.id}>{"   ".repeat(n.depth)}{n.depth ? "› " : ""}{n.name}</option>
  ));
}
