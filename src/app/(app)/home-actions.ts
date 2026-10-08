"use server";

import { revalidatePath } from "next/cache";
import { generateHomeNote } from "@/lib/ai/home";
import { getContext } from "@/lib/context";
import { z } from "zod";
import { BUSINESS_WIDGETS, layoutSchema, normalizeLayout, type WidgetInstance } from "@/lib/home/layout";
import { MAX_TABS, maxTabs, normalizeTabs, SECTION_BY_KEY, type SectionKey } from "@/lib/home/nav";
import type { Json } from "@/lib/supabase/database.types";
import type { ActionResult } from "@/lib/schemas";

type Patch = { home_widgets?: Json | null; mobile_tabs?: string[] | null; show_capture_button?: boolean; business_widgets?: { [key: string]: Json | undefined } };

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

/** Cambia (o quita, con null) la disposición del Resumen de UN negocio, sin tocar las de los demás. */
async function setBusinessLayout(businessId: string, layout: WidgetInstance[] | null): Promise<ActionResult> {
  if (!z.uuid().safeParse(businessId).success) return { ok: false, error: "Negocio no válido" };
  const { supabase, userId, workspaceId } = await getContext();
  const { data: biz } = await supabase.from("businesses").select("id").eq("id", businessId).eq("workspace_id", workspaceId).maybeSingle();
  if (!biz) return { ok: false, error: "Negocio no encontrado" };
  const { data } = await supabase.from("user_ui_prefs").select("business_widgets").eq("user_id", userId).eq("workspace_id", workspaceId).maybeSingle();
  const all = { ...((data?.business_widgets as Record<string, Json> | null) ?? {}) };
  if (layout) all[businessId] = layout as unknown as Json; else delete all[businessId];
  const r = await savePrefs({ business_widgets: all });
  if (r.ok) revalidatePath(`/negocios/${businessId}`);
  return r;
}

/** Disposición del Resumen de un negocio (solo widgets de negocio; se valida y normaliza). */
export async function saveBusinessLayout(businessId: string, layout: WidgetInstance[]): Promise<ActionResult> {
  const p = layoutSchema.safeParse(layout);
  if (!p.success) return { ok: false, error: "Disposición no válida" };
  return setBusinessLayout(businessId, normalizeLayout(p.data, { fallback: [], allowed: BUSINESS_WIDGETS }));
}

/** «Restablecer» el Resumen de un negocio: vuelve a la disposición por defecto. */
export async function resetBusinessLayout(businessId: string): Promise<ActionResult> {
  return setBusinessLayout(businessId, null);
}

/** Secciones de la barra inferior (en orden): máx. 5, o 4 si se muestra el botón +. «Más» es fijo. */
export async function saveMobileTabs(tabs: SectionKey[], showCapture = false): Promise<ActionResult> {
  const max = maxTabs(showCapture === true);
  if (!Array.isArray(tabs) || tabs.length < 1 || tabs.length > MAX_TABS || tabs.some((t) => !SECTION_BY_KEY.has(t)) || new Set(tabs).size !== tabs.length) {
    return { ok: false, error: `Elige entre 1 y ${max} secciones` };
  }
  // Con el botón + solo caben 4: si sobran, se quedan las primeras.
  const r = await savePrefs({ mobile_tabs: normalizeTabs(tabs, max), show_capture_button: showCapture === true });
  if (r.ok) revalidatePath("/", "layout");
  return r;
}

export async function resetMobileTabs(): Promise<ActionResult> {
  const r = await savePrefs({ mobile_tabs: null, show_capture_button: false });
  if (r.ok) revalidatePath("/", "layout");
  return r;
}

export type WidgetOptions = { goals: { id: string; name: string }[]; folders: { id: string; name: string }[]; categories: { id: string; name: string }[] };

/** Listas para los ajustes de los widgets (se piden solo al abrir los ajustes). */
export async function loadWidgetOptions(): Promise<WidgetOptions> {
  const { supabase, workspaceId } = await getContext();
  const [g, f, c] = await Promise.all([
    supabase.from("goals").select("id, title").eq("workspace_id", workspaceId).eq("status", "active").order("created_at").limit(100),
    supabase.from("folders").select("id, name").eq("workspace_id", workspaceId).order("name").limit(200),
    supabase.from("video_categories").select("id, name").eq("workspace_id", workspaceId).order("name").limit(200),
  ]);
  return {
    goals: (g.data ?? []).map((x) => ({ id: x.id, name: x.title })),
    folders: (f.data ?? []).map((x) => ({ id: x.id, name: x.name })),
    categories: (c.data ?? []).map((x) => ({ id: x.id, name: x.name })),
  };
}

/** Resumen del día o sugerencia de la IA para Inicio (cacheados; ver `src/lib/ai/home.ts`). */
export async function generateHomeAiNote(kind: "brief" | "suggestion"): Promise<{ ok: true; content: string } | { ok: false; error: string }> {
  if (kind !== "brief" && kind !== "suggestion") return { ok: false, error: "Tipo no válido" };
  return generateHomeNote(kind);
}
