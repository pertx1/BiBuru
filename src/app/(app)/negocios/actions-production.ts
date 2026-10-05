"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getContext } from "@/lib/context";
import { colorKey, DEFAULT_SIZES, SIZES } from "@/lib/production/text";
import { dtfVariantsFor } from "@/lib/production/stock";
import type { ActionResult } from "@/lib/schemas";

const uuid = z.uuid();
const name = (max = 60) => z.string().trim().min(1, "Escribe un nombre").max(max);
const refresh = () => revalidatePath("/negocios", "layout");

function err(op: string, e: { message: string; code?: string }): ActionResult {
  console.error(`[production] ${op}:`, e.message);
  if (e.code === "23505") return { ok: false, error: "Eso ya existe." };
  return { ok: false, error: "No se pudo guardar. Inténtalo de nuevo." };
}
const bad = (e: z.ZodError): ActionResult => ({ ok: false, error: e.issues[0]?.message ?? "Datos no válidos" });

// ------------------------------------------------------------------- stock base
export async function adjustTshirtStock(input: { businessId: string; model: string; size: string; delta: number }): Promise<ActionResult> {
  const p = z.object({ businessId: uuid, model: name(40), size: z.enum(SIZES), delta: z.number().int().min(-10_000).max(10_000) }).safeParse(input);
  if (!p.success) return bad(p.error);
  const { supabase, workspaceId, userId } = await getContext();
  const { businessId, model, size, delta } = p.data;
  const { data: cur } = await supabase.from("tshirt_stocks").select("id, quantity").eq("business_id", businessId).eq("model", model).eq("size", size).maybeSingle();
  const { error } = cur
    ? await supabase.from("tshirt_stocks").update({ quantity: cur.quantity + delta }).eq("id", cur.id)
    : await supabase.from("tshirt_stocks").insert({ workspace_id: workspaceId, user_id: userId, business_id: businessId, model, size, quantity: delta });
  if (error) return err("tshirt.adjust", error);
  refresh();
  return { ok: true };
}

export async function adjustDtfStock(input: { businessId: string; name: string; variant: "UNICO" | "BLANCO" | "NEGRO"; delta: number }): Promise<ActionResult> {
  const p = z.object({ businessId: uuid, name: name(), variant: z.enum(["UNICO", "BLANCO", "NEGRO"]), delta: z.number().int().min(-10_000).max(10_000) }).safeParse(input);
  if (!p.success) return bad(p.error);
  const { supabase, workspaceId, userId } = await getContext();
  const { businessId, name: n, variant, delta } = p.data;
  const { data: cur } = await supabase.from("dtf_stocks").select("id, quantity").eq("business_id", businessId).eq("name", n).eq("variant", variant).maybeSingle();
  const { error } = cur
    ? await supabase.from("dtf_stocks").update({ quantity: cur.quantity + delta }).eq("id", cur.id)
    : await supabase.from("dtf_stocks").insert({ workspace_id: workspaceId, user_id: userId, business_id: businessId, name: n, variant, quantity: delta });
  if (error) return err("dtf.adjust", error);
  refresh();
  return { ok: true };
}

// --------------------------------------------------------------------- catálogo
export async function addModel(businessId: string, modelName: string): Promise<ActionResult> {
  const p = z.object({ businessId: uuid, modelName: name(40) }).safeParse({ businessId, modelName });
  if (!p.success) return bad(p.error);
  const { supabase, workspaceId, userId } = await getContext();
  const { error } = await supabase.from("tshirt_stocks").upsert(
    DEFAULT_SIZES.map((size) => ({ workspace_id: workspaceId, user_id: userId, business_id: businessId, model: p.data.modelName, size, quantity: 0 })),
    { onConflict: "business_id,model,size", ignoreDuplicates: true },
  );
  if (error) return err("model.add", error);
  refresh();
  return { ok: true };
}

export async function removeModel(businessId: string, model: string): Promise<ActionResult> {
  const p = z.object({ businessId: uuid, model: name(40) }).safeParse({ businessId, model });
  if (!p.success) return bad(p.error);
  const { supabase, workspaceId } = await getContext();
  const { error } = await supabase.from("tshirt_stocks").delete().eq("workspace_id", workspaceId).eq("business_id", businessId).eq("model", model);
  if (error) return err("model.remove", error);
  refresh();
  return { ok: true };
}

export async function addDesign(businessId: string, designName: string, kind: "standalone" | "paired"): Promise<ActionResult> {
  const p = z.object({ businessId: uuid, designName: name(), kind: z.enum(["standalone", "paired"]) }).safeParse({ businessId, designName, kind });
  if (!p.success) return bad(p.error);
  const { supabase, workspaceId, userId } = await getContext();
  const base = { workspace_id: workspaceId, user_id: userId, business_id: businessId };
  const { error } = await supabase.from("dtf_designs").insert({ ...base, name: p.data.designName, kind });
  if (error) return err("design.add", error);
  const { error: e2 } = await supabase.from("dtf_stocks").upsert(
    dtfVariantsFor(kind).map((variant) => ({ ...base, name: p.data.designName, variant, quantity: 0 })),
    { onConflict: "business_id,name,variant", ignoreDuplicates: true },
  );
  if (e2) return err("design.stock", e2);
  refresh();
  return { ok: true };
}

export async function removeDesign(businessId: string, designName: string): Promise<ActionResult> {
  const p = z.object({ businessId: uuid, designName: name() }).safeParse({ businessId, designName });
  if (!p.success) return bad(p.error);
  const { supabase, workspaceId } = await getContext();
  const f = (t: "dtf_designs" | "dtf_stocks" | "design_dtf_rules", col: string) =>
    supabase.from(t).delete().eq("workspace_id", workspaceId).eq("business_id", businessId).eq(col, p.data.designName);
  const results = await Promise.all([f("dtf_stocks", "name"), f("design_dtf_rules", "design"), f("dtf_designs", "name")]);
  const failed = results.find((r) => r.error);
  if (failed?.error) return err("design.remove", failed.error);
  refresh();
  return { ok: true };
}

// ----------------------------------------------------------------------- reglas
export async function saveShirtRule(input: { businessId: string; shirtColor: string; dtfColor: string }): Promise<ActionResult> {
  const p = z.object({ businessId: uuid, shirtColor: name(40), dtfColor: name(40) }).safeParse(input);
  if (!p.success) return bad(p.error);
  const { supabase, workspaceId, userId } = await getContext();
  const { error } = await supabase.from("shirt_dtf_rules").upsert(
    { workspace_id: workspaceId, user_id: userId, business_id: p.data.businessId, shirt_color: p.data.shirtColor, shirt_color_key: colorKey(p.data.shirtColor), dtf_color: p.data.dtfColor },
    { onConflict: "business_id,shirt_color_key" },
  );
  if (error) return err("shirtRule.save", error);
  refresh();
  return { ok: true };
}

export async function saveDesignRule(input: { businessId: string; design: string; dtfColor: string }): Promise<ActionResult> {
  const p = z.object({ businessId: uuid, design: name(), dtfColor: name(40) }).safeParse(input);
  if (!p.success) return bad(p.error);
  const { supabase, workspaceId, userId } = await getContext();
  const { error } = await supabase.from("design_dtf_rules").upsert(
    { workspace_id: workspaceId, user_id: userId, business_id: p.data.businessId, design: p.data.design, dtf_color: p.data.dtfColor },
    { onConflict: "business_id,design" },
  );
  if (error) return err("designRule.save", error);
  refresh();
  return { ok: true };
}

export async function deleteRule(kind: "shirt" | "design", id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "Regla no válida" };
  const { supabase, workspaceId } = await getContext();
  const { error } = await supabase.from(kind === "shirt" ? "shirt_dtf_rules" : "design_dtf_rules").delete().eq("id", id).eq("workspace_id", workspaceId);
  if (error) return err("rule.delete", error);
  refresh();
  return { ok: true };
}

// ---------------------------------------------------------------------- bolsa
export async function togglePrintBagLine(input: { businessId: string; key: string; quantity: number; checked: boolean }): Promise<ActionResult> {
  const p = z.object({ businessId: uuid, key: z.string().min(1).max(300), quantity: z.number().int().min(0), checked: z.boolean() }).safeParse(input);
  if (!p.success) return bad(p.error);
  const { supabase, workspaceId, userId } = await getContext();
  const { businessId, key, quantity, checked } = p.data;
  const { error } = checked
    ? await supabase.from("print_bag_checks").upsert({ workspace_id: workspaceId, user_id: userId, business_id: businessId, key, quantity }, { onConflict: "business_id,key" })
    : await supabase.from("print_bag_checks").delete().eq("workspace_id", workspaceId).eq("business_id", businessId).eq("key", key);
  if (error) return err("bag.toggle", error);
  refresh();
  return { ok: true };
}

export async function resetPrintBag(businessId: string): Promise<ActionResult> {
  if (!uuid.safeParse(businessId).success) return { ok: false, error: "Negocio no válido" };
  const { supabase, workspaceId } = await getContext();
  const { error } = await supabase.from("print_bag_checks").delete().eq("workspace_id", workspaceId).eq("business_id", businessId);
  if (error) return err("bag.reset", error);
  refresh();
  return { ok: true };
}

// --------------------------------------------------------------------- facturas
const invoiceSchema = z.object({ id: uuid.optional(), businessId: uuid, name: name(80), url: z.url("Introduce un enlace válido (https://…)").max(2000).refine((u) => /^https?:\/\//i.test(u), "Solo enlaces http(s)") });

export async function saveInvoice(input: z.input<typeof invoiceSchema>): Promise<ActionResult> {
  const p = invoiceSchema.safeParse(input);
  if (!p.success) return bad(p.error);
  const { supabase, workspaceId, userId } = await getContext();
  const { id, businessId, name: n, url } = p.data;
  const { error } = id
    ? await supabase.from("invoices").update({ name: n, url }).eq("id", id).eq("workspace_id", workspaceId)
    : await supabase.from("invoices").insert({ workspace_id: workspaceId, user_id: userId, business_id: businessId, name: n, url });
  if (error) return err("invoice.save", error);
  refresh();
  return { ok: true };
}

export async function deleteInvoice(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "Factura no válida" };
  const { supabase, workspaceId } = await getContext();
  const { error } = await supabase.from("invoices").delete().eq("id", id).eq("workspace_id", workspaceId);
  if (error) return err("invoice.delete", error);
  refresh();
  return { ok: true };
}

// ----------------------------------------------------------------------- Antola
/** Genera una clave nueva (la anterior deja de valer). Se devuelve una sola vez; en base de datos solo su hash. */
export async function createAntolaToken(businessId: string): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  if (!uuid.safeParse(businessId).success) return { ok: false, error: "Negocio no válido" };
  const { supabase, workspaceId, userId } = await getContext();
  const token = `pf_${randomBytes(32).toString("base64url")}`;
  const hash = createHash("sha256").update(token).digest("hex");
  const del = await supabase.from("api_tokens").delete().eq("workspace_id", workspaceId).eq("business_id", businessId).eq("kind", "antola");
  if (del.error) return { ok: false, error: "No se pudo generar la clave" };
  const { error } = await supabase.from("api_tokens").insert({ workspace_id: workspaceId, user_id: userId, business_id: businessId, kind: "antola", token_hash: hash });
  if (error) { console.error("[production] token:", error.message); return { ok: false, error: "No se pudo generar la clave" }; }
  refresh();
  return { ok: true, token };
}

export async function revokeAntolaToken(businessId: string): Promise<ActionResult> {
  if (!uuid.safeParse(businessId).success) return { ok: false, error: "Negocio no válido" };
  const { supabase, workspaceId } = await getContext();
  const { error } = await supabase.from("api_tokens").delete().eq("workspace_id", workspaceId).eq("business_id", businessId).eq("kind", "antola");
  if (error) return err("token.revoke", error);
  refresh();
  return { ok: true };
}
