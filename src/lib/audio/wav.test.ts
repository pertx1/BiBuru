import { describe, expect, it } from "vitest";
import { encodeWav, pickRecorderMime } from "./wav";

describe("audio", () => {
  it("cabecera WAV correcta (mono, 16 kHz, 16 bit)", () => {
    const wav = encodeWav(new Float32Array([0, 0.5, -0.5, 1, -1]), 16000);
    const v = new DataView(wav);
    const tag = (o: number) => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
    expect([tag(0), tag(8), tag(12), tag(36)]).toEqual(["RIFF", "WAVE", "fmt ", "data"]);
    expect(v.getUint32(4, true)).toBe(36 + 10);
    expect([v.getUint16(20, true), v.getUint16(22, true), v.getUint32(24, true), v.getUint16(34, true)]).toEqual([1, 1, 16000, 16]);
    expect(v.getUint32(40, true)).toBe(10);
    expect(wav.byteLength).toBe(54);
  });
  it("convierte y recorta muestras", () => {
    const v = new DataView(encodeWav(new Float32Array([0, 1, -1, 2, -2]), 8000));
    expect([0, 1, 2, 3, 4].map((i) => v.getInt16(44 + i * 2, true))).toEqual([0, 32767, -32768, 32767, -32768]);
  });
  it("elige el formato de grabación según el navegador", () => {
    expect(pickRecorderMime((m) => m === "audio/mp4")).toBe("audio/mp4");                // Safari iOS
    expect(pickRecorderMime((m) => m.startsWith("audio/webm"))).toBe("audio/webm;codecs=opus"); // Chrome
    expect(pickRecorderMime(() => false)).toBeUndefined();
  });
});
