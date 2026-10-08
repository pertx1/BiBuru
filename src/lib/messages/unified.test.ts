import { describe, expect, it } from "vitest";
import { mailStatus, mergeItems, orderHref, parseUnifiedFilters, type UnifiedItem } from "./unified";

const item = (p: Partial<UnifiedItem>): UnifiedItem => ({
  key: "k", id: "1", channel: "correo", kind: "Correo", account: "tienda@x.com", person: "Ana", preview: "¿Tenéis la M?", at: "2026-10-07T10:00:00Z",
  status: "sin_responder", href: "/correo?abrir=1", externalUrl: null, ...p,
});

describe("Mensajes del negocio en una lista", () => {
  it("filtros de la URL: por defecto «sin responder»", () => {
    expect(parseUnifiedFilters({})).toEqual({ canal: undefined, estado: "sin_responder", q: undefined });
    expect(parseUnifiedFilters({ canal: "instagram", estado: "archivado", q: "  ana " })).toEqual({ canal: "instagram", estado: "archivado", q: "ana" });
    expect(parseUnifiedFilters({ canal: "x", estado: "raro" })).toEqual({ canal: undefined, estado: "sin_responder", q: undefined });
  });
  it("estado del correo: marcado en BiBuru o, si no, sin responder mientras no esté leído", () => {
    expect(mailStatus({ triage: null, is_read: false })).toBe("sin_responder");
    expect(mailStatus({ triage: null, is_read: true })).toBeNull();
    expect(mailStatus({ triage: "respondido", is_read: false })).toBe("respondido");
    expect(mailStatus({ triage: "archivado", is_read: true })).toBe("archivado");
  });
  it("une correo y redes, lo más reciente primero, y filtra por estado y texto", () => {
    const list = mergeItems([
      [item({ key: "a", at: "2026-10-07T09:00:00Z" }), item({ key: "b", status: null, at: "2026-10-07T11:00:00Z" })],
      [item({ key: "c", channel: "instagram", person: "@luis", at: "2026-10-07T12:00:00Z" })],
    ], { estado: "sin_responder" });
    expect(list.map((i) => i.key)).toEqual(["c", "a"]);
    expect(mergeItems([[item({ key: "a" }), item({ key: "c", person: "Luis" })]], { estado: "todos", q: "luis" }).map((i) => i.key)).toEqual(["c"]);
  });
  it("«Crear pedido» lleva el cliente y el canal", () => {
    expect(orderHref("b1", "Ana López", "instagram")).toBe("/negocios/b1/pedidos?crear=1&para=Ana%20L%C3%B3pez&via=Instagram");
  });
});
