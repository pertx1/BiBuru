"use server";

import { searchAll as search, type SearchHit } from "@/lib/notes/data";

/** Búsqueda global (notas, tareas, pedidos y gastos). Devuelve vacío ante errores: la paleta no debe romperse. */
export async function searchGlobal(q: string): Promise<SearchHit[]> {
  try {
    return await search(String(q ?? ""));
  } catch {
    return [];
  }
}
