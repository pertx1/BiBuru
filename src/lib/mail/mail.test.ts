import { describe, expect, it, vi } from "vitest";
import { deltaPass, GRAPH, GraphError, initialDeltaUrl, msAttachments, msAuthUrl, refreshMsToken } from "./graph";
import { mailFrameDoc, mailHtmlToText, sanitizeMailHtml } from "./sanitize";
import { headerRow } from "./service";
import { planMailPushes } from "@/lib/notifications/planning";

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });

describe("OAuth de Microsoft", () => {
  it("punto común (personales y de empresa), solo lectura y refresh token", () => {
    const u = new URL(msAuthUrl({ clientId: "abc", redirectUri: "https://bi-buru.vercel.app/api/outlook/callback", state: "s" }));
    expect(u.origin + u.pathname).toBe("https://login.microsoftonline.com/common/oauth2/v2.0/authorize");
    expect(u.searchParams.get("scope")).toBe("offline_access User.Read Mail.Read");
    expect(u.searchParams.get("state")).toBe("s");
  });
  it("token retirado → error de reconexión", async () => {
    vi.stubEnv("MICROSOFT_CLIENT_ID", "id"); vi.stubEnv("MICROSOFT_CLIENT_SECRET", "secret");
    const f = (async () => json({ error: "invalid_grant", error_description: "expired" }, 400)) as unknown as typeof fetch;
    await expect(refreshMsToken("r", f)).rejects.toMatchObject({ revoked: true });
    const ok = (async () => json({ access_token: "a", refresh_token: "r2", scope: "Mail.Read" })) as unknown as typeof fetch;
    expect(await refreshMsToken("r", ok)).toEqual({ accessToken: "a", refreshToken: "r2", scope: "Mail.Read" });
    vi.unstubAllEnvs();
  });
});

describe("sincronización incremental (delta)", () => {
  it("primera vez: últimos 30 días y solo cabeceras", () => {
    const u = initialDeltaUrl(new Date("2026-10-07T10:00:00Z"));
    expect(u).toContain("/me/mailFolders/inbox/messages/delta");
    expect(decodeURIComponent(u)).toContain("receivedDateTime ge 2026-09-07T10:00:00Z");
    expect(u).toContain("$select=subject,from,receivedDateTime,bodyPreview,isRead,hasAttachments,webLink");
    expect(u).not.toContain("body,");
  });
  it("sigue las páginas, separa borrados y devuelve el deltaLink", async () => {
    const pages: Record<string, unknown> = {
      [`${GRAPH}/start`]: { value: [{ id: "1", subject: "Hola" }], "@odata.nextLink": `${GRAPH}/p2` },
      [`${GRAPH}/p2`]: { value: [{ id: "2", "@removed": { reason: "deleted" } }, { id: "3" }], "@odata.deltaLink": `${GRAPH}/delta?token=x` },
    };
    const f = vi.fn(async (u: string) => json(pages[u])) as unknown as typeof fetch;
    const r = await deltaPass("t", `${GRAPH}/start`, f);
    expect(r.changed.map((m) => m.id)).toEqual(["1", "3"]);
    expect(r.removed).toEqual(["2"]);
    expect(r.next).toBe(`${GRAPH}/delta?token=x`);
  });
  it("si quedan páginas, guarda el nextLink para seguir en la próxima pasada", async () => {
    const f = (async () => json({ value: [], "@odata.nextLink": `${GRAPH}/more` })) as unknown as typeof fetch;
    expect((await deltaPass("t", `${GRAPH}/start`, f, 2)).next).toBe(`${GRAPH}/more`);
  });
  it("nunca llama fuera de Graph y avisa de enlaces caducados", async () => {
    await expect(deltaPass("t", "https://evil.es/x", vi.fn() as never)).rejects.toBeInstanceOf(GraphError);
    await expect(deltaPass("t", `${GRAPH}/x`, (async () => json({}, 410)) as never)).rejects.toMatchObject({ status: 410 });
  });
  it("cabecera guardada: sin cuerpo, recortada y con enlace https", () => {
    const row = headerRow({ id: "a", user_id: "u", workspace_id: "w" }, { id: "g", subject: "Pedido", bodyPreview: "  Hola\n\n Ana ", from: { emailAddress: { name: "Ana", address: "ANA@X.ES" } }, receivedDateTime: "2026-10-07T08:00:00Z", isRead: false, webLink: "javascript:alert(1)" });
    expect(row).toMatchObject({ from_address: "ana@x.es", preview: "Hola Ana", web_link: null, is_read: false });
    expect(row).not.toHaveProperty("body");
  });
  it("adjuntos: solo archivos", async () => {
    const f = (async () => json({ value: [{ id: "a", name: "f.pdf", contentType: "application/pdf", size: 10, isInline: false, "@odata.type": "#microsoft.graph.fileAttachment" }, { id: "b", name: "x", contentType: "", size: 1, isInline: false, "@odata.type": "#microsoft.graph.itemAttachment" }] })) as unknown as typeof fetch;
    expect((await msAttachments("t", "m", f)).map((a) => a.id)).toEqual(["a"]);
  });
});

describe("HTML del correo", () => {
  it("quita scripts, formularios, iframes, manejadores y javascript:", () => {
    const dirty = `<p onclick="x()">Hola</p><script>alert(1)</script><iframe src="https://x"></iframe><form action="https://x"><input name=a></form><a href="javascript:alert(1)">a</a><img src=x onerror=alert(1)><style>@import url(https://x)</style>`;
    const clean = sanitizeMailHtml(dirty);
    expect(clean).not.toMatch(/script|iframe|<form|<input|onclick|onerror|javascript:|@import/i);
    expect(clean).toContain("<p>Hola</p>");
  });
  it("enlaces fuera y CSP que bloquea imágenes remotas hasta pedirlas", () => {
    expect(sanitizeMailHtml('<a href="https://x.es">x</a>')).toContain('target="_blank" rel="noopener noreferrer"');
    expect(mailFrameDoc("<p>x</p>", { images: false, dark: false })).toContain("img-src data: cid:;");
    expect(mailFrameDoc("<p>x</p>", { images: true, dark: false })).toContain("img-src data: cid: https:;");
    expect(mailFrameDoc("x", { images: false, dark: false })).toContain("default-src 'none'");
  });
  it("texto plano para notas", () => {
    expect(mailHtmlToText("<p>Hola&nbsp;Ana</p><ul><li>Uno</li><li>Dos</li></ul><br>Fin")).toBe("Hola Ana\n- Uno\n- Dos\n\nFin");
  });
});

describe("aviso de correo nuevo", () => {
  it("uno por correo; con más de 3, uno agrupado", () => {
    expect(planMailPushes([{ id: "1", from: "Ana", subject: "Pedido", account: "a@x.es" }])).toEqual([{ key: "mail:1", kind: "mail", refId: "1", title: "Ana", body: "Pedido", url: "/correo?abrir=1" }]);
    const many = planMailPushes(["1", "2", "3", "4"].map((id) => ({ id, from: `P${id}`, subject: null, account: "a" })));
    expect(many).toHaveLength(1);
    expect(many[0]).toMatchObject({ title: "4 correos nuevos", url: "/correo?filtro=no-leidos" });
  });
});
