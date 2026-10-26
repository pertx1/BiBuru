/**
 * Scriptable simulado para probar el código del widget fuera del iPhone (tests y scripts/e2e). Registra lo que pinta.
 * Solo se usa en pruebas.
 */
export type Painted = { texts: string[]; url?: string; presented: boolean; widgetSet: boolean };

export async function runInScriptable(code: string, o: { family?: string; param?: string; inWidget?: boolean; fetchJson: (url: string, headers: Record<string, string>) => Promise<{ status: number; body: unknown }> }): Promise<Painted> {
  const painted: Painted = { texts: [], presented: false, widgetSet: false };
  class Color { hex: string; constructor(hex = "") { this.hex = hex; } static white() { return new Color("#fff"); } static black() { return new Color("#000"); } }
  const Font = { systemFont: () => ({}), semiboldSystemFont: () => ({}), boldSystemFont: () => ({}) };
  const textEl = (t: string) => { painted.texts.push(t); return { font: null, textColor: null, lineLimit: 0 }; };
  const stack = (): Record<string, unknown> => ({ centerAlignContent() {}, addText: textEl, addSpacer() {}, addStack: stack, spacing: 0 });
  class ListWidget {
    backgroundColor: unknown; url?: string; refreshAfterDate?: Date;
    setPadding() {} addText(t: string) { return textEl(t); } addSpacer() {} addStack() { return stack(); }
    async presentMedium() { painted.presented = true; painted.url = this.url; }
  }
  class Request {
    headers: Record<string, string> = {}; timeoutInterval = 0; response = { statusCode: 0 }; url: string;
    constructor(url: string) { this.url = url; }
    async loadJSON() { const r = await o.fetchJson(this.url, this.headers); this.response.statusCode = r.status; return r.body; }
  }
  let widget: ListWidget | null = null;
  const Script = { setWidget(w: ListWidget) { painted.widgetSet = true; widget = w; }, complete() {} };
  const env = {
    args: { widgetParameter: o.param ?? null }, config: { widgetFamily: o.family ?? "medium", runsInWidget: o.inWidget ?? true },
    Device: { isUsingDarkAppearance: () => true }, Color, Font, ListWidget, Request, Script,
  };
  const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor as new (...a: string[]) => (...v: unknown[]) => Promise<void>;
  await new AsyncFunction(...Object.keys(env), code)(...Object.values(env));
  if (widget) painted.url = (widget as ListWidget).url;
  return painted;
}
