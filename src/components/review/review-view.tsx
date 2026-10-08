import { AtSign, CalendarDays, Mail, Music2 } from "lucide-react";
import Link from "next/link";
import { Delta } from "@/components/home/widget-card";
import { formatEUR, marginPct } from "@/lib/money";
import type { ReviewData, Totals } from "@/lib/review/build";
import { periodLabel } from "@/lib/review/period";
import { More, PrioritiesForm, ReviewAi, ReviewedButton, ReviewReceivables, ReviewTasks } from "./review-client";

function Card({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="rounded-xl bg-surface p-4">
      <header className="mb-2 flex items-center justify-between gap-2"><h2 className="text-sm font-semibold">{title}</h2>{action}</header>
      {children}
    </section>
  );
}

function Money({ label, t, prev, prevLabel }: { label: string; t: Totals; prev?: Totals; prevLabel?: string }) {
  const m = marginPct(t.profit, t.income);
  const cell = (name: string, cur: number, before?: number, goodUp = true) => (
    <div className="rounded-lg bg-fill p-3">
      <p className="text-xs text-muted">{name}</p>
      <p className="text-lg font-bold tabular-nums">{formatEUR(cur)}</p>
      {before !== undefined && <Delta current={cur} previous={before} goodWhenUp={goodUp} />}
    </div>
  );
  return (
    <div>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">{label}{prevLabel ? ` · frente a la ${prevLabel}` : ""}</p>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {cell("Ingresos", t.income, prev?.income)}
        {cell("Gastos", t.expense, prev?.expense, false)}
        {cell("Beneficio", t.profit, prev?.profit)}
        <div className="rounded-lg bg-fill p-3"><p className="text-xs text-muted">Margen · pedidos</p><p className="text-lg font-bold tabular-nums">{m === null ? "—" : `${m.toLocaleString("es-ES")} %`}</p><p className="text-xs text-muted">{t.orders} pedidos</p></div>
      </div>
    </div>
  );
}

const ICON = { correo: Mail, instagram: AtSign, tiktok: Music2 };

/**
 * Una revisión: cifras reales (las mismas funciones que Estadísticas) y puntos que se pueden tocar sin salir:
 * completar o posponer tareas, marcar un pedido como cobrado, abrir un correo o un mensaje. Al final, «Revisado».
 */
export function ReviewView({ data: d, id, reviewedAt, aiSummary, aiConfigured, historic, businessName }: {
  data: ReviewData; id: string | null; reviewedAt: string | null; aiSummary: string | null; aiConfigured: boolean; historic: boolean; businessName: string | null;
}) {
  const daily = d.kind === "diaria", weekly = d.kind === "semanal", monthly = d.kind === "mensual";
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted first-letter:uppercase">
        {periodLabel(d)}{businessName ? ` · ${businessName}` : ""}{historic ? ` · foto del ${new Date(d.generatedAt).toLocaleDateString("es-ES", { timeZone: "Europe/Madrid" })}` : ""}
      </p>

      <Card title="Dinero">
        <div className="flex flex-col gap-4">
          <Money label={d.money.curLabel} t={d.money.cur} prev={daily ? undefined : d.money.prev} prevLabel={d.money.prevLabel} />
          {d.monthToDate && <Money label="Lo que llevas de mes" t={d.monthToDate} />}
        </div>
      </Card>

      {monthly && d.expensesByCategory.length > 0 && (
        <Card title="Gastos por categoría">
          <ul className="flex flex-col gap-2 text-sm">
            {d.expensesByCategory.map((c) => <li key={c.label} className="flex justify-between gap-2"><span className="truncate">{c.label}</span><span className="tabular-nums">{formatEUR(c.amount)}</span></li>)}
          </ul>
        </Card>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        <Card title={daily ? `Pedidos nuevos · ${d.orders.count}` : `Pedidos · ${d.orders.count}`}>
          {d.orders.latest.length === 0 ? <p className="text-sm text-muted">Ningún pedido nuevo.</p> : (
            <ul className="flex flex-col divide-y divide-border text-sm">
              {d.orders.latest.map((o) => <li key={o.id}><Link href={`/negocios/${o.businessId}/pedidos?abrir=${o.id}`} className="flex min-h-11 items-center justify-between gap-2"><span className="truncate">{o.label}</span><span className="tabular-nums">{formatEUR(o.totalCents)}</span></Link></li>)}
            </ul>
          )}
          {!daily && d.orders.topProducts.length > 0 && (
            <>
              <p className="mb-1 mt-3 text-xs font-medium uppercase tracking-wide text-muted">Más vendidos</p>
              <ol className="flex flex-col gap-1 text-sm">{d.orders.topProducts.map((p, i) => <li key={p.label} className="flex justify-between gap-2"><span className="truncate">{i + 1}. {p.label}</span><span className="shrink-0 tabular-nums text-muted">{p.units} ud · {formatEUR(p.revenue)}</span></li>)}</ol>
            </>
          )}
        </Card>
        <Card title={`Pendiente de cobro · ${formatEUR(d.receivable.totalCents)}`}>
          <ReviewReceivables orders={d.receivable.list} />
        </Card>
      </div>

      {daily ? (
        <div className="grid gap-3 md:grid-cols-2">
          <Card title={`Tareas de hoy · ${d.tasks.today.length}`} action={<More href="/tareas" label="Tareas" />}><ReviewTasks tasks={d.tasks.today} empty="Nada para hoy." /></Card>
          <Card title={`Atrasadas · ${d.tasks.overdue.length}`}><ReviewTasks tasks={d.tasks.overdue} empty="Nada atrasado. 👌" showDate /></Card>
          <Card title={`Sin fecha · ${d.tasks.noDateTotal}`} action={d.tasks.noDateTotal > d.tasks.noDate.length ? <More href="/tareas?f=sinfecha" /> : undefined}><ReviewTasks tasks={d.tasks.noDate} empty="No hay tareas sin fecha." /></Card>
        </div>
      ) : (
        <Card title="Tareas">
          <div className="mb-3 grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-fill p-3"><p className="text-xs text-muted">Completadas</p><p className="text-lg font-bold tabular-nums text-good">{d.tasks.done}</p></div>
            <div className="rounded-lg bg-fill p-3"><p className="text-xs text-muted">Pendientes</p><p className="text-lg font-bold tabular-nums">{d.tasks.open}</p></div>
          </div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">Las que llevan más tiempo sin hacerse</p>
          <ReviewTasks tasks={d.tasks.oldest} empty="Nada pendiente." showDate />
        </Card>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        <Card title={daily ? "Eventos de hoy y mañana" : weekly ? "La semana que viene" : "El mes que empieza"} action={<More href="/calendario" label="Calendario" />}>
          {d.events.length === 0 ? <p className="text-sm text-muted">Nada en el calendario.</p> : (
            <ul className="flex flex-col gap-1.5 text-sm">
              {d.events.slice(0, 12).map((e, i) => (
                <li key={`${e.id}-${e.date}-${i}`} className="flex gap-2"><CalendarDays className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
                  <span className="w-24 shrink-0 tabular-nums text-muted">{e.date.slice(8, 10)}/{e.date.slice(5, 7)}{e.time ? ` ${e.time}` : ""}</span><span className="min-w-0 truncate">{e.title}</span></li>
              ))}
            </ul>
          )}
        </Card>
        <Card title={`Sin responder · ${d.inbox.mail + d.inbox.social}`}>
          <p className="mb-2 text-xs text-muted">{d.inbox.mail} correos · {d.inbox.social} mensajes y comentarios</p>
          {d.inbox.items.length > 0 && (
            <ul className="flex flex-col divide-y divide-border text-sm">
              {d.inbox.items.map((i) => { const Icon = ICON[i.channel]; return (
                <li key={i.key}><Link href={i.href} className="flex min-h-11 items-center gap-2"><Icon className="size-4 shrink-0 text-muted" aria-hidden /><span className="truncate"><span className="font-medium">{i.person}</span> <span className="text-muted">{i.preview}</span></span></Link></li>
              ); })}
            </ul>
          )}
        </Card>
      </div>

      <Card title={`Stock que falta · ${d.stock.length}`}>
        {d.stock.length === 0 ? <p className="text-sm text-muted">No falta nada. 🎉</p> : (
          <ul className="flex flex-col divide-y divide-border text-sm">
            {d.stock.map((s) => <li key={s.taskId}><Link href={s.businessId ? `/negocios/${s.businessId}/stock` : `/tareas/${s.taskId}`} className="flex min-h-11 items-center">{s.title}</Link></li>)}
          </ul>
        )}
      </Card>

      {!daily && d.social && (
        <Card title={`Redes · ${d.social.gained >= 0 ? "+" : ""}${d.social.gained} seguidores`}>
          <ul className="flex flex-col divide-y divide-border text-sm">
            {d.social.accounts.map((a) => <li key={a.username + a.platform} className="flex min-h-10 items-center justify-between gap-2"><span className="truncate">{a.platform === "tiktok" ? "TikTok" : "Instagram"} · @{a.username}</span><span className="tabular-nums">{a.now ?? "—"}{a.gained != null && <span className={a.gained >= 0 ? "ml-2 text-good" : "ml-2 text-bad"}>{a.gained >= 0 ? "+" : ""}{a.gained}</span>}</span></li>)}
          </ul>
          {d.social.best && <p className="mt-2 text-sm"><span className="text-muted">Mejor publicación: </span>{d.social.best.permalink ? <a href={d.social.best.permalink} target="_blank" rel="noopener noreferrer" className="text-accent underline">{d.social.best.caption || "(sin texto)"}</a> : d.social.best.caption} · {d.social.best.interactions} interacciones</p>}
        </Card>
      )}

      {!daily && d.goals && d.goals.length > 0 && (
        <Card title="Objetivos" action={<More href="/objetivos" />}>
          <ul className="flex flex-col gap-2.5">
            {d.goals.map((g) => (
              <li key={g.id}><Link href={`/objetivos/${g.id}`} className="block text-sm">
                <span className="flex justify-between gap-2"><span className="truncate">{g.title}</span><span className="tabular-nums">{g.pct} %</span></span>
                <span className="mt-1 block h-2 overflow-hidden rounded-full bg-surface-2"><span className="block h-full rounded-full bg-accent" style={{ width: `${Math.min(100, g.pct)}%` }} /></span>
              </Link></li>
            ))}
          </ul>
        </Card>
      )}

      {weekly && id && <Card title="Tus 3 prioridades para la semana que viene"><PrioritiesForm id={id} initial={d.priorities} /></Card>}

      {id && <Card title="Resumen con IA (opcional)"><ReviewAi id={id} initial={aiSummary} configured={aiConfigured} /></Card>}
      {id && <ReviewedButton id={id} reviewedAt={reviewedAt} />}
    </div>
  );
}
