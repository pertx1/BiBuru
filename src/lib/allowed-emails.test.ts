import { describe, expect, it } from "vitest";
import { isEmailAllowed, parseAllowedEmails } from "./allowed-emails";

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
