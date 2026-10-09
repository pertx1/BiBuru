import { describe, expect, it } from "vitest";
import { thinkingConfigFor, videoFps } from "./thinking";

describe("velocidad del análisis", () => {
  it("pensamiento mínimo según la familia del modelo", () => {
    expect(thinkingConfigFor("gemini-3.8-flash")).toEqual({ thinkingLevel: "LOW" });
    expect(thinkingConfigFor("gemini-3.5-flash-lite")).toEqual({ thinkingLevel: "LOW" });
    expect(thinkingConfigFor("gemini-2.5-flash")).toEqual({ thinkingBudget: 0 });
    expect(thinkingConfigFor("gemini-2.5-pro")).toEqual({ thinkingBudget: 128 });
    expect(thinkingConfigFor("gemini-2.0-flash")).toBeUndefined();
  });

  it("menos fotogramas en vídeos largos", () => {
    expect(videoFps(null)).toBeUndefined();
    expect(videoFps(120)).toBeUndefined();
    expect(videoFps(600)).toBe(0.5);
    expect(videoFps(3600)).toBe(0.25);
  });
});
