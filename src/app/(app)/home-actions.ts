"use server";

import { revalidatePath } from "next/cache";
import { getContext } from "@/lib/context";
import { layoutSchema, normalizeLayout, type WidgetInstance } from "@/lib/home/layout";
import { MAX_TABS, normalizeTabs, SECTION_BY_KEY, type SectionKey } from "@/lib/home/nav";
import type { Json } from "@/lib/supabase/database.types";
import type { ActionResult } from "@/lib/schemas";

type Patch = { home_widgets?: Json | null; mobile_tabs?: string[] | null };

/** Guarda (upsert) las preferencias propias en el espacio actual. RLS: solo las del propio usuario. */
async function savePrefs(patch: Patch): Promise<ActionResult> {
  const { supabase, userId, workspaceId } = await getContext();
  const { error } = await supabase.from("user_ui_prefs").upsert({ user_id: userId, workspace_id: workspaceId, ...patch }, { onConflict: "user_id,workspace_id" });
  if (error) { console.error("[prefs] guardar:", error.message); return { ok: false, error: "No se pudo guardar" }; }
  return { ok: true };
}

/** Disposición de Inicio. Se valida y normaliza antes de guardar (tipos conocidos, tamaños y ajustes válidos). */
export async function saveHomeLayout(layout: WidgetInstance[]): Promise<ActionResult> {
  const p = layoutSchema.safeParse(layout);
  if (!p.success) return { ok: false, error: "Disposición no válida" };
  const r = await savePrefs({ home_widgets: normalizeLayout(p.data) as unknown as Json });
  if (r.ok) revalidatePath("/");
  return r;
}

export async function resetHomeLayout(): Promise<ActionResult> {
  const r = await savePrefs({ home_widgets: null });
  if (r.ok) revalidatePath("/");
  return r;
}

/** Secciones de la barra inferior (máx. 4, en orden). «Más» y el botón de captura son fijos. */
export async function saveMobileTabs(tabs: SectionKey[]): Promise<ActionResult> {
  if (!Array.isArray(tabs) || tabs.length < 1 || tabs.length > MAX_TABS || tabs.some((t) => !SECTION_BY_KEY.has(t)) || new Set(tabs).size !== tabs.length) {
    return { ok: false, error: `Elige entre 1 y ${MAX_TABS} secciones` };
  }
  const r = await savePrefs({ mobile_tabs: normalizeTabs(tabs) });
  if (r.ok) revalidatePath("/", "layout");
  return r;
}

export async function resetMobileTabs(): Promise<ActionResult> {
  const r = await savePrefs({ mobile_tabs: null });
  if (r.ok) revalidatePath("/", "layout");
  return r;
}
