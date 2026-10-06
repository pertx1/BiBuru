import { describe, expect, it } from "vitest";
import { emailSchema, passwordSchema } from "./auth-schemas";

describe("contraseña", () => {
  it("exige entre 8 y 72 caracteres", () => {
    expect(passwordSchema.safeParse("corta").success).toBe(false);
    expect(passwordSchema.safeParse("suficiente1").success).toBe(true);
    expect(passwordSchema.safeParse("x".repeat(73)).success).toBe(false);
  });
  it("valida el correo", () => {
    expect(emailSchema.safeParse("a@b.com").success).toBe(true);
    expect(emailSchema.safeParse("nope").success).toBe(false);
  });
});
