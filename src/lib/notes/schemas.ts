import { z } from "zod";

export const captureSchema = z.object({
  clientId: z.uuid(),
  text: z.string().trim().min(1).max(10000),
  capturedAt: z.string().refine((s) => !Number.isNaN(Date.parse(s)), "Fecha no válida"),
  source: z.enum(["text", "voice"]).default("text"),
});

const emptyToUndef = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

export const noteSchema = z.object({
  id: z.uuid().optional(),
  title: z.string().trim().max(200).default(""),
  body: z.string().max(200000).default(""),
  pinned: z.boolean().default(false),
  folder_id: z.preprocess(emptyToUndef, z.uuid().nullish()),
  business_id: z.preprocess(emptyToUndef, z.uuid().nullish()),
});
export type NoteInput = z.input<typeof noteSchema>;

export const folderSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(1, "Pon un nombre").max(80),
  parent_id: z.preprocess(emptyToUndef, z.uuid().nullish()),
});

export const TAG_COLORS = ["#64748b", "#0f766e", "#2563eb", "#7c3aed", "#db2777", "#dc2626", "#ea580c", "#ca8a04", "#16a34a"];
export const tagNameSchema = z.string().trim().min(1, "Escribe la etiqueta").max(40).transform((s) => s.replace(/^#/, "").trim()).pipe(z.string().min(1).max(40));

/** ¿El texto capturado es solo un enlace? (para enviarlo a Favoritos en la Fase 7) */
export function extractUrl(text: string): string | null {
  const m = /^\s*(https?:\/\/[^\s]+)\s*$/i.exec(text);
  return m ? m[1] : null;
}
