import "server-only";
import { z } from "zod";
import { addDays, formatDate, nowLocal, startOfMonth } from "@/lib/dates";
import { formatEUR as formatEuros } from "@/lib/money";
import { createEvent, resolveBusiness, type Actor } from "@/lib/ai/actors";
import { buildTree, descendantIds, flatten, resolveProposed, SEP, type CatRow } from "@/lib/categories/tree";
import { addVideoByUrl, analyzeSoon } from "@/lib/favorites/service";
import type { AdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import { completeTask, insertSimpleTask, type TaskCtx } from "@/lib/tasks/service";
import { computeTaskTiming, timingColumns, type ReminderMode } from "@/lib/tasks/timing";
import { PENDING_CATEGORY, PRIORITY, parseDay, parseTime, pendingNotes, taskLine } from "./format";
import { tool, ToolError, type McpTool } from "./protocol";
import { hashMcpToken, MCP_TOKEN_RE } from "./token";

/**
 * Herramientas de BiBuru para Claude. Se ejecutan con la clave de servicio (no hay sesión), así que TODA consulta
 * filtra por el espacio de la clave personal. Nada borra datos: como mucho completa una tarea.
 */
export type McpCtx = { db: AdminClient; workspaceId: string; userId: string; timezone: string; origin: string };


/** Clave → contexto (null = no vale). Apunta el último uso y el cliente («claude-ai», «claude-code»…). */
export async function mcpContext(db: AdminClient, token: string, origin: string, client: string | null): Promise<McpCtx | null> {
  if (!MCP_TOKEN_RE.test(token)) return null;
  const { data: t } = await db.from("mcp_tokens").select("id, user_id, workspace_id").eq("token_hash", hashMcpToken(token)).maybeSingle();
  if (!t) return null;
  const [{ data: p }] = await Promise.all([
    db.from("profiles").select("timezone").eq("user_id", t.user_id).maybeSingle(),
    db.from("mcp_tokens").update({ last_used_at: new Date().toISOString(), ...(client ? { last_client: client.slice(0, 120) } : {}) }).eq("id", t.id),
  ]);
  return { db, workspaceId: t.workspace_id, userId: t.user_id, timezone: p?.timezone ?? "Europe/Madrid", origin };
}

export const MCP_INSTRUCTIONS = [
  "BiBuru es el panel personal de la persona (tareas, notas, proyectos, negocios y vídeos guardados). Habla en español de España; fechas dd/mm/aaaa, zona Europe/Madrid.",
  "Cuando la persona te pida apuntar, recordar o planificar algo, usa crear_tarea (o crear_nota para ideas y apuntes largos).",
  "MUY IMPORTANTE: si en esta conversación queda trabajo a medias (la persona se va, se corta, se deja para luego, o terminas con pasos pendientes), llama a apuntar_pendiente ANTES de despedirte, con qué falta exactamente y el contexto necesario para retomarlo. Si sabes de qué proyecto es, pásalo.",
  "Para retomar algo, mira primero listar_tareas con proyecto «Pendiente de Claude» o ver_proyecto.",
  "Los proyectos son categorías con subcategorías; se escriben con ruta: «IA › Claude».",
].join("\n");

const actor = (c: McpCtx): Actor => ({ supabase: c.db, workspaceId: c.workspaceId, userId: c.userId, timezone: c.timezone });
const taskCtx = (c: McpCtx): TaskCtx => ({ supabase: c.db, workspaceId: c.workspaceId, userId: c.userId, timezone: c.timezone });
const today = (c: McpCtx) => nowLocal(new Date(), c.timezone).date;
const link = (c: McpCtx, path: string) => `${c.origin}${path}`;

type Cat = CatRow & { description: string | null };
async function categories(c: McpCtx): Promise<Cat[]> {
  const { data } = await c.db.from("video_categories").select("id, name, parent_id, pinned, description").eq("workspace_id", c.workspaceId);
  return data ?? [];
}
const pathOf = (cats: Cat[], id: string | null) => (id ? flatten(buildTree(cats)).find((n) => n.id === id)?.path ?? null : null);

/** Proyecto existente por ruta o nombre único; null si no existe. */
function findCategory(cats: Cat[], name: string): Cat | null {
  const r = resolveProposed(name, cats);
  return r.id ? cats.find((x) => x.id === r.id) ?? null : null;
}

/** Proyecto por ruta («IA › Claude»); crea lo que falte de la ruta. */
async function ensureCategory(c: McpCtx, raw: string, o: { pinned?: boolean; description?: string | null } = {}): Promise<{ id: string; path: string; created: boolean }> {
  let cats = await categories(c);
  const hit = findCategory(cats, raw);
  if (hit) return { id: hit.id, path: pathOf(cats, hit.id) ?? hit.name, created: false };
  const parts = raw.split(/\s*(?:›|>|\/)\s*/).map((s) => s.trim().slice(0, 60)).filter(Boolean);
  if (!parts.length) throw new ToolError("Falta el nombre del proyecto");
  let parent: string | null = null;
  let created = false;
  const same = (a: string, b: string) => a.localeCompare(b, "es", { sensitivity: "base" }) === 0;
  for (const [i, part] of parts.entries()) {
    const existing = cats.find((x) => x.parent_id === parent && same(x.name, part));
    if (existing) { parent = existing.id; continue; }
    const last = i === parts.length - 1;
    const name = part.charAt(0).toUpperCase() + part.slice(1);
    const { data, error }: { data: Cat | null; error: { code: string; message: string } | null } = await c.db.from("video_categories").insert({
      workspace_id: c.workspaceId, user_id: c.userId, name, parent_id: parent, pinned: last ? !!o.pinned : false, description: last ? o.description ?? null : null,
    }).select("id, name, parent_id, pinned, description").single();
    if (error) {
      if (error.code !== "23505") throw new Error(error.message);
      cats = await categories(c); // la creó otra petición a la vez
      const again = cats.find((x) => x.parent_id === parent && same(x.name, part));
      if (!again) throw new Error(error.message);
      parent = again.id;
      continue;
    }
    if (!data) throw new Error("No se pudo crear el proyecto");
    cats.push(data);
    parent = data.id;
    created = true;
  }
  return { id: parent!, path: pathOf(cats, parent) ?? raw, created };
}

const dayArg = (c: McpCtx, raw: string | undefined): string | null | undefined => {
  if (raw === undefined) return undefined;
  if (/^(ninguna|sin fecha|-|)$/i.test(raw.trim())) return null;
  const d = parseDay(raw, today(c));
  if (!d) throw new ToolError(`No entiendo la fecha «${raw}». Usa «hoy», «mañana», «lunes», 2026-11-02 o 02/11/2026.`);
  return d;
};
const timeArg = (raw: string | undefined): string | null | undefined => {
  if (raw === undefined) return undefined;
  if (/^(ninguna|sin hora|-|)$/i.test(raw.trim())) return null;
  const t = parseTime(raw);
  if (!t) throw new ToolError(`No entiendo la hora «${raw}». Usa 09:30.`);
  return t;
};
async function businessArg(c: McpCtx, raw: string | undefined): Promise<string | null | undefined> {
  if (raw === undefined) return undefined;
  if (/^(ninguno|-|)$/i.test(raw.trim())) return null;
  const b = await resolveBusiness(actor(c), raw);
  if (!b) {
    const { data } = await c.db.from("businesses").select("name").eq("workspace_id", c.workspaceId).eq("archived", false).order("name");
    throw new ToolError(`No hay ningún negocio «${raw}». Negocios: ${(data ?? []).map((x) => x.name).join(", ") || "ninguno"}.`);
  }
  return b.id;
}

const TASK_COLS = "id, title, due_date, due_time, priority, status, category_id, business_id, notes" as const;
type TaskUpdate = Database["public"]["Tables"]["tasks"]["Update"];
type TaskRow = { id: string; title: string; due_date: string | null; due_time: string | null; priority: number; status: string; category_id: string | null; business_id: string | null; notes: string | null };
async function renderTasks(c: McpCtx, rows: TaskRow[], withNotes = false): Promise<string> {
  if (!rows.length) return "No hay tareas.";
  const [cats, { data: biz }] = await Promise.all([categories(c), c.db.from("businesses").select("id, name").eq("workspace_id", c.workspaceId)]);
  const bname = new Map((biz ?? []).map((b) => [b.id, b.name]));
  const t = today(c);
  return rows.map((r) => {
    const line = taskLine({ ...r, category: pathOf(cats, r.category_id), business: r.business_id ? bname.get(r.business_id) ?? null : null }, t);
    return withNotes && r.notes ? `${line}\n  ${r.notes.slice(0, 400).replace(/\n/g, "\n  ")}` : line;
  }).join("\n");
}

const priorityArg = z.enum(["alta", "media", "baja"]).optional().describe("Prioridad (por defecto media)");
const s = (max: number) => z.string().trim().max(max);

export const MCP_TOOLS: McpTool<McpCtx>[] = [
  tool({
    name: "resumen_de_hoy", title: "Resumen de hoy", readOnly: true,
    description: "Lo que hay hoy en BiBuru: tareas de hoy y atrasadas, pendientes de Claude, ventas del día y del mes, pedidos por hacer y lo que deben.",
    input: z.object({}),
    async run(c) {
      const t = today(c);
      const ws = c.workspaceId;
      const cats = await categories(c);
      const pending = cats.find((x) => !x.parent_id && x.name === PENDING_CATEGORY);
      const [tasks, pend, day, month, toDo, due] = await Promise.all([
        c.db.from("tasks").select(TASK_COLS).eq("workspace_id", ws).eq("status", "open").not("due_date", "is", null).lte("due_date", t)
          .order("due_date").order("due_time", { nullsFirst: false }).order("priority", { ascending: false }).limit(40),
        pending ? c.db.from("tasks").select(TASK_COLS).eq("workspace_id", ws).eq("status", "open").in("category_id", descendantIds(cats, pending.id)).order("created_at", { ascending: false }).limit(20) : Promise.resolve({ data: [] as TaskRow[] }),
        c.db.rpc("stats_totals", { ws, p_from: t, p_to: t }),
        c.db.rpc("stats_totals", { ws, p_from: startOfMonth(t), p_to: t }),
        c.db.from("orders").select("id", { count: "exact", head: true }).eq("workspace_id", ws).eq("status", "sin_hacer"),
        c.db.from("orders").select("due_cents").eq("workspace_id", ws).gt("due_cents", 0).limit(5000),
      ]);
      const sum = (rows: { income_cents: number; expense_cents: number }[] | null, k: "income_cents" | "expense_cents") => (rows ?? []).reduce((a, r) => a + Number(r[k] ?? 0), 0);
      const mi = sum(month.data, "income_cents");
      return [
        `Hoy es ${formatDate(t)}.`,
        `\nTareas de hoy y atrasadas:\n${await renderTasks(c, tasks.data ?? [])}`,
        `\nPendiente de Claude (${pend.data?.length ?? 0}):\n${await renderTasks(c, pend.data ?? [])}`,
        `\nVentas hoy: ${formatEuros(sum(day.data, "income_cents"))} · mes: ${formatEuros(mi)} (beneficio ${formatEuros(mi - sum(month.data, "expense_cents"))})`,
        `Pedidos sin hacer: ${toDo.count ?? 0} · Te deben: ${formatEuros((due.data ?? []).reduce((a, r) => a + Number(r.due_cents ?? 0), 0))}`,
      ].join("\n");
    },
  }),

  tool({
    name: "listar_tareas", title: "Ver tareas", readOnly: true,
    description: "Lista tareas. filtro: hoy (incluye atrasadas), atrasadas, semana, sin_fecha, pendientes (todas sin hacer) o hechas (últimos 7 días). Se puede filtrar por proyecto (incluye subproyectos) y por texto.",
    input: z.object({
      filtro: z.enum(["hoy", "atrasadas", "semana", "sin_fecha", "pendientes", "hechas"]).default("pendientes"),
      proyecto: s(200).optional().describe("Ruta o nombre del proyecto, p. ej. «IA › Claude» o «Pendiente de Claude»"),
      buscar: s(100).optional(), con_notas: z.boolean().optional().describe("Incluir las notas de cada tarea"),
      limite: z.number().int().min(1).max(100).default(40),
    }),
    async run(c, a) {
      const t = today(c);
      let q = c.db.from("tasks").select(TASK_COLS).eq("workspace_id", c.workspaceId);
      if (a.filtro === "hechas") q = q.eq("status", "done").gte("completed_at", new Date(Date.now() - 7 * 864e5).toISOString());
      else q = q.eq("status", "open");
      if (a.filtro === "hoy") q = q.lte("due_date", t);
      if (a.filtro === "atrasadas") q = q.lt("due_date", t);
      if (a.filtro === "semana") q = q.gte("due_date", t).lte("due_date", addDays(t, 6));
      if (a.filtro === "sin_fecha") q = q.is("due_date", null);
      if (a.proyecto) {
        const cats = await categories(c);
        const cat = findCategory(cats, a.proyecto);
        if (!cat) throw new ToolError(`No hay ningún proyecto «${a.proyecto}». Usa listar_proyectos para verlos.`);
        q = q.in("category_id", descendantIds(cats, cat.id));
      }
      if (a.buscar) q = q.ilike("title", `%${a.buscar.replace(/[%_\\]/g, "\\$&")}%`);
      const { data, error } = await q.order("due_date", { nullsFirst: false }).order("due_time", { nullsFirst: false }).order("priority", { ascending: false }).limit(a.limite);
      if (error) throw new Error(error.message);
      return renderTasks(c, data ?? [], a.con_notas);
    },
  }),

  tool({
    name: "crear_tarea", title: "Crear tarea",
    description: "Crea una tarea en BiBuru. Sin fecha va a la bandeja. Con hora, avisa a esa hora en el móvil.",
    input: z.object({
      titulo: s(300).min(1), notas: s(5000).optional(),
      fecha: s(40).optional().describe("hoy, mañana, lunes, 2026-11-02 o 02/11/2026"), hora: s(10).optional().describe("HH:MM"),
      prioridad: priorityArg, proyecto: s(200).optional().describe("Ruta o nombre del proyecto; se crea si no existe"), negocio: s(120).optional(),
    }),
    async run(c, a) {
      const date = dayArg(c, a.fecha) ?? null;
      const time = date ? timeArg(a.hora) ?? null : null;
      const businessId = await businessArg(c, a.negocio) ?? null;
      const cat = a.proyecto ? await ensureCategory(c, a.proyecto) : null;
      const r = await insertSimpleTask(taskCtx(c), { title: a.titulo, notes: a.notas || null, date, time, priority: PRIORITY[a.prioridad ?? "media"], businessId, categoryId: cat?.id ?? null });
      if ("error" in r) throw new ToolError(r.error);
      return `Tarea creada: «${a.titulo}»${date ? ` para el ${formatDate(date)}${time ? ` a las ${time}` : ""}` : " (sin fecha, en la bandeja)"}${cat ? ` en ${cat.path}${cat.created ? " (proyecto nuevo)" : ""}` : ""}.\nid: ${r.id}\n${link(c, `/tareas/${r.id}`)}`;
    },
  }),

  tool({
    name: "apuntar_pendiente", title: "Apuntar lo que queda a medias",
    description: "Guarda en BiBuru algo que se queda a medias en esta conversación de Claude o Claude Code, para retomarlo luego. Crea (o actualiza, si ya hay una con el mismo título) una tarea en el proyecto «Pendiente de Claude» o en el proyecto indicado, con qué falta y el contexto. Úsala SIEMPRE que quede trabajo pendiente al terminar.",
    input: z.object({
      titulo: s(200).min(1).describe("Qué es, corto: «Terminar el conector de Shopify»"),
      que_falta: s(4000).min(1).describe("Pasos concretos que quedan"),
      contexto: s(6000).optional().describe("Lo necesario para retomarlo: decisiones, archivos, rama, errores, enlaces"),
      origen: z.enum(["Claude", "Claude Code"]).default("Claude"),
      proyecto: s(200).optional().describe("Proyecto donde va (por defecto «Pendiente de Claude»)"),
      enlace: z.url().max(500).optional().describe("Enlace a la conversación, PR, rama…"),
      fecha: s(40).optional().describe("Cuándo retomarlo (opcional)"), prioridad: priorityArg,
    }),
    async run(c, a) {
      const cat = await ensureCategory(c, a.proyecto || PENDING_CATEGORY, { pinned: !a.proyecto, description: a.proyecto ? null : "Lo que se queda a medias en conversaciones con Claude y Claude Code." });
      const notes = pendingNotes({ source: a.origen, whenLocal: nowLocal(new Date(), c.timezone), missing: a.que_falta, context: a.contexto, link: a.enlace });
      const { data: same } = await c.db.from("tasks").select("id, notes").eq("workspace_id", c.workspaceId).eq("status", "open").eq("category_id", cat.id).ilike("title", a.titulo.replace(/[%_\\]/g, "\\$&")).limit(1).maybeSingle();
      if (same) {
        const merged = `${notes}\n\n— Antes —\n${same.notes ?? ""}`.slice(0, 20000);
        await c.db.from("tasks").update({ notes: merged, ...(a.prioridad ? { priority: PRIORITY[a.prioridad] } : {}) }).eq("id", same.id).eq("workspace_id", c.workspaceId);
        return `Actualizado el pendiente «${a.titulo}» en ${cat.path}.\nid: ${same.id}\n${link(c, `/tareas/${same.id}`)}`;
      }
      const date = dayArg(c, a.fecha) ?? null;
      const r = await insertSimpleTask(taskCtx(c), { title: a.titulo, notes, date, priority: PRIORITY[a.prioridad ?? "media"], categoryId: cat.id });
      if ("error" in r) throw new ToolError(r.error);
      return `Apuntado en BiBuru → ${cat.path}: «${a.titulo}».\nid: ${r.id}\n${link(c, `/tareas/${r.id}`)}`;
    },
  }),

  tool({
    name: "completar_tarea", title: "Completar tarea",
    description: "Marca una tarea como hecha (si se repite, crea la siguiente). Necesita el id (sale en listar_tareas).",
    input: z.object({ id: z.uuid() }),
    async run(c, a) {
      const r = await completeTask(taskCtx(c), a.id);
      if (!r) throw new ToolError("No existe esa tarea en BiBuru.");
      return `Tarea completada.${r.spawnedId ? ` Siguiente repetición creada (id: ${r.spawnedId}).` : ""}`;
    },
  }),

  tool({
    name: "editar_tarea", title: "Editar tarea",
    description: "Cambia una tarea: título, notas (sustituir o añadir al final), fecha, hora, prioridad, proyecto o negocio. Para quitar la fecha/hora/proyecto/negocio pasa «ninguna»/«ninguno».",
    input: z.object({
      id: z.uuid(), titulo: s(300).min(1).optional(), notas: s(10000).optional(), anadir_a_notas: s(4000).optional(),
      fecha: s(40).optional(), hora: s(10).optional(), prioridad: priorityArg, proyecto: s(200).optional(), negocio: s(120).optional(),
    }),
    async run(c, a) {
      const { data: task } = await c.db.from("tasks").select("*").eq("id", a.id).eq("workspace_id", c.workspaceId).maybeSingle();
      if (!task) throw new ToolError("No existe esa tarea en BiBuru.");
      const patch: TaskUpdate = {};
      if (a.titulo) patch.title = a.titulo;
      if (a.notas !== undefined) patch.notes = a.notas || null;
      if (a.anadir_a_notas) patch.notes = `${(a.notas ?? task.notes ?? "").trimEnd()}\n\n${a.anadir_a_notas}`.trim().slice(0, 20000);
      if (a.prioridad) patch.priority = PRIORITY[a.prioridad];
      const bid = await businessArg(c, a.negocio);
      if (bid !== undefined) patch.business_id = bid;
      if (a.proyecto !== undefined) patch.category_id = /^(ninguno|-|)$/i.test(a.proyecto.trim()) ? null : (await ensureCategory(c, a.proyecto)).id;
      const date = dayArg(c, a.fecha);
      const time = timeArg(a.hora);
      if (date !== undefined || time !== undefined) {
        const dueDate = date === undefined ? task.due_date : date;
        if (!dueDate && task.repeat !== "none") throw new ToolError("Una tarea que se repite necesita fecha.");
        const dueTime = dueDate ? (time === undefined ? task.due_time?.slice(0, 5) ?? null : time) : null;
        const at = task.reminder_at ? nowLocal(new Date(task.reminder_at), c.timezone) : null;
        const mode = (task.reminder_mode === "none" && dueTime ? "before" : task.reminder_mode) as ReminderMode;
        patch.due_date = dueDate;
        patch.due_time = dueTime;
        Object.assign(patch, timingColumns(computeTaskTiming({ dueDate, time: dueTime, reminderMode: mode, reminderDate: at?.date ?? null, reminderTime: at?.time ?? null, reminderMinutesBefore: task.reminder_minutes_before ?? 0 }, c.timezone)));
      }
      if (!Object.keys(patch).length) return "No había nada que cambiar.";
      const { error } = await c.db.from("tasks").update(patch).eq("id", a.id).eq("workspace_id", c.workspaceId);
      if (error) throw new Error(error.message);
      return `Tarea actualizada.\n${link(c, `/tareas/${a.id}`)}`;
    },
  }),

  tool({
    name: "crear_nota", title: "Crear nota",
    description: "Guarda una nota (Markdown) en BiBuru: ideas, planes, resúmenes de lo hablado. Opcionalmente en un proyecto (se crea si no existe) o negocio.",
    input: z.object({ titulo: s(200).min(1), contenido: s(50000).min(1), proyecto: s(200).optional(), negocio: s(120).optional() }),
    async run(c, a) {
      const cat = a.proyecto ? await ensureCategory(c, a.proyecto) : null;
      const businessId = await businessArg(c, a.negocio) ?? null;
      const { data, error } = await c.db.from("notes").insert({ workspace_id: c.workspaceId, user_id: c.userId, title: a.titulo, body: a.contenido, category_id: cat?.id ?? null, business_id: businessId }).select("id").single();
      if (error) throw new Error(error.message);
      return `Nota creada: «${a.titulo}»${cat ? ` en ${cat.path}` : ""}.\nid: ${data.id}\n${link(c, `/notas/${data.id}`)}`;
    },
  }),

  tool({
    name: "leer_nota", title: "Leer nota", readOnly: true,
    description: "Lee una nota entera por su id (sale en buscar o ver_proyecto).",
    input: z.object({ id: z.uuid() }),
    async run(c, a) {
      const { data } = await c.db.from("notes").select("title, body, updated_at").eq("id", a.id).eq("workspace_id", c.workspaceId).maybeSingle();
      if (!data) throw new ToolError("No existe esa nota.");
      return `# ${data.title || "Sin título"}\n(actualizada ${formatDate(data.updated_at.slice(0, 10))})\n\n${data.body}`;
    },
  }),

  tool({
    name: "listar_proyectos", title: "Ver proyectos", readOnly: true,
    description: "Árbol de proyectos (categorías con subcategorías) con cuántas tareas abiertas, notas y vídeos tiene cada uno.",
    input: z.object({}),
    async run(c) {
      const cats = await categories(c);
      if (!cats.length) return "Aún no hay proyectos.";
      const ws = c.workspaceId;
      const [v, n, t] = await Promise.all([
        c.db.from("saved_videos").select("category_id").eq("workspace_id", ws).not("category_id", "is", null).limit(10000),
        c.db.from("notes").select("category_id").eq("workspace_id", ws).not("category_id", "is", null).limit(10000),
        c.db.from("tasks").select("category_id").eq("workspace_id", ws).eq("status", "open").not("category_id", "is", null).limit(10000),
      ]);
      const count = (rows: { category_id: string | null }[] | null, ids: Set<string>) => (rows ?? []).filter((r) => ids.has(r.category_id!)).length;
      return flatten(buildTree(cats)).map((node) => {
        const ids = new Set(descendantIds(cats, node.id));
        return `${"  ".repeat(node.depth)}- ${node.pinned ? "📌 " : ""}${node.name} — ${count(t.data, ids)} tareas, ${count(n.data, ids)} notas, ${count(v.data, ids)} vídeos${node.description ? ` · ${node.description.slice(0, 120)}` : ""}`;
      }).join("\n");
    },
  }),

  tool({
    name: "ver_proyecto", title: "Ver un proyecto", readOnly: true,
    description: "Todo lo de un proyecto (y sus subproyectos): descripción, tareas abiertas con sus notas, notas y vídeos guardados con su resumen.",
    input: z.object({ proyecto: s(200).min(1) }),
    async run(c, a) {
      const cats = await categories(c);
      const cat = findCategory(cats, a.proyecto);
      if (!cat) throw new ToolError(`No hay ningún proyecto «${a.proyecto}». Usa listar_proyectos.`);
      const ids = descendantIds(cats, cat.id);
      const ws = c.workspaceId;
      const [tasks, notes, videos] = await Promise.all([
        c.db.from("tasks").select(TASK_COLS).eq("workspace_id", ws).eq("status", "open").in("category_id", ids).order("due_date", { nullsFirst: false }).order("priority", { ascending: false }).limit(60),
        c.db.from("notes").select("id, title, body, updated_at").eq("workspace_id", ws).in("category_id", ids).order("updated_at", { ascending: false }).limit(30),
        c.db.from("saved_videos").select("title, url, summary, status").eq("workspace_id", ws).in("category_id", ids).neq("status", "archivado").order("utility", { ascending: false, nullsFirst: false }).limit(30),
      ]);
      const subs = cats.filter((x) => x.parent_id === cat.id).map((x) => x.name);
      return [
        `# ${pathOf(cats, cat.id)}`, cat.description ? `\n${cat.description}` : "",
        subs.length ? `\nSubproyectos: ${subs.join(", ")}` : "",
        `\n## Tareas abiertas\n${await renderTasks(c, tasks.data ?? [], true)}`,
        `\n## Notas\n${(notes.data ?? []).map((x) => `- ${x.title || x.body.slice(0, 60)} (id: ${x.id})`).join("\n") || "Ninguna."}`,
        `\n## Vídeos\n${(videos.data ?? []).map((x) => `- ${x.title} — ${x.url}${x.summary ? `\n  ${x.summary.slice(0, 280)}` : ""}`).join("\n") || "Ninguno."}`,
        `\n${link(c, `/proyectos/${cat.id}`)}`,
      ].filter(Boolean).join("\n");
    },
  }),

  tool({
    name: "crear_proyecto", title: "Crear proyecto",
    description: `Crea un proyecto (categoría), opcionalmente dentro de otro: nombre «Shopify» dentro_de «Posibles negocios», o la ruta entera «IA${SEP}Agentes».`,
    input: z.object({ nombre: s(200).min(1), dentro_de: s(200).optional(), descripcion: s(2000).optional() }),
    async run(c, a) {
      const path = a.dentro_de ? `${a.dentro_de}${SEP}${a.nombre}` : a.nombre;
      const r = await ensureCategory(c, path, { description: a.descripcion ?? null });
      if (!r.created && a.descripcion) await c.db.from("video_categories").update({ description: a.descripcion }).eq("id", r.id).eq("workspace_id", c.workspaceId);
      return `${r.created ? "Proyecto creado" : "Ya existía el proyecto"}: ${r.path}.\n${link(c, `/proyectos/${r.id}`)}`;
    },
  }),

  tool({
    name: "crear_evento", title: "Crear evento",
    description: "Añade un evento al calendario de BiBuru (cita, reunión…). Sin hora = todo el día.",
    input: z.object({ titulo: s(200).min(1), fecha: s(40), hora: s(10).optional(), hora_fin: s(10).optional(), lugar: s(200).optional(), notas: s(4000).optional(), negocio: s(120).optional() }),
    async run(c, a) {
      const date = dayArg(c, a.fecha);
      if (!date) throw new ToolError("El evento necesita fecha.");
      try {
        const r = await createEvent(actor(c), { title: a.titulo, date, time: timeArg(a.hora) ?? null, end_time: timeArg(a.hora_fin) ?? null, location: a.lugar ?? null, notes: a.notas ?? null, business: a.negocio ?? null });
        return `Evento creado: «${a.titulo}» el ${formatDate(date)}.\n${link(c, r.href)}`;
      } catch (e) { throw new ToolError(e instanceof Error ? e.message : "No se pudo crear el evento"); }
    },
  }),

  tool({
    name: "buscar", title: "Buscar en BiBuru", readOnly: true,
    description: "Busca en notas, tareas, pedidos, gastos y vídeos guardados.",
    input: z.object({ texto: s(200).min(2) }),
    async run(c, a) {
      const { data, error } = await c.db.rpc("search_all", { ws: c.workspaceId, q: a.texto, max_rows: 30 });
      if (error) throw new Error(error.message);
      if (!data?.length) return "Sin resultados.";
      const kind: Record<string, string> = { note: "Nota", task: "Tarea", order: "Pedido", expense: "Gasto", video: "Vídeo" };
      return data.map((r) => `- ${kind[r.kind] ?? r.kind}: ${r.title}${r.happened_on ? ` (${formatDate(r.happened_on)})` : ""} · id: ${r.id}${r.snippet ? `\n  ${r.snippet.replace(/<\/?b>/g, "").slice(0, 200)}` : ""}`).join("\n");
    },
  }),

  tool({
    name: "guardar_video", title: "Guardar vídeo",
    description: "Guarda un vídeo de YouTube o TikTok en Favoritos; BiBuru lo analiza y lo clasifica solo.",
    input: z.object({ enlace: z.url().max(500) }),
    async run(c, a) {
      const r = await addVideoByUrl(actor(c), a.enlace);
      if (!r.ok) throw new ToolError(r.error);
      if (!r.duplicate) analyzeSoon(c.userId, c.workspaceId, r.id);
      return r.duplicate ? "Ese vídeo ya estaba en Favoritos." : `Vídeo guardado; se analizará en unos minutos.\n${link(c, `/favoritos?abrir=${r.id}`)}`;
    },
  }),
];
