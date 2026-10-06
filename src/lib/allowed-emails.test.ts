import { describe, expect, it } from "vitest";
import { hasAccess, isEmailAllowed, parseAllowedEmails } from "./allowed-emails";

describe("ALLOWED_EMAILS", () => {
  it("separa por comas, espacios y punto y coma, y normaliza", () => {
    expect(parseAllowedEmails(" A@x.com, b@y.com ;C@z.com ")).toEqual([
      "a@x.com",
      "b@y.com",
      "c@z.com",
    ]);
  });
  it("permite solo los correos de la lista, sin distinguir mayúsculas", () => {
    expect(isEmailAllowed("YO@x.com", "yo@x.com")).toBe(true);
    expect(isEmailAllowed("otro@x.com", "yo@x.com")).toBe(false);
  });
  it("lista vacía o ausente: no entra nadie", () => {
    expect(isEmailAllowed("yo@x.com", "")).toBe(false);
    expect(isEmailAllowed("yo@x.com", undefined)).toBe(false);
  });
  it("no acepta coincidencias parciales", () => {
    expect(isEmailAllowed("yo@x.com.evil.com", "yo@x.com")).toBe(false);
  });
});

describe("hasAccess", () => {
  it("por defecto el registro está abierto", () => {
    expect(hasAccess("cualquiera@x.com", {})).toBe(true);
    expect(hasAccess("cualquiera@x.com", { allowed: "yo@x.com", open: "true" })).toBe(true);
  });
  it("con OPEN_SIGNUP=false solo entra la lista", () => {
    expect(hasAccess("yo@x.com", { allowed: "yo@x.com", open: "false" })).toBe(true);
    expect(hasAccess("otro@x.com", { allowed: "yo@x.com", open: "false" })).toBe(false);
    expect(hasAccess("otro@x.com", { open: "false" })).toBe(false);
  });
});
