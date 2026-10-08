import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { CAPABILITIES, nextStatus, parseInboxFilters, parseMetaWebhook, replyWindow, validMetaSignature } from "./logic";

describe("Bandeja: ventana de 24 h de Instagram", () => {
  const now = new Date("2026-10-07T12:00:00Z");
  it("abierta con tiempo restante, cerrada a las 24 h", () => {
    expect(replyWindow("2026-10-07T10:30:00Z", now)).toMatchObject({ open: true, label: "Quedan 22 h 30 min para responder" });
    expect(replyWindow("2026-10-06T12:30:00Z", now)).toMatchObject({ open: true, label: "Quedan 30 min para responder" });
    expect(replyWindow("2026-10-06T11:59:00Z", now).open).toBe(false);
    expect(replyWindow(null, now).open).toBe(false);
  });
});

describe("Bandeja: avisos de Meta", () => {
  it("firma HMAC-SHA256 con la clave secreta de la app", () => {
    const body = '{"object":"instagram"}';
    const sig = "sha256=" + createHmac("sha256", "secreto").update(body).digest("hex");
    expect(validMetaSignature(body, sig, "secreto")).toBe(true);
    expect(validMetaSignature(body + " ", sig, "secreto")).toBe(false);
    expect(validMetaSignature(body, sig, "otro")).toBe(false);
    expect(validMetaSignature(body, null, "secreto")).toBe(false);
  });

  it("mensajes recibidos, eco de los míos y borrados", () => {
    const ev = parseMetaWebhook({ object: "instagram", entry: [{ id: "IG1", messaging: [
      { sender: { id: "U9" }, recipient: { id: "IG1" }, timestamp: 1791374400000, message: { mid: "m1", text: "¿Tenéis talla M?", attachments: [{ type: "image", payload: { url: "https://cdn/x.jpg" } }] } },
      { sender: { id: "IG1" }, recipient: { id: "U9" }, timestamp: 1791374460000, message: { mid: "m2", text: "Sí", is_echo: true } },
      { sender: { id: "U9" }, recipient: { id: "IG1" }, message: { mid: "m1", is_deleted: true } },
    ] }] });
    expect(ev[0]).toMatchObject({ type: "message", accountExternalId: "IG1", participantId: "U9", mid: "m1", outbound: false, attachments: [{ type: "image", url: "https://cdn/x.jpg" }] });
    expect(ev[1]).toMatchObject({ type: "message", participantId: "U9", outbound: true });
    expect(ev[2]).toEqual({ type: "message_deleted", accountExternalId: "IG1", mid: "m1" });
  });

  it("comentarios (con respuesta a otro) y menciones; lo desconocido se ignora", () => {
    const ev = parseMetaWebhook({ object: "instagram", entry: [{ id: "IG1", changes: [
      { field: "comments", value: { id: "c2", parent_id: "c1", text: "¡Precioso!", from: { id: "U3", username: "ana" }, media: { id: "M1" } } },
      { field: "mentions", value: { comment_id: "c7", media_id: "M2" } },
      { field: "story_insights", value: {} },
    ] }] });
    expect(ev).toHaveLength(2);
    expect(ev[0]).toMatchObject({ type: "comment", commentId: "c2", parentId: "c1", mediaId: "M1", fromUsername: "ana" });
    expect(ev[1]).toMatchObject({ type: "mention", commentId: "c7", mediaId: "M2" });
    expect(parseMetaWebhook({ object: "whatsapp_business_account", entry: [] })).toEqual([]);
    expect(parseMetaWebhook(null)).toEqual([]);
  });
});

describe("Bandeja: filtros y estados", () => {
  it("por defecto «sin responder»; lo desconocido se ignora", () => {
    expect(parseInboxFilters({})).toEqual({ estado: "sin_responder" });
    expect(parseInboxFilters({ red: "facebook", tipo: "dm", estado: "todos", q: "  talla ", cuenta: "x" })).toEqual({ tipo: "dm", estado: "todos", q: "talla" });
  });
  it("si escribe la persona vuelve a «sin responder»; si respondo, «respondido»", () => {
    expect(nextStatus(false)).toBe("sin_responder");
    expect(nextStatus(true)).toBe("respondido");
  });
  it("TikTok no permite comentarios ni mensajes por API: se abren en su app", () => {
    expect(CAPABILITIES.tiktok).toMatchObject({ dms: false, comments: false, openDmsUrl: "https://www.tiktok.com/messages" });
    expect(CAPABILITIES.instagram).toMatchObject({ replyDm: true, hideComment: true, privateReply: true });
  });
});
