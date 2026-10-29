import "server-only";
import { runAi, type AiContext } from "@/lib/ai/run";
import { categoryPaths, resolveProposed, type CatRow } from "@/lib/categories/tree";

/**
 * Reordenar las categorías de vídeos ya analizados con el árbol actual («IA › Claude»), sin volver a analizarlos:
 * la IA (modelo rápido) ve título, canal y resumen de hasta 40 vídeos por llamada. Céntimos de coste.
 */
export const RECAT_BATCH = 40;
export type RecatVideo = { id: string; title: string; channel: string | null; summary: string | null; category_id: string | null };

export function recatPrompt(paths: string[]): string {
  return `Ordenas los vídeos guardados de una persona en sus categorías. Para cada vídeo elige UNA categoría según el TEMA PRINCIPAL del vídeo.
Reglas:
- Usa la ruta completa tal cual cuando sea una subcategoría (p. ej. «IA › Claude»). Elige la más concreta que encaje.
- Todo lo que trate de inteligencia artificial o de una herramienta de IA (ChatGPT, Claude, Gemini, automatizar con IA, agentes, prompts…) va en «IA» o su subcategoría, aunque se aplique a vender o a una tienda. «IA › Claude» si es de Claude o de Anthropic.
- «E-commerce», «Marketing», etc. solo si el tema principal es ese y no la IA.
- Las ideas de negocio por explorar van en «Posibles negocios» si existe.
- Reutiliza las existentes. Solo propón una nueva si ninguna encaja, y si puede, dentro de una existente («IA › Gemini»).
Categorías existentes: ${paths.length ? paths.join(" | ") : "(ninguna)"}.
Responde solo con el JSON pedido, una entrada por vídeo con su id.`;
}

export const recatSchema = {
  type: "object", required: ["items"],
  properties: { items: { type: "array", items: { type: "object", required: ["id", "category"], properties: { id: { type: "string" }, category: { type: "string" } } } } },
};

export function parseRecat(text: string, ids: Set<string>): { id: string; category: string }[] {
  try {
    const j = JSON.parse(text.trim().replace(/^```(?:json)?\s*|\s*```$/g, "")) as { items?: { id?: unknown; category?: unknown }[] };
    return (j.items ?? []).filter((x): x is { id: string; category: string } => typeof x.id === "string" && ids.has(x.id) && typeof x.category === "string" && !!x.category.trim())
      .map((x) => ({ id: x.id, category: x.category.trim().slice(0, 130) }));
  } catch { return []; }
}

/** Reordena una tanda de un espacio. Devuelve cuántos cambiaron de categoría. Marca todos como reordenados (aunque no cambien). */
export async function recategorizeBatch(ctx: AiContext, videos: RecatVideo[]): Promise<{ changed: number; done: number }> {
  const { supabase, workspaceId } = ctx;
  if (!videos.length) return { changed: 0, done: 0 };
  const { data } = await supabase.from("video_categories").select("id, name, parent_id, pinned").eq("workspace_id", workspaceId);
  let cats: CatRow[] = data ?? [];
  const lines = videos.map((v) => `${v.id} | ${v.title.slice(0, 150)}${v.channel ? ` · ${v.channel.slice(0, 60)}` : ""} | ${(v.summary ?? "").replace(/\s+/g, " ").slice(0, 350)}`);
  const res = await runAi(ctx, "recategorize", {
    model: ctx.models.fast, system: recatPrompt(categoryPaths(cats)), temperature: 0.1, maxOutputTokens: 8192, thinking: "low",
    contents: [{ role: "user", parts: [{ text: `Vídeos (id | título · canal | resumen):\n${lines.join("\n")}` }] }], jsonSchema: recatSchema,
  });
  const picks = parseRecat(res.text, new Set(videos.map((v) => v.id)));
  let changed = 0;
  for (const p of picks) {
    let r = resolveProposed(p.category, cats);
    if (!r.id) {
      const ins = await supabase.from("video_categories").insert({ workspace_id: workspaceId, user_id: ctx.userId, name: r.name, parent_id: r.parentId }).select("id, name, parent_id, pinned").single();
      if (ins.data) { cats = [...cats, ins.data]; r = { ...r, id: ins.data.id }; }
      else {
        // Ya existía (carrera o mayúsculas): se reutiliza.
        cats = (await supabase.from("video_categories").select("id, name, parent_id, pinned").eq("workspace_id", workspaceId)).data ?? cats;
        r = resolveProposed(p.category, cats);
      }
    }
    const v = videos.find((x) => x.id === p.id)!;
    if (r.id && r.id !== v.category_id) {
      await supabase.from("saved_videos").update({ category_id: r.id }).eq("id", v.id).eq("workspace_id", workspaceId).eq("category_manual", false);
      changed++;
    }
  }
  await supabase.from("saved_videos").update({ recategorized_at: new Date().toISOString() }).eq("workspace_id", workspaceId).in("id", videos.map((v) => v.id));
  return { changed, done: videos.length };
}
