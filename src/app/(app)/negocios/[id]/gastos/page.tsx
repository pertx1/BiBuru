import Link from "next/link";
import { Download } from "lucide-react";
import { ExpensesView } from "@/components/expenses/expenses-view";
import { getContext } from "@/lib/context";
import { getExpense, listCategories, listExpenses, PAGE_SIZE } from "@/lib/data";
import { isValidISO, todayISO } from "@/lib/dates";
import { materializeRecurring } from "../../actions";

export const metadata = { title: "Gastos" };

type SP = { categoria?: string; desde?: string; hasta?: string; q?: string; limite?: string; abrir?: string };

export default async function GastosPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  await materializeRecurring(); // genera los gastos recurrentes que toquen hasta hoy
  const { workspaceId } = await getContext();
  const limit = Math.min(Math.max(parseInt(sp.limite ?? "", 10) || PAGE_SIZE, PAGE_SIZE), 2000);
  const from = sp.desde && isValidISO(sp.desde) ? sp.desde : undefined;
  const to = sp.hasta && isValidISO(sp.hasta) ? sp.hasta : undefined;
  const category = sp.categoria && /^[0-9a-f-]{36}$/i.test(sp.categoria) ? sp.categoria : undefined;
  const [expenses, categories, openExpense] = await Promise.all([listExpenses(id, { category, from, to, q: sp.q, limit }), listCategories(), sp.abrir && /^[0-9a-f-]{36}$/i.test(sp.abrir) ? getExpense(id, sp.abrir) : Promise.resolve(null)]);
  const more = new URLSearchParams(Object.entries({ ...sp, limite: String(limit + PAGE_SIZE) }).filter(([, v]) => v) as [string, string][]);

  return (
    <div className="flex flex-col gap-4">
      <form method="get" className="grid grid-cols-2 gap-2 md:grid-cols-5">
        <input name="q" defaultValue={sp.q} placeholder="Buscar concepto o proveedor" aria-label="Buscar" className="col-span-2 min-h-11 rounded-lg border border-border bg-surface px-3 text-base md:min-h-9 md:text-sm" />
        <select name="categoria" defaultValue={category ?? ""} aria-label="Categoría" className="min-h-11 rounded-lg border border-border bg-surface px-3 text-base md:min-h-9 md:text-sm">
          <option value="">Todas las categorías</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input type="date" name="desde" defaultValue={from} aria-label="Desde" className="min-h-11 rounded-lg border border-border bg-surface px-2 text-base md:min-h-9 md:text-sm" />
        <input type="date" name="hasta" defaultValue={to} aria-label="Hasta" className="min-h-11 rounded-lg border border-border bg-surface px-2 text-base md:min-h-9 md:text-sm" />
        <button type="submit" className="col-span-2 min-h-11 rounded-lg border border-border bg-surface text-sm font-medium hover:bg-surface-2 md:col-span-5 md:min-h-9 md:w-32">Filtrar</button>
      </form>
      <ExpensesView businessId={id} workspaceId={workspaceId} expenses={expenses} categories={categories} today={todayISO()} openExpense={openExpense} />
      <div className="flex items-center justify-between text-sm">
        {expenses.length >= limit ? <Link href={`?${more.toString()}`} className="text-accent">Ver más gastos</Link> : <span className="text-muted">{expenses.length} gastos</span>}
        <a href={`/api/export/gastos?negocio=${id}`} className="inline-flex min-h-10 items-center gap-1.5 text-muted hover:text-foreground"><Download className="size-4" aria-hidden /> Exportar CSV</a>
      </div>
    </div>
  );
}
