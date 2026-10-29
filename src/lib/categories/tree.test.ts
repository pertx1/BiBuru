import { describe, expect, it } from "vitest";
import { ancestors, buildTree, categoryPaths, descendantIds, flatten, resolveProposed } from "./tree";

const rows = [
  { id: "ia", name: "IA", parent_id: null, pinned: true },
  { id: "claude", name: "Claude", parent_id: "ia" },
  { id: "otras", name: "Otras IA", parent_id: "ia" },
  { id: "pn", name: "Posibles negocios", parent_id: null, pinned: true },
  { id: "mk", name: "Marketing", parent_id: null },
  { id: "ads", name: "Anuncios", parent_id: "mk" },
  { id: "huerf", name: "Huérfana", parent_id: "borrada" },
];

describe("árbol de categorías", () => {
  it("ordena (fijadas primero) y da rutas", () => {
    expect(flatten(buildTree(rows)).map((n) => `${"  ".repeat(n.depth)}${n.path}`)).toEqual([
      "IA", "  IA › Claude", "  IA › Otras IA", "Posibles negocios", "Huérfana", "Marketing", "  Marketing › Anuncios",
    ]);
  });
  it("descendientes y antepasados", () => {
    expect(descendantIds(rows, "ia").sort()).toEqual(["claude", "ia", "otras"]);
    expect(descendantIds(rows, "claude")).toEqual(["claude"]);
    expect(ancestors(rows, "claude").map((r) => r.name)).toEqual(["IA", "Claude"]);
  });
  it("no se cuelga con ciclos en los datos", () => {
    const loop = [{ id: "a", name: "A", parent_id: "b" }, { id: "b", name: "B", parent_id: "a" }];
    expect(flatten(buildTree(loop))).toEqual([]);
    expect(ancestors(loop, "a").length).toBe(2);
  });
  it("la IA: ruta exacta, hoja única, o nueva dentro del padre", () => {
    expect(categoryPaths(rows)).toContain("IA › Claude");
    expect(resolveProposed("ia > claude", rows)).toEqual({ id: "claude", name: "Claude", parentId: "ia" });
    expect(resolveProposed("Claude", rows)).toEqual({ id: "claude", name: "Claude", parentId: "ia" });
    expect(resolveProposed("IA › Gemini", rows)).toEqual({ id: null, name: "Gemini", parentId: "ia" });
    expect(resolveProposed("cocina", rows)).toEqual({ id: null, name: "Cocina", parentId: null });
    expect(resolveProposed("posibles negocios", rows).id).toBe("pn");
  });
});
