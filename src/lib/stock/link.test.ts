import { describe, expect, it } from "vitest";
import { effectsText, resolveLineStock, stockOptions, totalByKey, type StockLinkContext } from "./link";

const production = {
  catalog: { models: ["Blanca", "Negra"], designs: [{ name: "Ola", kind: "paired" as const }, { name: "Logo", kind: "standalone" as const }] },
  rules: { shirt: [], design: [] },
  rows: {
    tshirts: [{ model: "Blanca", size: "M" }, { model: "Negra", size: "M" }],
    dtfs: [{ name: "Ola", variant: "BLANCO" as const }, { name: "Ola", variant: "NEGRO" as const }, { name: "Logo", variant: "UNICO" as const }, { name: "Logo", variant: "BLANCO" as const }],
  },
};
const items = [{ id: "11111111-1111-1111-1111-111111111111", name: "Bolsas de envío", variant: "", product_id: null, match_color: null, match_size: null }];
const ctx: StockLinkContext = { production: { catalog: production.catalog, rules: production.rules }, items, options: stockOptions(production, items) };

describe("qué descuenta cada línea de pedido", () => {
  it("lista de artículos: prendas, DTF del catálogo y materiales", () => {
    expect(ctx.options.map((o) => o.key)).toEqual([
      "tshirt|Blanca|M", "tshirt|Negra|M", "dtf|Ola|BLANCO", "dtf|Ola|NEGRO", "dtf|Logo|UNICO", "item|11111111-1111-1111-1111-111111111111",
    ]); // «Logo blanco» ya no está en el catálogo (el diseño es único)
  });
  it("artículo elegido a mano: descuenta ese", () => {
    expect(resolveLineStock({ stock_key: "tshirt|Negra|M", product_name: "Lo que sea", quantity: 2 }, ctx)).toEqual([{ key: "tshirt|Negra|M", label: "Camiseta negra M", qty: 2 }]);
  });
  it("diseño sobre prenda: prenda + DTF del color que toca", () => {
    expect(resolveLineStock({ product_name: "Ola", color: "Negra", size: "M", quantity: 3 }, ctx).map((e) => [e.key, e.qty]))
      .toEqual([["tshirt|Negra|M", 3], ["dtf|Ola|BLANCO", 3]]);
  });
  it("material por nombre", () => {
    expect(resolveLineStock({ product_name: "bolsas de envio", quantity: 5 }, ctx)).toEqual([{ key: "item|11111111-1111-1111-1111-111111111111", label: "Bolsas de envío", qty: 5 }]);
  });
  it("texto libre: sin vincular al stock", () => {
    const eff = resolveLineStock({ product_name: "Taza personalizada", quantity: 1 }, ctx);
    expect(eff).toEqual([]);
    expect(effectsText(eff)).toBe("Sin vincular al stock");
  });
  it("artículo elegido que ya no existe o cantidad 0: no descuenta", () => {
    expect(resolveLineStock({ stock_key: "item|00000000-0000-0000-0000-000000000000", product_name: "x", quantity: 1 }, ctx)).toEqual([]);
    expect(resolveLineStock({ stock_key: "tshirt|Negra|M", product_name: "x", quantity: 0 }, ctx)).toEqual([]);
  });
  it("suma por artículo entre líneas", () => {
    const t = totalByKey([resolveLineStock({ stock_key: "tshirt|Negra|M", product_name: "a", quantity: 2 }, ctx), resolveLineStock({ product_name: "Ola", color: "negra", size: "m", quantity: 1 }, ctx)]);
    expect(t.get("tshirt|Negra|M")?.qty).toBe(3);
  });
});
