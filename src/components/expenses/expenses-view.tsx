"use client";

import { Paperclip, Plus, Repeat } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import type { Category, Expense } from "@/lib/data";
import { formatDate } from "@/lib/dates";
import { formatEUR } from "@/lib/money";
import { CategoriesManager } from "./categories-manager";
import { ExpenseForm } from "./expense-form";

export function ExpensesView({ businessId, workspaceId, expenses, categories, today }: { businessId: string; workspaceId: string; expenses: Expense[]; categories: Category[]; today: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Expense | "new" | null>(null);
  const close = () => { setEditing(null); router.refresh(); };

  return (
    <>
      <div className="mb-3 flex flex-wrap gap-2">
        <Button onClick={() => setEditing("new")}><Plus className="size-4" aria-hidden /> Nuevo gasto</Button>
        <CategoriesManager categories={categories} />
      </div>
      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
        {expenses.map((e) => (
          <li key={e.id}>
            <button type="button" onClick={() => setEditing(e)} className="flex min-h-14 w-full items-center justify-between gap-3 px-4 py-2 text-left hover:bg-surface-2">
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-sm font-medium">{e.concept ?? e.supplier ?? "Gasto"}</span>
                <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
                  {formatDate(e.expense_date)}
                  {e.expense_categories && <Badge color={e.expense_categories.color}>{e.expense_categories.name}</Badge>}
                  {(e.recurrence || e.recurring_parent_id) && <Repeat className="size-3.5" aria-label="Recurrente" />}
                  {e.attachment_path && <Paperclip className="size-3.5" aria-label="Con ticket" />}
                </span>
              </span>
              <span className="shrink-0 text-sm font-semibold tabular-nums">−{formatEUR(e.amount_cents)}</span>
            </button>
          </li>
        ))}
        {expenses.length === 0 && <li className="p-6 text-center text-sm text-muted">No hay gastos con estos filtros. Pulsa «Nuevo gasto» para apuntar el primero.</li>}
      </ul>
      <Sheet open={editing !== null} onClose={close} title={editing === "new" ? "Nuevo gasto" : "Editar gasto"}>
        {editing !== null && (
          <ExpenseForm key={editing === "new" ? "new" : editing.id} businessId={businessId} workspaceId={workspaceId} expense={editing === "new" ? null : editing} categories={categories} today={today} onDone={close} />
        )}
      </Sheet>
    </>
  );
}
