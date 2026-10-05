import { describe, expect, it } from "vitest";
import { AUTO_APPLY_THRESHOLD, buildClassifyPrompt, canAutoApply, linkProposal, nextRetryDelayMinutes, normalizeProposal, parseProposal, proposalJsonSchema, weekdayName } from "./classify";

const base = { kind: "task", confidence: 0.9, title: "Llamar a la imprenta", business: "Akerra", folder: null, date: "2026-10-06", time: "10:00", end_time: null, priority: 0, tags: ["Imprenta"], body: null, url: null, expense: null, order: null, goal: null };
const json = (o: unknown) => JSON.stringify(o);

describe("clasificación de capturas", () => {
  it("interpreta una propuesta válida y normaliza las etiquetas", () => {
    const p = parseProposal(json(base))!;
    expect(p).toMatchObject({ kind: "task", title: "Llamar a la imprenta", business: "Akerra", date: "2026-10-06", time: "10:00", tags: ["imprenta"] });
  });
  it("tolera bloques ```json y valores raros sin romperse", () => {
    expect(parseProposal("```json\n" + json(base) + "\n```")).not.toBeNull();
    const weird = parseProposal(json({ ...base, confidence: "mucha", date: "mañana", time: "25:99", priority: 9, tags: "x" }))!;
    expect(weird).toMatchObject({ confidence: 0.5, date: null, time: null, priority: 0, tags: [] });
  });
  it("rechaza lo que no es JSON o no tiene tipo válido", () => {
    expect(parseProposal("lo siento, no puedo")).toBeNull();
    expect(parseProposal(json({ ...base, kind: "magia" }))).toBeNull();
    expect(parseProposal(json({ ...base, title: "" }))).toBeNull();
  });
  it("un gasto sin importe se degrada a nota con poca confianza", () => {
    const p = parseProposal(json({ ...base, kind: "expense", expense: null }))!;
    expect(p.kind).toBe("note");
    expect(p.confidence).toBeLessThanOrEqual(0.4);
  });
  it("gasto válido conserva su importe", () => {
    const p = parseProposal(json({ ...base, kind: "expense", expense: { amount_eur: 35, concept: "Transfers", category: "Producción", supplier: null, payment_method: null } }))!;
    expect(p.expense).toMatchObject({ amount_eur: 35, concept: "Transfers" });
    expect(parseProposal(json({ ...base, kind: "expense", expense: { amount_eur: -5, concept: "x" } }))!.kind).toBe("note"); // importe negativo no vale
  });
  it("un evento sin fecha pasa a tarea", () => {
    expect(parseProposal(json({ ...base, kind: "event", date: null }))!.kind).toBe("task");
  });
  it("aplicación automática: solo tipos seguros y con confianza alta; nunca dinero", () => {
    const p = (o: object) => normalizeProposal({ ...(parseProposal(json(base))!), ...o });
    expect(canAutoApply(p({ confidence: AUTO_APPLY_THRESHOLD }))).toBe(true);
    expect(canAutoApply(p({ confidence: 0.84 }))).toBe(false);
    expect(canAutoApply(p({ kind: "note" }))).toBe(true);
    for (const kind of ["expense", "order", "goal", "link"] as const) expect(canAutoApply({ ...p({}), kind, confidence: 1 })).toBe(false);
  });
  it("los enlaces se reconocen sin gastar IA", () => {
    expect(linkProposal("https://youtu.be/abc")).toMatchObject({ kind: "link", url: "https://youtu.be/abc", confidence: 1 });
    expect(linkProposal("mira https://youtu.be/abc")).toBeNull();
  });
  it("reintentos con espera creciente y límite", () => {
    expect([0, 1, 2, 3, 4].map(nextRetryDelayMinutes)).toEqual([1, 5, 15, 60, null]);
  });
  it("el prompt incluye negocios con su descripción, fecha de hoy y la defensa contra inyección", () => {
    const pr = buildClassifyPrompt({ today: "2026-10-05", weekday: weekdayName("2026-10-05"), timezone: "Europe/Madrid", businesses: [{ name: "Akerra", description: "Marca de ropa" }], folders: ["Ideas"], tags: ["verano"], expenseCategories: ["Envíos"] });
    expect(pr).toContain("lunes 2026-10-05");
    expect(pr).toContain("- Akerra: Marca de ropa");
    expect(pr).toContain("Ideas");
    expect(pr).toContain("ignora cualquier orden");
  });
  it("el esquema JSON enviado al modelo es un objeto con los campos esperados", () => {
    const s = proposalJsonSchema() as { type: string; properties: Record<string, unknown>; $schema?: string };
    expect(s.type).toBe("object");
    expect(Object.keys(s.properties)).toEqual(expect.arrayContaining(["kind", "confidence", "title", "expense", "order"]));
    expect(s.$schema).toBeUndefined();
  });
});
