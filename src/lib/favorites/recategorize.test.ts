import { describe, expect, it } from "vitest";
import { parseRecat, recatPrompt } from "./recategorize";

describe("reordenar categorías de vídeos", () => {
  it("las instrucciones ponen lo de IA en IA aunque sea para vender", () => {
    const p = recatPrompt(["IA", "IA › Claude", "E-commerce", "Posibles negocios"]);
    expect(p).toContain("IA › Claude | E-commerce");
    expect(p).toMatch(/aunque se aplique a vender/);
    expect(p).toMatch(/«E-commerce», «Marketing», etc\. solo si el tema principal es ese/);
  });
  it("lee la respuesta y descarta ids que no se pidieron", () => {
    const ids = new Set(["a", "b"]);
    expect(parseRecat('```json\n{"items":[{"id":"a","category":"IA › Claude"},{"id":"zzz","category":"IA"},{"id":"b","category":"  "}]}\n```', ids)).toEqual([{ id: "a", category: "IA › Claude" }]);
    expect(parseRecat("no es json", ids)).toEqual([]);
  });
});
