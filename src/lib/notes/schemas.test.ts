import { describe, expect, it } from "vitest";
import { captureSchema, extractUrl, noteSchema, tagNameSchema } from "./schemas";

const uuid = "123e4567-e89b-42d3-a456-426614174000";

describe("validación de capturas y notas", () => {
  it("captura válida y límites", () => {
    expect(captureSchema.safeParse({ clientId: uuid, text: "  idea  ", capturedAt: "2026-10-05T10:00:00Z" }).data).toMatchObject({ text: "idea", source: "text" });
    expect(captureSchema.safeParse({ clientId: "x", text: "a", capturedAt: "2026-10-05T10:00:00Z" }).success).toBe(false);
    expect(captureSchema.safeParse({ clientId: uuid, text: "   ", capturedAt: "2026-10-05T10:00:00Z" }).success).toBe(false);
    expect(captureSchema.safeParse({ clientId: uuid, text: "a".repeat(10001), capturedAt: "2026-10-05T10:00:00Z" }).success).toBe(false);
    expect(captureSchema.safeParse({ clientId: uuid, text: "a", capturedAt: "ayer" }).success).toBe(false);
  });
  it("nota: vacíos a null/undefined y valores por defecto", () => {
    const n = noteSchema.parse({ folder_id: "", business_id: "" });
    expect(n).toMatchObject({ title: "", body: "", pinned: false });
    expect(n.folder_id ?? null).toBeNull();
    expect(noteSchema.safeParse({ folder_id: "no-uuid" }).success).toBe(false);
  });
  it("etiquetas: quita #, espacios y rechaza vacías", () => {
    expect(tagNameSchema.parse("  #Idea ")).toBe("Idea");
    expect(tagNameSchema.safeParse("#").success).toBe(false);
    expect(tagNameSchema.safeParse("a".repeat(41)).success).toBe(false);
  });
  it("detecta enlaces solos", () => {
    expect(extractUrl(" https://youtu.be/abc123 ")).toBe("https://youtu.be/abc123");
    expect(extractUrl("mira esto https://youtu.be/abc123")).toBeNull();
    expect(extractUrl("javascript:alert(1)")).toBeNull();
  });
});
