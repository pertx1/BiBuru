/**
 * Bolsa para la imprenta: a partir de los pedidos «Sin hacer» calcula qué prendas
 * lisas y qué DTF hay que llevar. Portado de PROFITY, ahora con el catálogo editable.
 */
import { resolveDesign, resolveDtfColor, type Catalog, type Rules } from "./catalog";
import { capitalize, colorKey, garmentName, normalizeText, shirtColorLabel, sizeRank } from "./text";

export type BagOrder = { id: string; orderNumber: string | null; model: string; color: string | null; size: string | null; quantity: number };
export type BagSource = BagOrder;

export type BagLine = {
  key: string;
  kind: "shirt" | "dtf";
  label: string;
  quantity: number;
  sources: BagSource[];
  /** Color de prenda sin regla de color de DTF. */
  missingRuleFor?: string;
};
export type BagWarning = { orderId: string; orderRef: string; problems: string[] };
export type PrintBag = {
  pendingOrders: number;
  shirts: BagLine[];
  dtfs: BagLine[];
  warnings: BagWarning[];
  colorsWithoutRule: string[];
};

function orderRef(o: BagOrder) {
  if (!o.orderNumber) return o.model;
  return /^\d+$/.test(o.orderNumber) ? `#${o.orderNumber}` : o.orderNumber;
}

type Group = {
  key: string; kind: "shirt" | "dtf"; quantity: number; sources: BagSource[];
  color?: string; size?: string; design?: string; dtfColor?: string | null; unique?: boolean;
  shirtColors: string[]; missingRuleFor?: string;
};

function addToGroup(groups: Map<string, Group>, init: Omit<Group, "quantity" | "sources" | "shirtColors">, order: BagOrder, shirtColor: string | null) {
  let g = groups.get(init.key);
  if (!g) {
    g = { ...init, quantity: 0, sources: [], shirtColors: [] };
    groups.set(init.key, g);
  }
  g.quantity += order.quantity;
  g.sources.push({ ...order });
  if (shirtColor) {
    const label = shirtColorLabel(shirtColor);
    if (!g.shirtColors.includes(label)) g.shirtColors.push(label);
  }
}

export function buildPrintBag(orders: BagOrder[], rules: Rules, catalog: Catalog): PrintBag {
  const shirtGroups = new Map<string, Group>();
  const dtfGroups = new Map<string, Group>();
  const warnings: BagWarning[] = [];
  const colorsWithoutRule = new Map<string, string>();

  for (const order of orders) {
    const problems: string[] = [];
    const design = resolveDesign(order.model, catalog);
    const size = order.size?.trim() ? order.size.trim().toUpperCase() : null;
    const modelMissing = !order.model.trim() || normalizeText(order.model) === "sin modelo";

    // Prenda de un diseño: el color va en "color". Prenda lisa: el propio "modelo" es el color/tipo.
    const shirtColor = design ? order.color?.trim() || null : modelMissing ? null : order.model.trim();

    if (modelMissing) problems.push("falta el diseño o modelo");
    if (design && !shirtColor) problems.push("falta el color de la camiseta");
    if (!size) problems.push("falta la talla");

    if (shirtColor && size) {
      addToGroup(shirtGroups, { key: `shirt|${colorKey(shirtColor)}|${size}`, kind: "shirt", color: shirtColor, size }, order, shirtColor);
    }

    if (design) {
      const dtf = resolveDtfColor(design, shirtColor, rules);
      if (dtf.color || dtf.unique) {
        const key = `dtf|${normalizeText(design.name)}|${dtf.unique ? "unico" : colorKey(dtf.color!)}`;
        addToGroup(dtfGroups, { key, kind: "dtf", design: design.name, dtfColor: dtf.color, unique: dtf.unique }, order, shirtColor);
      } else if (shirtColor) {
        const label = shirtColorLabel(shirtColor);
        colorsWithoutRule.set(colorKey(shirtColor), label);
        const key = `dtf|${normalizeText(design.name)}|?|${colorKey(shirtColor)}`;
        addToGroup(dtfGroups, { key, kind: "dtf", design: design.name, dtfColor: null, missingRuleFor: garmentName(label) }, order, shirtColor);
      }
    }

    if (problems.length > 0) warnings.push({ orderId: order.id, orderRef: orderRef(order), problems });
  }

  const shirts = [...shirtGroups.values()]
    .sort((a, b) =>
      shirtColorLabel(a.color!).localeCompare(shirtColorLabel(b.color!), "es") ||
      sizeRank(a.size!) - sizeRank(b.size!) ||
      a.size!.localeCompare(b.size!, "es"))
    .map<BagLine>((g) => ({
      key: g.key, kind: "shirt", quantity: g.quantity, sources: g.sources,
      label: `${capitalize(garmentName(shirtColorLabel(g.color!)))} ${g.size}`,
    }));

  const dtfs = [...dtfGroups.values()]
    .sort((a, b) => a.design!.localeCompare(b.design!, "es") || (a.dtfColor ?? "").localeCompare(b.dtfColor ?? "", "es"))
    .map<BagLine>((g) => {
      const forShirts = g.shirtColors.length ? ` (para ${g.shirtColors.map(garmentName).join(" / ")})` : "";
      const color = g.unique ? "" : g.dtfColor ? ` ${g.dtfColor}` : " · color sin definir";
      return { key: g.key, kind: "dtf", label: `DTF ${g.design}${color}${forShirts}`, quantity: g.quantity, sources: g.sources, missingRuleFor: g.missingRuleFor };
    });

  return {
    pendingOrders: orders.length, shirts, dtfs, warnings,
    colorsWithoutRule: [...colorsWithoutRule.values()].sort((a, b) => a.localeCompare(b, "es")),
  };
}

export function printBagToText(bag: Pick<PrintBag, "shirts" | "dtfs">): string {
  const total = (lines: BagLine[]) => lines.reduce((s, l) => s + l.quantity, 0);
  const block = (lines: BagLine[]) => lines.map((l) => `- ${l.quantity} × ${l.label}`).join("\n");
  const parts = ["🎒 Bolsa para la imprenta"];
  if (bag.shirts.length) parts.push(`\nCamisetas y sudaderas (${total(bag.shirts)}):\n${block(bag.shirts)}`);
  if (bag.dtfs.length) parts.push(`\nDTF (${total(bag.dtfs)}):\n${block(bag.dtfs)}`);
  return parts.join("\n");
}
