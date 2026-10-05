import { describe, expect, it } from "vitest";
import { parseVideoAnalysis, pickCategory } from "./analysis";
import { decryptSecret, encryptSecret } from "./crypto";
import { classifyVideoUrl, firstUrl, formatDuration, parseIsoDuration } from "./url";

describe("classifyVideoUrl", () => {
  it.each([
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10s", "dQw4w9WgXcQ"],
    ["https://youtu.be/dQw4w9WgXcQ?si=abc", "dQw4w9WgXcQ"],
    ["https://m.youtube.com/shorts/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://music.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
  ])("YouTube %s", (u, id) => {
    expect(classifyVideoUrl(u)).toEqual({ source: "youtube", externalId: id, url: `https://www.youtube.com/watch?v=${id}` });
  });
  it("TikTok largo conserva la ruta y quita el seguimiento", () => {
    expect(classifyVideoUrl("https://www.tiktok.com/@akerra/video/7234567890123456789?is_from_webapp=1")).toEqual({ source: "tiktok", externalId: "7234567890123456789", url: "https://www.tiktok.com/@akerra/video/7234567890123456789", short: false });
  });
  it("TikTok corto se marca para resolver", () => {
    expect(classifyVideoUrl("https://vm.tiktok.com/ZMabc123/")).toMatchObject({ source: "tiktok", short: true });
  });
  it("otros y no http", () => {
    expect(classifyVideoUrl("https://example.com/x")?.source).toBe("other");
    expect(classifyVideoUrl("javascript:alert(1)")).toBeNull();
    expect(classifyVideoUrl("no es una url")).toBeNull();
    expect(classifyVideoUrl("https://www.youtube.com/watch?v=corto")?.source).toBe("other");
  });
  it("evita dominios que solo imitan el nombre", () => {
    expect(classifyVideoUrl("https://youtube.com.evil.io/watch?v=dQw4w9WgXcQ")?.source).toBe("other");
  });
});

describe("duración y texto", () => {
  it("ISO 8601", () => {
    expect(parseIsoDuration("PT1H2M3S")).toBe(3723);
    expect(parseIsoDuration("PT45S")).toBe(45);
    expect(parseIsoDuration("PT20M")).toBe(1200);
    expect(parseIsoDuration("P0D")).toBeNull();
    expect(parseIsoDuration("basura")).toBeNull();
  });
  it("formato", () => { expect(formatDuration(3723)).toBe("1:02:03"); expect(formatDuration(65)).toBe("1:05"); expect(formatDuration(null)).toBe(""); });
  it("primer enlace", () => { expect(firstUrl("mira esto https://youtu.be/abc, mola")).toBe("https://youtu.be/abc"); expect(firstUrl("nada")).toBeNull(); });
});

describe("cifrado", () => {
  const key = Buffer.alloc(32, 7).toString("base64");
  it("ida y vuelta, y cada cifrado es distinto", () => {
    const a = encryptSecret("1//refresh-token", key), b = encryptSecret("1//refresh-token", key);
    expect(a).not.toBe(b);
    expect(a).not.toContain("refresh");
    expect(decryptSecret(a, key)).toBe("1//refresh-token");
  });
  it("detecta manipulación y claves incorrectas", () => {
    const t = encryptSecret("secreto", key);
    const parts = t.split(".");
    parts[3] = Buffer.from("otro").toString("base64url");
    expect(() => decryptSecret(parts.join("."), key)).toThrow();
    expect(() => decryptSecret(t, Buffer.alloc(32, 9).toString("base64"))).toThrow();
    expect(() => encryptSecret("x", "corta")).toThrow();
  });
});

describe("análisis", () => {
  it("valida y normaliza la salida del modelo", () => {
    const a = parseVideoAnalysis('```json\n{"summary":"Resumen","key_points":["a"],"category":"Marketing","tags":["x"],"actions":[],"business":"","business_reason":null,"utility":9}\n```');
    expect(a).toMatchObject({ category: "Marketing", business: null, utility: 3 });
    expect(parseVideoAnalysis("no json")).toBeNull();
    expect(parseVideoAnalysis('{"summary":""}')).toBeNull();
  });
  it("reutiliza categorías existentes", () => {
    const ex = [{ id: "1", name: "Diseño gráfico" }];
    expect(pickCategory("diseno  grafico", ex)).toEqual({ id: "1", name: "Diseño gráfico" });
    expect(pickCategory("Ventas", ex)).toEqual({ id: null, name: "Ventas" });
    expect(pickCategory("marketing digital", ex)).toEqual({ id: null, name: "Marketing digital" });
  });
});
