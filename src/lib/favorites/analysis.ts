import { z } from "zod";

const str = (max: number) => z.string().trim().max(max);

/** Lo que Gemini devuelve al analizar un vídeo. La salida del modelo se valida SIEMPRE. */
export const videoAnalysisSchema = z.object({
  summary: str(1500).min(1),
  key_points: z.array(str(300).min(1)).max(8).catch([]),
  category: str(60).min(1),
  tags: z.array(str(40).min(1)).max(6).catch([]),
  actions: z.array(str(300).min(1)).max(6).catch([]),
  business: str(60).nullish().transform((v) => (v && v.trim() ? v.trim() : null)),
  business_reason: str(500).nullish().transform((v) => (v && v.trim() ? v.trim() : null)),
  utility: z.number().int().min(1).max(5).catch(3),
});
export type VideoAnalysis = z.infer<typeof videoAnalysisSchema>;

export function videoAnalysisJsonSchema(): unknown {
  const s = z.toJSONSchema(z.object({
    summary: z.string(), key_points: z.array(z.string()), category: z.string(), tags: z.array(z.string()),
    actions: z.array(z.string()), business: z.string().nullable(), business_reason: z.string().nullable(), utility: z.number().int(),
  })) as Record<string, unknown>;
  delete s.$schema;
  return s;
}

export function parseVideoAnalysis(text: string): VideoAnalysis | null {
  try {
    const r = videoAnalysisSchema.safeParse(JSON.parse(text.trim().replace(/^```(?:json)?\s*|\s*```$/g, "")));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

export type AnalysisCtx = { businesses: { name: string; description: string | null }[]; categories: string[]; textOnly: boolean; light: boolean; cover?: boolean };

export function buildVideoPrompt(c: AnalysisCtx): string {
  const biz = c.businesses.length ? c.businesses.map((b) => `- ${b.name}${b.description ? `: ${b.description}` : ""}`).join("\n") : "(sin negocios)";
  const cats = c.categories.length ? c.categories.join(", ") : "(ninguna todavía)";
  return `Eres el analista de vídeos guardados de BiBuru, el panel personal de un emprendedor en España. Resume el contenido para que la persona decida si le interesa y qué hacer con él. Responde solo con el JSON pedido, en español de España.

${c.textOnly ? (c.cover
    ? "Solo dispones de la descripción, los hashtags, el autor y la imagen de portada (no se ve el vídeo): usa la portada (texto que aparezca, producto, escena) y di claramente en el resumen que está basado en el texto y la portada; no inventes lo que no conste.\n"
    : "Solo dispones del título, el autor y la descripción (no se ve el vídeo): di claramente en el resumen que está basado solo en ese texto y no inventes contenido que no conste.\n") : ""}${c.light ? "Haz un análisis ligero: resumen de 2-3 frases, 3 puntos clave como máximo.\n" : "Resumen de 3 a 5 frases.\n"}
- key_points: puntos clave concretos (frases cortas).
- category: UNA categoría. Reutiliza una existente si encaja; solo crea una nueva si ninguna sirve. Existentes: ${cats}.
- tags: hasta 6 etiquetas cortas en minúsculas.
- actions: ideas accionables concretas para el trabajo de la persona (vacío si no hay).
- business: nombre EXACTO de uno de estos negocios si el vídeo le sirve, o null. Motivo breve en business_reason.
${biz}
- utility: utilidad práctica de 1 (entretenimiento) a 5 (aplícalo ya).`;
}

/** Categoría ya existente que coincide (sin mayúsculas ni tildes) con la propuesta; si no, la propuesta. */
export function pickCategory(proposed: string, existing: { id: string; name: string }[]): { id: string | null; name: string } {
  const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
  const q = norm(proposed);
  const hit = existing.find((c) => norm(c.name) === q);
  const name = proposed.trim().slice(0, 60);
  return hit ? { id: hit.id, name: hit.name } : { id: null, name: name.charAt(0).toUpperCase() + name.slice(1) };
}
