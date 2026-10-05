import { describe, expect, it } from "vitest";
import { fakeProvider } from "./fake";
import { AiError } from "./provider";
import { AiBlockedError, runAi, type AiContext } from "./run";

/** Cliente Supabase mínimo en memoria: solo lo que usa runAi. */
function fakeDb(opts: { spentMicros?: number; recent?: number; price?: { in: number; out: number } } = {}) {
  const usage: Record<string, unknown>[] = [];
  const rpc = async (name: string) => {
    if (name === "ai_spend") return { data: opts.spentMicros ? [{ feature: "chat", calls: 1, input_tokens: 1, output_tokens: 1, cost_micros: opts.spentMicros }] : [], error: null };
    if (name === "ai_recent_calls") return { data: opts.recent ?? 0, error: null };
    return { data: null, error: { message: "rpc?" } };
  };
  const from = (table: string) => ({
    insert: (row: Record<string, unknown>) => ({ select: () => ({ single: async () => { usage.push({ ...row }); return { data: { id: String(usage.length - 1) }, error: null }; } }) }),
    update: (patch: Record<string, unknown>) => ({ eq: async (_c: string, id: string) => { Object.assign(usage[Number(id)], patch); return { error: null }; } }),
    select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: table === "ai_prices" && opts.price ? { input_eur_per_mtok: opts.price.in, output_eur_per_mtok: opts.price.out } : null, error: null }) }) }) }),
  });
  return { db: { rpc, from } as unknown as AiContext["supabase"], usage };
}

const base = { workspaceId: "w", userId: "u", timezone: "Europe/Madrid", models: { fast: "f", video: "v" }, sleep: async () => {} };
const req = { model: "f", contents: [{ role: "user" as const, parts: [{ text: "hola" }] }] };

describe("runAi", () => {
  it("registra el consumo y calcula el coste con el precio configurado", async () => {
    const { db, usage } = fakeDb({ price: { in: 1, out: 2 } });
    const provider = fakeProvider(() => ({ text: "ok", usage: { inputTokens: 1_000_000, outputTokens: 500_000 } }));
    const r = await runAi({ ...base, supabase: db, budgetCents: 1000, provider }, "chat", req);
    expect(r.costMicros).toBe(2_000_000); // 1 € + 0,5M·2 €
    expect(usage[0]).toMatchObject({ ok: true, input_tokens: 1_000_000, cost_micros: 2_000_000 });
  });

  it("bloquea al 100 % del presupuesto sin llamar al modelo", async () => {
    const { db } = fakeDb({ spentMicros: 10_000_000 });
    const provider = fakeProvider(() => ({ text: "x" }));
    await expect(runAi({ ...base, supabase: db, budgetCents: 1000, provider }, "chat", req)).rejects.toMatchObject({ reason: "blocked" });
    expect(provider.requests).toHaveLength(0);
  });

  it("rechaza una operación cuyo coste estimado supera lo que queda", async () => {
    const { db } = fakeDb({ spentMicros: 9_500_000 });
    const provider = fakeProvider(() => ({ text: "x" }));
    await expect(runAi({ ...base, supabase: db, budgetCents: 1000, provider }, "video", req, { estimatedMicros: 2_000_000 })).rejects.toMatchObject({ reason: "would_exceed" });
    expect(provider.requests).toHaveLength(0);
  });

  it("avisa una vez al cruzar el 80 %", async () => {
    const { db } = fakeDb({ spentMicros: 7_900_000, price: { in: 10, out: 10 } });
    const levels: string[] = [];
    const provider = fakeProvider(() => ({ text: "x", usage: { inputTokens: 100_000, outputTokens: 0 } })); // +1 €
    await runAi({ ...base, supabase: db, budgetCents: 1000, provider, onWarn: async (s) => { levels.push(s.level); } }, "chat", req);
    expect(levels).toEqual(["warn"]);
  });

  it("aplica el límite de peticiones por minuto", async () => {
    const { db } = fakeDb({ recent: 10 });
    const provider = fakeProvider(() => ({ text: "x" }));
    const p = runAi({ ...base, supabase: db, budgetCents: 1000, provider, maxPerMinute: 10 }, "chat", req);
    await expect(p).rejects.toBeInstanceOf(AiBlockedError);
    await expect(p).rejects.toMatchObject({ reason: "busy" });
  });

  it("reintenta con espera ante 429/503 y acaba funcionando", async () => {
    const { db, usage } = fakeDb();
    const waits: number[] = [];
    const provider = fakeProvider((_r, n) => (n < 3 ? new AiError("sobrecargado", 503, true) : { text: "ya" }));
    const r = await runAi({ ...base, supabase: db, budgetCents: 1000, provider, sleep: async (ms) => { waits.push(ms); } }, "chat", req);
    expect(r.text).toBe("ya");
    expect(provider.requests).toHaveLength(3);
    expect(waits).toHaveLength(2);
    expect(waits[1]).toBeGreaterThan(waits[0]);
    expect(usage[0]).toMatchObject({ ok: true });
  });

  it("no reintenta errores definitivos y deja constancia", async () => {
    const { db, usage } = fakeDb();
    const provider = fakeProvider(() => new AiError("clave no válida", 403, false));
    await expect(runAi({ ...base, supabase: db, budgetCents: 1000, provider }, "chat", req)).rejects.toThrow("clave no válida");
    expect(provider.requests).toHaveLength(1);
    expect(usage[0]).toMatchObject({ ok: false, error: "clave no válida" });
  });
});
