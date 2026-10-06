import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/ai/gemini", () => ({ geminiProvider: () => null, getModelNames: () => ({ fast: "f", video: "v" }), hasGeminiKey: () => false }));
vi.mock("@/lib/ai/run", () => ({ AiBlockedError: class extends Error {}, runAi: vi.fn() }));
const { newsDue } = await import("./service");

describe("cuándo toca generar", () => {
  it("desde 20 minutos antes de la hora elegida; fines de semana opcionales; desactivado = nunca", () => {
    const p = { news_enabled: true, news_time: "08:00:00", news_weekends: true };
    expect(newsDue(p, { date: "2026-10-06", time: "07:39" })).toBe(false);
    expect(newsDue(p, { date: "2026-10-06", time: "07:40" })).toBe(true);
    expect(newsDue({ ...p, news_weekends: false }, { date: "2026-10-11", time: "09:00" })).toBe(false); // domingo
    expect(newsDue({ ...p, news_enabled: false }, { date: "2026-10-06", time: "09:00" })).toBe(false);
  });
});
