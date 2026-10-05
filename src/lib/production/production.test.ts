import { describe, expect, it } from "vitest";
import { resolveDtfColor, resolveShirtModel, resolveSize, type Catalog, type Rules } from "./catalog";
import { buildPrintBag, printBagToText } from "./print-bag";
import { computeStockOverview, resolveStockEffect } from "./stock";
import { colorKey } from "./text";

const catalog: Catalog = {
  models: ["Blanca", "Negra", "Fútbol", "Sudadera negra"],
  designs: [
    { name: "BA Azul", kind: "standalone" }, { name: "Eguzkilore", kind: "standalone" },
    { name: "Gaztelugatxe", kind: "paired" }, { name: "Ujue", kind: "paired" },
  ],
};
const noRules: Rules = { shirt: [], design: [] };

describe("reconocer prenda y talla", () => {
  it.each([
    ["Blanco", "Blanca"], ["blanca", "Blanca"], ["WHITE", "Blanca"], ["Negro", "Negra"], ["black", "Negra"],
    ["Fútbol", "Fútbol"], ["camiseta de futbol", "Fútbol"], ["Sudadera negra", "Sudadera negra"], ["sudadera", "Sudadera negra"],
  ])("%s -> %s", (input, expected) => expect(resolveShirtModel(input, catalog)).toBe(expected));
  it("no inventa modelos", () => {
    expect(resolveShirtModel("Rojo", catalog)).toBeNull();
    expect(resolveShirtModel("", catalog)).toBeNull();
    expect(resolveShirtModel(null, catalog)).toBeNull();
  });
  it("tallas", () => {
    expect(resolveSize(" m ")).toBe("M");
    expect(resolveSize("xxl")).toBe("XXL");
    expect(resolveSize("42")).toBeNull();
  });
  it("colores equivalentes comparten clave", () => {
    expect(colorKey("Blanco")).toBe(colorKey("blanca"));
    expect(colorKey("Negra")).toBe(colorKey("NEGRO"));
  });
});

describe("color del DTF", () => {
  const ga = catalog.designs[2];
  it("por defecto: negra→blanco, blanca→negro", () => {
    expect(resolveDtfColor(ga, "Negra", noRules).color).toBe("blanco");
    expect(resolveDtfColor(ga, "Blanca", noRules).color).toBe("negro");
    expect(resolveDtfColor(ga, "Roja", noRules).color).toBeNull();
  });
  it("diseño único no depende de la prenda", () => {
    expect(resolveDtfColor(catalog.designs[0], "Roja", noRules)).toEqual({ color: null, unique: true });
  });
  it("prioridad: regla del diseño > regla de la prenda > defecto", () => {
    const rules: Rules = { shirt: [{ shirtColorKey: colorKey("Roja"), dtfColor: "Blanca" }], design: [{ design: "Ujue", dtfColor: "Todo color" }] };
    expect(resolveDtfColor(ga, "Roja", rules).color).toBe("blanco");
    expect(resolveDtfColor(catalog.designs[3], "Negra", rules).color).toBe("todo color");
  });
});

describe("efecto en el stock de un pedido", () => {
  it("prenda lisa: descuenta prenda y talla", () => {
    expect(resolveStockEffect({ product_name: "Negra", color: null, size: "M" }, catalog, noRules)).toEqual({ tshirt: { model: "Negra", size: "M" } });
  });
  it("diseño emparejado sobre prenda negra: DTF blanco", () => {
    expect(resolveStockEffect({ product_name: "Gaztelugatxe", color: "Negra", size: "L" }, catalog, noRules)).toEqual({
      tshirt: { model: "Negra", size: "L" }, dtf: { name: "Gaztelugatxe", variant: "BLANCO" },
    });
  });
  it("sobre prenda blanca: DTF negro; sudadera negra: blanco", () => {
    expect(resolveStockEffect({ product_name: "Ujue", color: "Blanco", size: "S" }, catalog, noRules).dtf?.variant).toBe("NEGRO");
    expect(resolveStockEffect({ product_name: "Ujue", color: "Sudadera negra", size: "S" }, catalog, noRules).dtf?.variant).toBe("BLANCO");
  });
  it("diseño único: variante UNICO aunque falte la talla", () => {
    expect(resolveStockEffect({ product_name: "BA Azul", color: "Negra", size: null }, catalog, noRules)).toEqual({ dtf: { name: "BA Azul", variant: "UNICO" } });
  });
  it("sin datos reconocibles no descuenta nada", () => {
    expect(resolveStockEffect({ product_name: "Cosa rara", color: "Rojo", size: "M" }, catalog, noRules)).toEqual({});
  });
});

describe("stock y «Pedir ya»", () => {
  const rows = {
    tshirts: [
      { model: "Negra", size: "M", quantity: 5 }, { model: "Negra", size: "L", quantity: 0 }, { model: "Blanca", size: "M", quantity: 1 },
    ],
    dtfs: [
      { name: "Gaztelugatxe", variant: "BLANCO" as const, quantity: 3 }, { name: "Gaztelugatxe", variant: "NEGRO" as const, quantity: 0 },
      { name: "BA Azul", variant: "UNICO" as const, quantity: 2 }, { name: "Ujue", variant: "UNICO" as const, quantity: 9 }, // fila obsoleta
    ],
  };
  const pending = [
    { product_name: "Gaztelugatxe", color: "Negra", size: "M", quantity: 2 },
    { product_name: "Negra", color: null, size: "M", quantity: 4 },
    { product_name: "Gaztelugatxe", color: "Blanca", size: "M", quantity: 1 },
  ];
  const o = computeStockOverview(rows, pending, catalog, noRules);
  it("resta la demanda de los pedidos pendientes y puede quedar negativo", () => {
    expect(o.tshirts.find((t) => t.model === "Negra" && t.size === "M")!.quantity).toBe(5 - 2 - 4);
    expect(o.tshirts.find((t) => t.model === "Blanca" && t.size === "M")!.quantity).toBe(0);
    expect(o.dtfs.find((d) => d.variant === "BLANCO")!.quantity).toBe(1);
    expect(o.dtfs.find((d) => d.variant === "NEGRO")!.quantity).toBe(-1);
  });
  it("ignora filas de DTF que ya no están en el catálogo", () => {
    expect(o.dtfs.some((d) => d.name === "Ujue")).toBe(false);
  });
  it("«Pedir ya» lista lo que está a 0 o menos, de peor a mejor", () => {
    expect(o.needsOrder[0]).toMatchObject({ label: "Camiseta negra · talla M", quantity: -1 });
    expect(o.needsOrder.map((n) => n.quantity)).toEqual([...o.needsOrder.map((n) => n.quantity)].sort((a, b) => a - b));
    expect(o.needsOrder.some((n) => n.label.includes("DTF negro"))).toBe(true);
    expect(o.needsOrder.some((n) => n.label.includes("DTF blanco"))).toBe(false);
  });
});

describe("bolsa para la imprenta", () => {
  const orders = [
    { id: "1", orderNumber: "12", model: "Gaztelugatxe", color: "Negra", size: "M", quantity: 2 },
    { id: "2", orderNumber: "13", model: "Gaztelugatxe", color: "Negro", size: "M", quantity: 1 },
    { id: "3", orderNumber: null, model: "Blanca", color: null, size: "L", quantity: 1 },
    { id: "4", orderNumber: "Ana", model: "Ujue", color: "Roja", size: null, quantity: 1 },
  ];
  const bag = buildPrintBag(orders, noRules, catalog);
  it("agrupa prendas por color y talla (Negra/Negro juntas)", () => {
    expect(bag.shirts.map((s) => [s.label, s.quantity])).toEqual([["Camiseta blanca L", 1], ["Camiseta negra M", 3]]);
  });
  it("agrupa DTF por diseño y color", () => {
    expect(bag.dtfs[0]).toMatchObject({ label: "DTF Gaztelugatxe blanco (para camiseta negra)", quantity: 3 });
    expect(bag.dtfs.find((d) => d.missingRuleFor)).toMatchObject({ label: "DTF Ujue · color sin definir (para camiseta roja)" });
    expect(bag.colorsWithoutRule).toEqual(["roja"]);
  });
  it("avisa de pedidos incompletos", () => {
    expect(bag.warnings).toEqual([{ orderId: "4", orderRef: "Ana", problems: ["falta la talla"] }]);
  });
  it("texto para copiar", () => {
    expect(printBagToText(bag)).toContain("- 3 × Camiseta negra M");
    expect(printBagToText(bag)).toContain("DTF (");
  });
});
