import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { parseExportJson, parseExportTxt, parseTiktokExportFile, videoIdFromLink } from "./tiktok-export";

const A = "7234567890123456789", B = "7300000000000000001", C = "7311111111111111111";
const share = (id: string) => `https://www.tiktokv.com/share/video/${id}/`;

// Estructura del JSON de «Descargar tus datos» (con las dos variantes de nombres que usa TikTok).
const exportJson = {
  Profile: { "Profile Information": { ProfileMap: { userName: "yo" } } },
  Activity: {
    "Favorite Videos": { FavoriteVideoList: [{ Date: "2025-03-02 10:00:00", Link: share(A) }, { Date: "2025-05-01 09:00:00", Link: share(B) }] },
    "Like List": { ItemFavoriteList: [{ date: "2025-01-01 08:00:00", link: share(C) }, { date: "2025-01-02 08:00:00", link: share(A) }] },
    "Favorite Sounds": { FavoriteSoundList: [{ Date: "2025-01-01", Link: "https://www.tiktok.com/music/x-6800000000000000000" }] },
    "Video Browsing History": { VideoList: [{ Date: "2025-06-01", Link: share("7399999999999999999") }] },
  },
};

describe("importar de TikTok", () => {
  it("identificador en cualquier enlace de TikTok", () => {
    expect(videoIdFromLink(share(A))).toBe(A);
    expect(videoIdFromLink(`https://www.tiktok.com/@akerra/video/${A}?lang=es`)).toBe(A);
    expect(videoIdFromLink(`https://evil.com/video/${A}`)).toBeNull();
    expect(videoIdFromLink("https://www.tiktok.com/music/x-6800000000000000000")).toBeNull();
  });

  it("JSON: favoritos y «me gusta», sin sonidos ni historial, lo más reciente primero", () => {
    const r = parseExportJson(exportJson);
    expect(r.favorites).toEqual([{ id: B, date: "2025-05-01 09:00:00" }, { id: A, date: "2025-03-02 10:00:00" }]);
    expect(r.likes.map((x) => x.id)).toEqual([A, C]);
  });

  it("variante nueva («Your Activity», minúsculas)", () => {
    const r = parseExportJson({ "Your Activity": { "Favorite Videos": { FavoriteVideoList: [{ date: "2026-01-01 00:00:00", link: `https://www.tiktok.com/@a/video/${A}` }] } } });
    expect(r.favorites.map((x) => x.id)).toEqual([A]);
  });

  it("TXT: por nombre de archivo o por títulos de sección", () => {
    expect(parseExportTxt(`Date: 2025-03-02 10:00:00\nLink: ${share(A)}\n\nDate: 2025-04-02 10:00:00\nLink: ${share(B)}\n`, "Favorite Videos.txt").favorites.map((x) => x.id)).toEqual([B, A]);
    const mixed = parseExportTxt(`Favorite Videos\nDate: 2025-03-02 10:00:00\nLink: ${share(A)}\n\nVideo Browsing History\nDate: 2025-03-02\nLink: ${share(C)}\n\nLike List\nDate: 2025-01-01\nLink: ${share(B)}\n`, "user_data.txt");
    expect(mixed.favorites.map((x) => x.id)).toEqual([A]);
    expect(mixed.likes.map((x) => x.id)).toEqual([B]);
  });

  it("ZIP tal cual lo da TikTok (comprimido)", async () => {
    const zip = makeZip([{ name: "TikTok_Data/user_data_tiktok.json", data: Buffer.from(JSON.stringify(exportJson)) }, { name: "__MACOSX/._x.json", data: Buffer.from("x") }]);
    const r = await parseTiktokExportFile("TikTok_Data.zip", zip);
    expect(r.favorites.map((x) => x.id)).toEqual([B, A]);
    expect(r.likes).toHaveLength(2);
  });

  it("archivo que no es de TikTok: vacío, sin romper", async () => {
    expect(await parseTiktokExportFile("x.txt", new TextEncoder().encode("hola"))).toEqual({ favorites: [], likes: [] });
  });
});

/** ZIP mínimo (deflate) para la prueba. */
function makeZip(files: { name: string; data: Buffer }[]): Uint8Array {
  const locals: Buffer[] = [], centrals: Buffer[] = [];
  let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name), comp = deflateRawSync(f.data);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(8, 8);
    lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(f.data.length, 22); lh.writeUInt16LE(name.length, 26);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(8, 10);
    ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(f.data.length, 24); ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(offset, 42);
    locals.push(lh, name, comp); centrals.push(ch, name);
    offset += 30 + name.length + comp.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...locals, cd, end]));
}
