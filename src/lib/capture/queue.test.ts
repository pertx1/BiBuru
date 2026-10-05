import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { enqueue, flushQueue, listQueue, queueSize, type QueuedCapture } from "./queue";

const item = (n: number): Omit<QueuedCapture, "attempts"> => ({
  clientId: `00000000-0000-4000-8000-00000000000${n}`, text: `idea ${n}`, capturedAt: `2026-10-05T10:0${n}:00Z`, source: "text",
});

describe("cola de capturas sin conexión", () => {
  beforeEach(async () => {
    await flushQueue(async () => "drop"); // vacía
  });

  it("guarda al instante y conserva el orden de captura", async () => {
    await enqueue(item(3)); await enqueue(item(1)); await enqueue(item(2));
    expect((await listQueue()).map((i) => i.text)).toEqual(["idea 1", "idea 2", "idea 3"]);
    expect(await queueSize()).toBe(3);
  });

  it("sin red no se pierde nada y se reintenta después", async () => {
    await enqueue(item(1)); await enqueue(item(2));
    const r = await flushQueue(async () => "retry");
    expect(r).toEqual({ sent: 0, remaining: 2 });
    expect((await listQueue()).map((i) => i.attempts)).toEqual([1, 0]); // se detiene en el primer fallo
    const sentTexts: string[] = [];
    const r2 = await flushQueue(async (c) => { sentTexts.push(c.text); return "ok"; });
    expect(r2).toEqual({ sent: 2, remaining: 0 });
    expect(sentTexts).toEqual(["idea 1", "idea 2"]);
    expect(await queueSize()).toBe(0);
  });

  it("si la red cae a mitad, lo enviado se borra y lo demás queda", async () => {
    await enqueue(item(1)); await enqueue(item(2)); await enqueue(item(3));
    let n = 0;
    const r = await flushQueue(async () => (++n <= 1 ? "ok" : "retry"));
    expect(r).toEqual({ sent: 1, remaining: 2 });
    expect((await listQueue()).map((i) => i.text)).toEqual(["idea 2", "idea 3"]);
  });

  it("una excepción al enviar cuenta como fallo temporal", async () => {
    await enqueue(item(1));
    const r = await flushQueue(async () => { throw new Error("red"); });
    expect(r.remaining).toBe(1);
  });

  it("un elemento inválido se descarta sin bloquear al resto", async () => {
    await enqueue(item(1)); await enqueue(item(2));
    const r = await flushQueue(async (c) => (c.text === "idea 1" ? "drop" : "ok"));
    expect(r).toEqual({ sent: 1, remaining: 0 });
  });

  it("dos vaciados simultáneos no envían dos veces", async () => {
    await enqueue(item(1));
    let calls = 0;
    const send = async () => { calls++; await new Promise((r) => setTimeout(r, 10)); return "ok" as const; };
    await Promise.all([flushQueue(send), flushQueue(send)]);
    expect(calls).toBe(1);
  });

  it("encolar dos veces el mismo id no duplica", async () => {
    await enqueue(item(1)); await enqueue(item(1));
    expect(await queueSize()).toBe(1);
  });
});
