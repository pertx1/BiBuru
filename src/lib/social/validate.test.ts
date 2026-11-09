import { describe, expect, it } from "vitest";
import { igFriendlyError, ttFriendlyError } from "./errors";
import { captionFor } from "./stats";
import { checkCaption, checkMedia } from "./validate";

const MB = 1024 * 1024;

describe("comprobaciones antes de subir", () => {
  it("vídeo vertical correcto: ni errores ni avisos", () => {
    expect(checkMedia({ mime: "video/mp4", size: 20 * MB, durationSec: 30, width: 1080, height: 1920 })).toEqual({ errors: [], warnings: [] });
  });
  it("formato, tamaño y duración bloquean", () => {
    expect(checkMedia({ mime: "video/webm", size: MB }).errors[0]).toMatch(/Formato/);
    expect(checkMedia({ mime: "video/mp4", size: 60 * MB }).errors[0]).toMatch(/50 MB/);
    expect(checkMedia({ mime: "video/mp4", size: MB, durationSec: 2 }).errors[0]).toMatch(/3 s/);
    expect(checkMedia({ mime: "video/quicktime", size: MB, durationSec: 901 }).errors[0]).toMatch(/15 min/);
  });
  it("no vertical, baja resolución o largo para TikTok solo avisan", () => {
    const c = checkMedia({ mime: "video/mp4", size: MB, durationSec: 700, width: 1920, height: 1080 }, { tiktok: true });
    expect(c.errors).toEqual([]);
    expect(c.warnings.join(" ")).toMatch(/9:16.*1920×1080/);
    expect(c.warnings.join(" ")).toMatch(/10 min/);
    expect(checkMedia({ mime: "video/mp4", size: MB, width: 360, height: 640 }).warnings[0]).toMatch(/borroso/);
  });
  it("fotos: proporción de Instagram", () => {
    expect(checkMedia({ mime: "image/jpeg", size: MB, width: 1080, height: 1350 }).warnings).toEqual([]);
    expect(checkMedia({ mime: "image/jpeg", size: MB, width: 1080, height: 1920 }).warnings[0]).toMatch(/4:5/);
  });
  it("texto: largo, hashtags y menciones", () => {
    expect(checkCaption("hola #a #b").errors).toEqual([]);
    expect(checkCaption("x".repeat(2201)).errors[0]).toMatch(/2201/);
    expect(checkCaption(Array.from({ length: 31 }, (_, i) => `#t${i}`).join(" ")).errors[0]).toMatch(/31 hashtags/);
  });
});

describe("texto por red", () => {
  const post = { caption: "Común", hashtags: "moda", caption_instagram: "Solo IG", caption_tiktok: "  " };
  it("usa el de la red si existe; si está vacío, el común", () => {
    expect(captionFor(post, "instagram")).toBe("Solo IG\n\n#moda");
    expect(captionFor(post, "tiktok")).toBe("Común\n\n#moda");
  });
});

describe("errores en español", () => {
  it("Instagram", () => {
    expect(igFriendlyError({ code: 9004, subcode: 2207026 })).toMatch(/MP4 o MOV/);
    expect(igFriendlyError({ code: 190 })).toMatch(/caducado/);
    expect(igFriendlyError({ code: 4 })).toMatch(/limitando/);
    expect(igFriendlyError({ code: 100, message: "Something" })).toBe("Instagram: Something");
  });
  it("TikTok", () => {
    expect(ttFriendlyError({ code: "spam_risk_too_many_pending_share" })).toMatch(/borradores/);
    expect(ttFriendlyError({ status: 503 })).toMatch(/no responde/);
    expect(ttFriendlyError({ code: "weird", message: "Raro" })).toBe("TikTok: Raro");
  });
});
