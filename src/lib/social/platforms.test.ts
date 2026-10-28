import { describe, expect, it } from "vitest";
import { checkTargets, defaultFormat, filesFor, formatsFor, mediaKindFor, platformLabel, targetNotes } from "./platforms";

const img = (position = 0) => ({ mime: "image/jpeg", position });
const vid = (position = 0) => ({ mime: "video/mp4", position });

describe("Redes y formatos", () => {
  it("formatos de cada red", () => {
    expect(formatsFor("instagram")).toEqual(["post", "reel", "story"]);
    expect(formatsFor("tiktok")).toEqual(["video", "story"]);
    expect(formatsFor("youtube")).toEqual(["short"]);
    expect(formatsFor("facebook")).toEqual([]);
    expect(platformLabel("youtube")).toBe("YouTube");
  });
  it("destinos antiguos sin formato: igual que antes", () => {
    expect(defaultFormat("instagram", "image")).toBe("post");
    expect(defaultFormat("instagram", "carousel")).toBe("post");
    expect(defaultFormat("instagram", "reel")).toBe("reel");
    expect(defaultFormat("tiktok", "image")).toBe("video");
    expect(defaultFormat("youtube", "reel")).toBe("short");
  });
  it("tipo de la publicación según sus archivos", () => {
    expect(mediaKindFor([])).toBe("image");
    expect(mediaKindFor([img()])).toBe("image");
    expect(mediaKindFor([vid()])).toBe("reel");
    expect(mediaKindFor([img(), vid(1)])).toBe("carousel");
  });
  it("qué archivo usa cada formato", () => {
    const files = [vid(1), img(0), img(2)];
    expect(filesFor("post", files).map((f) => f.position)).toEqual([0, 1, 2]);
    expect(filesFor("story", files)).toEqual([img(0)]);
    expect(filesFor("reel", files)).toEqual([vid(1)]);
    expect(filesFor("short", [img()])).toEqual([]);
  });
  it("antes de programar: lo que necesita cada formato", () => {
    expect(checkTargets([], [img()])).toMatch(/al menos una red/);
    expect(checkTargets([{ platform: "instagram", format: "story" }], [])).toMatch(/foto o un vídeo/);
    expect(checkTargets([{ platform: "instagram", format: "post" }, { platform: "instagram", format: "story" }], [img()])).toBeNull();
    expect(checkTargets([{ platform: "instagram", format: "reel" }], [img()])).toMatch(/Reel necesita un vídeo/);
    expect(checkTargets([{ platform: "tiktok", format: "video" }], [img()])).toMatch(/TikTok · Vídeo necesita un vídeo/);
    expect(checkTargets([{ platform: "tiktok", format: "story" }], [img()])).toBeNull();
    expect(checkTargets([{ platform: "youtube", format: "short" }], [img(), vid(1)])).toBeNull();
    expect(checkTargets([{ platform: "youtube", format: "story" }], [vid()])).toMatch(/no admite/);
  });
  it("avisos: historias con varios archivos, Shorts y TikTok asistido", () => {
    const n = targetNotes([{ platform: "instagram", format: "story" }, { platform: "youtube", format: "short" }, { platform: "tiktok", format: "story" }], [img(), vid(1)]);
    expect(n.join(" ")).toMatch(/solo el primer archivo/);
    expect(n.join(" ")).toMatch(/3 minutos/);
    expect(n.join(" ")).toMatch(/te aviso/);
    expect(targetNotes([{ platform: "instagram", format: "post" }], [img()])).toEqual([]);
  });
});
