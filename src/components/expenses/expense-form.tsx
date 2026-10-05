"use client";

import { Paperclip, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { deleteExpense, saveExpense } from "@/app/(app)/negocios/actions";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import type { Category, Expense } from "@/lib/data";
import { formatDecimal } from "@/lib/money";
import { receiptUrl, uploadReceipt } from "@/lib/receipts";

export function expenseToPayload(e: Expense): Record<string, string | undefined> {
  return {
    id: e.id, business_id: e.business_id, expense_date: e.expense_date, concept: e.concept ?? undefined,
    category_id: e.category_id ?? undefined, amount: formatDecimal(e.amount_cents), supplier: e.supplier ?? undefined,
    payment_method: e.payment_method ?? undefined, recurrence: e.recurrence ?? undefined,
    recurrence_end: e.recurrence_end ?? undefined, attachment_path: e.attachment_path ?? undefined,
  };
}

export function ExpenseForm({
  businessId, workspaceId, expense, categories, today, onDone,
}: { businessId: string; workspaceId: string; expense: Expense | null; categories: Category[]; today: string; onDone: () => void }) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [attachment, setAttachment] = useState<string | undefined>(expense?.attachment_path ?? undefined);
  const [uploading, setUploading] = useState(false);
  const [recurrence, setRecurrence] = useState<string>(expense?.recurrence ?? "");
  const isGenerated = !!expense?.recurring_parent_id;

  async function onFile(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      setAttachment(await uploadReceipt(file, workspaceId, businessId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo subir el ticket");
    } finally {
      setUploading(false);
    }
  }

  function submit(fd: FormData) {
    const payload: Record<string, string | undefined> = {
      id: expense?.id, business_id: businessId, expense_date: String(fd.get("expense_date")),
      concept: String(fd.get("concept") ?? ""), category_id: String(fd.get("category_id") ?? ""),
      amount: String(fd.get("amount") ?? ""), supplier: String(fd.get("supplier") ?? ""),
      payment_method: String(fd.get("payment_method") ?? ""), recurrence: isGenerated ? "" : recurrence,
      recurrence_end: String(fd.get("recurrence_end") ?? ""), attachment_path: attachment,
    };
    start(async () => {
      const r = await saveExpense(payload);
      if (r.ok) onDone();
      else setError(r.error);
    });
  }

  function remove() {
    if (!expense) return;
    const snapshot = expenseToPayload(expense);
    start(async () => {
      const r = await deleteExpense(expense.id);
      if (!r.ok) return setError(r.error);
      onDone();
      toast({ message: "Gasto eliminado", actionLabel: "Deshacer", onAction: () => void saveExpense(snapshot) });
    });
  }

  return (
    <form action={submit} className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Importe (€)" htmlFor="e-amount"><Input id="e-amount" name="amount" inputMode="decimal" placeholder="0,00" defaultValue={expense ? formatDecimal(expense.amount_cents) : ""} required autoFocus={!expense} /></Field>
        <Field label="Fecha" htmlFor="e-date"><Input id="e-date" name="expense_date" type="date" defaultValue={expense?.expense_date ?? today} required /></Field>
        <Field label="Concepto" htmlFor="e-concept" className="col-span-2"><Input id="e-concept" name="concept" defaultValue={expense?.concept ?? ""} maxLength={120} autoComplete="off" /></Field>
        <Field label="Categoría" htmlFor="e-cat">
          <Select id="e-cat" name="category_id" defaultValue={expense?.category_id ?? ""}>
            <option value="">Sin categoría</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label="Método de pago" htmlFor="e-pay"><Input id="e-pay" name="payment_method" defaultValue={expense?.payment_method ?? ""} maxLength={40} placeholder="Tarjeta, Bizum…" /></Field>
        <Field label="Proveedor" htmlFor="e-sup" className="col-span-2"><Input id="e-sup" name="supplier" defaultValue={expense?.supplier ?? ""} maxLength={120} /></Field>
      </div>

      {!isGenerated && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="¿Se repite?" htmlFor="e-rec" hint="Se generará solo en cada fecha.">
            <Select id="e-rec" value={recurrence} onChange={(e) => setRecurrence(e.target.value)}>
              <option value="">No</option><option value="weekly">Cada semana</option><option value="monthly">Cada mes</option><option value="yearly">Cada año</option>
            </Select>
          </Field>
          {recurrence && <Field label="Hasta (opcional)" htmlFor="e-end"><Input id="e-end" name="recurrence_end" type="date" defaultValue={expense?.recurrence_end ?? ""} /></Field>}
        </div>
      )}
      {isGenerated && <p className="text-xs text-muted">Este gasto se generó automáticamente a partir de uno recurrente.</p>}

      <div className="flex flex-wrap items-center gap-3">
        <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-border px-3 text-sm hover:bg-surface-2 md:min-h-9">
          <Paperclip className="size-4" aria-hidden />
          {uploading ? "Subiendo…" : attachment ? "Cambiar ticket" : "Foto del ticket"}
          <input type="file" accept="image/*,application/pdf" capture="environment" className="sr-only" onChange={(e) => void onFile(e.target.files?.[0])} />
        </label>
        {attachment && (
          <>
            <button type="button" className="text-sm text-accent underline" onClick={async () => { const u = await receiptUrl(attachment); if (u) window.open(u, "_blank", "noopener"); }}>Ver ticket</button>
            <button type="button" className="text-sm text-muted hover:text-danger" onClick={() => setAttachment(undefined)}>Quitar</button>
          </>
        )}
      </div>

      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending || uploading} className="flex-1">{pending ? "Guardando…" : "Guardar gasto"}</Button>
        {expense && <Button type="button" variant="secondary" onClick={remove} disabled={pending}><Trash2 className="size-4" aria-hidden /> Eliminar</Button>}
      </div>
    </form>
  );
}
