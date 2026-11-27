import { describe, expect, it } from "vitest";
import { mcpContext } from "./tools";

/** Cliente falso: la consulta de la clave devuelve lo que se le pase (o un error de base de datos). */
function fakeDb(answers: { data?: unknown; error?: { message: string } }[]) {
  let i = 0;
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq", "update"]) q[m] = () => q;
  q.maybeSingle = async () => answers[Math.min(i++, answers.length - 1)];
  q.then = undefined;
  return { from: () => q } as never;
}
const token = `bm_${"a".repeat(40)}`;

describe("clave del conector", () => {
  it("un fallo momentáneo de la base de datos no es «clave no válida» (no desconecta a Claude)", async () => {
    expect(await mcpContext(fakeDb([{ error: { message: "timeout" } }, { error: { message: "timeout" } }]), token, "https://x", null)).toBe("unavailable");
  });
  it("si el segundo intento va bien, sigue", async () => {
    const r = await mcpContext(fakeDb([{ error: { message: "timeout" } }, { data: { id: "t", user_id: "u1", workspace_id: "w" } }, { data: { timezone: "Europe/Madrid" } }]), token, "https://x", null, () => {});
    expect(r).toMatchObject({ workspaceId: "w", userId: "u1" });
  });
  it("una clave que no existe o mal formada sí es inválida", async () => {
    expect(await mcpContext(fakeDb([{ data: null }]), token, "https://x", null)).toBe("invalid");
    expect(await mcpContext(fakeDb([{ data: null }]), "otra", "https://x", null)).toBe("invalid");
  });
});
