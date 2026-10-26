/**
 * Código del widget para la app Scriptable (iPhone). iOS no deja a una app web poner widgets en la pantalla de inicio;
 * Scriptable (gratis) sí, y pinta lo que le da `/api/widget`. Lógica pura (genera texto), con tests.
 * Parámetro del widget (al editarlo en el iPhone): vacío = resumen, «tareas» o «dinero».
 */
export function buildWidgetScript(origin: string, token: string): string {
  return `// BiBuru · widget para Scriptable. Pega todo esto en un script nuevo de Scriptable.
// Parámetro del widget: vacío = resumen · «tareas» · «dinero».
const URL_BASE = ${JSON.stringify(origin)};
const CLAVE = ${JSON.stringify(token)};

const mode = (args.widgetParameter || "").trim().toLowerCase();
const fam = config.widgetFamily || "medium";
const dark = Device.isUsingDarkAppearance();
const C = { bg: dark ? new Color("#1c1c1e") : new Color("#ffffff"), text: dark ? Color.white() : Color.black(),
  muted: new Color(dark ? "#98989f" : "#6c6c70"), accent: new Color("#5e5ce6"), good: new Color(dark ? "#30d158" : "#248a3d"), bad: new Color(dark ? "#ff6961" : "#d70015") };

async function load() {
  const r = new Request(URL_BASE + "/api/widget");
  r.headers = { Authorization: "Bearer " + CLAVE };
  r.timeoutInterval = 15;
  try { const j = await r.loadJSON(); if (r.response.statusCode === 200) return j; return { error: j && j.error ? j.error : "Clave no válida" }; }
  catch (e) { return { error: "Sin conexión" }; }
}
const eur = (c) => (c / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: c % 100 ? 2 : 0 });
function row(w, label, value, color) {
  const s = w.addStack(); s.centerAlignContent();
  const l = s.addText(label); l.font = Font.systemFont(12); l.textColor = C.muted; l.lineLimit = 1;
  s.addSpacer();
  const v = s.addText(value); v.font = Font.semiboldSystemFont(13); v.textColor = color || C.text; v.lineLimit = 1;
}
function title(w, t) { const x = w.addText(t); x.font = Font.boldSystemFont(13); x.textColor = C.accent; w.addSpacer(4); }

const d = await load();
const w = new ListWidget();
w.backgroundColor = C.bg;
w.setPadding(12, 14, 12, 14);
w.url = URL_BASE + (mode === "dinero" ? "/negocios" : "/tareas");
w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);

if (d.error) {
  title(w, "BiBuru"); const e = w.addText(d.error); e.font = Font.systemFont(12); e.textColor = C.bad;
} else {
  const small = fam === "small";
  const maxTasks = fam === "large" ? 8 : small ? 3 : 4;
  if (mode !== "dinero") {
    title(w, mode === "tareas" ? "Tareas de hoy · " + d.tasks.today : "Hoy · " + d.tasks.today + (d.tasks.today === 1 ? " tarea" : " tareas"));
    for (const t of d.tasks.list.slice(0, maxTasks)) {
      const s = w.addStack(); s.spacing = 6;
      const dot = s.addText(t.overdue ? "●" : "○"); dot.font = Font.systemFont(10); dot.textColor = t.overdue ? C.bad : C.accent;
      const x = s.addText((t.time ? t.time + " " : "") + t.title); x.font = Font.systemFont(12); x.textColor = C.text; x.lineLimit = 1;
    }
    if (!d.tasks.list.length) { const x = w.addText("Nada pendiente 🎉"); x.font = Font.systemFont(12); x.textColor = C.muted; }
    if (d.tasks.overdue) row(w, "Atrasadas", String(d.tasks.overdue), C.bad);
  }
  if (mode !== "tareas" && !(small && mode === "")) {
    if (mode !== "dinero") w.addSpacer(6); else title(w, "Negocios");
    row(w, "Ventas hoy", eur(d.money.todayIncome));
    row(w, "Ventas del mes", eur(d.money.monthIncome));
    if (fam !== "small" || mode === "dinero") row(w, "Beneficio del mes", eur(d.money.monthProfit), d.money.monthProfit >= 0 ? C.good : C.bad);
    row(w, "Pedidos sin hacer", String(d.orders.toDo));
    if (d.receivable > 0) row(w, "Te deben", eur(d.receivable), C.bad);
    if (d.stockToOrder > 0) row(w, "Stock a pedir", String(d.stockToOrder), C.bad);
  }
  w.addSpacer();
  const f = w.addText("Actualizado " + new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }));
  f.font = Font.systemFont(9); f.textColor = C.muted;
}
if (config.runsInWidget) Script.setWidget(w); else await w.presentMedium();
Script.complete();
`;
}
