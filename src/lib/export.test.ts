import { describe, expect, it } from "vitest";
import { rowsToCsv } from "./export";

describe("rowsToCsv", () => {
  it("convierte céntimos a euros con coma y oculta columnas internas", () => {
    const csv = rowsToCsv([{ id: "1", workspace_id: "w", user_id: "u", concept: "Etiquetas", amount_cents: 4250, tags: ["a"], note: null }]);
    const [head, row] = csv.replace("﻿", "").trim().split("\r\n");
    expect(head).toBe("id;concept;amount_eur;tags;note");
    expect(row).toBe('1;Etiquetas;42,50;"[""a""]";');
  });
  it("neutraliza fórmulas de Excel", () => {
    expect(rowsToCsv([{ t: "=HYPERLINK(\"x\")" }])).toContain("'=HYPERLINK");
  });
  it("sin filas devuelve solo la cabecera vacía", () => {
    expect(rowsToCsv([]).replace("﻿", "").trim()).toBe("");
  });
});
