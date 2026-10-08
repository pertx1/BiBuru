import "server-only";
import { cache } from "react";
import { getContext } from "@/lib/context";
import type { Json } from "@/lib/supabase/database.types";
import { normalizeLayout, SEED_WIDGETS, seedLayout, type WidgetInstance } from "./layout";
import { maxTabs, normalizeTabs, type SectionKey } from "./nav";

/** Preferencias de interfaz del usuario en su espacio (una consulta por petición). Si algo falla, valores por defecto. */
export const getUiPrefs = cache(async (): Promise<{ layout: WidgetInstance[]; tabs: SectionKey[]; showCapture: boolean; customLayout: boolean; customTabs: boolean }> => {
  const { supabase, userId, workspaceId } = await getContext();
  const { data, error } = await supabase.from("user_ui_prefs").select("home_widgets, mobile_tabs, show_capture_button, seeded_widgets").eq("user_id", userId).eq("workspace_id", workspaceId).maybeSingle();
  if (error) console.error("[prefs]", error.message);
  let layout = normalizeLayout(data?.home_widgets ?? null);
  // Inicio personalizado: los widgets fijos nuevos («Sin fecha»…) se añaden una sola vez.
  if (data?.home_widgets != null && SEED_WIDGETS.some((s) => !(data.seeded_widgets ?? []).includes(s.type))) {
    const seeded = seedLayout(layout, data.seeded_widgets ?? [], (t) => `seed-${t}`.slice(0, 40));
    if (seeded.changed) {
      layout = seeded.layout;
      const { error: e } = await supabase.from("user_ui_prefs").update({ home_widgets: layout as unknown as Json, seeded_widgets: seeded.seeded }).eq("user_id", userId).eq("workspace_id", workspaceId);
      if (e) console.error("[prefs] seed", e.message);
    }
  }
  return {
    layout,
    tabs: normalizeTabs(data?.mobile_tabs ?? null, maxTabs(data?.show_capture_button ?? false)),
    showCapture: data?.show_capture_button ?? false,
    customLayout: data?.home_widgets != null,
    customTabs: data?.mobile_tabs != null,
  };
});
