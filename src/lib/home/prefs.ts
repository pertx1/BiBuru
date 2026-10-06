import "server-only";
import { cache } from "react";
import { getContext } from "@/lib/context";
import { normalizeLayout, type WidgetInstance } from "./layout";
import { normalizeTabs, type SectionKey } from "./nav";

/** Preferencias de interfaz del usuario en su espacio (una consulta por petición). Si algo falla, valores por defecto. */
export const getUiPrefs = cache(async (): Promise<{ layout: WidgetInstance[]; tabs: SectionKey[]; customLayout: boolean; customTabs: boolean }> => {
  const { supabase, userId, workspaceId } = await getContext();
  const { data, error } = await supabase.from("user_ui_prefs").select("home_widgets, mobile_tabs").eq("user_id", userId).eq("workspace_id", workspaceId).maybeSingle();
  if (error) console.error("[prefs]", error.message);
  return {
    layout: normalizeLayout(data?.home_widgets ?? null),
    tabs: normalizeTabs(data?.mobile_tabs ?? null),
    customLayout: data?.home_widgets != null,
    customTabs: data?.mobile_tabs != null,
  };
});
