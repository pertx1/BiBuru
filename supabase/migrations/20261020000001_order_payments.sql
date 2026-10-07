-- BiBuru · Pedidos: cobros y estado de pago (independiente del estado del pedido). Solo añade.

-- Los pedidos que ya existen quedan «sin revisar» (no cuentan como deuda); los nuevos nacen revisados.
alter table public.orders add column payment_reviewed boolean not null default false;
alter table public.orders alter column payment_reviewed set default true;
-- Suma de los cobros (la mantiene un trigger) y lo que queda por cobrar (0 si está sin revisar o cancelado).
alter table public.orders add column paid_cents bigint not null default 0 check (paid_cents >= 0);
alter table public.orders add column due_cents bigint generated always as (
  case when payment_reviewed and status <> 'cancelado' then greatest(total_cents - paid_cents, 0) else 0 end
) stored;
create index orders_due_idx on public.orders (workspace_id, business_id) where due_cents > 0;

create table public.order_payments (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  order_id     uuid not null,
  paid_on      date not null,
  amount_cents bigint not null check (amount_cents > 0 and amount_cents <= 100000000),
  method       text not null default 'otro' check (method in ('bizum', 'efectivo', 'transferencia', 'tarjeta', 'otro')),
  note         text check (note is null or char_length(note) <= 300),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  foreign key (order_id, workspace_id) references public.orders (id, workspace_id) on delete cascade
);
create index order_payments_order_idx on public.order_payments (order_id);
create index order_payments_ws_date_idx on public.order_payments (workspace_id, paid_on);
select public.apply_workspace_policies('order_payments');

-- Mantiene orders.paid_cents = suma de sus cobros. Registrar un cobro marca el pedido como revisado.
create or replace function public.refresh_order_paid()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  oid uuid := coalesce(new.order_id, old.order_id);
begin
  update public.orders o
     set paid_cents = coalesce((select sum(p.amount_cents) from public.order_payments p where p.order_id = oid), 0),
         payment_reviewed = case when tg_op = 'INSERT' then true else o.payment_reviewed end
   where o.id = oid;
  if tg_op = 'UPDATE' and old.order_id is distinct from new.order_id then
    update public.orders o set paid_cents = coalesce((select sum(p.amount_cents) from public.order_payments p where p.order_id = old.order_id), 0) where o.id = old.order_id;
  end if;
  return null;
end;
$$;
create trigger order_payments_refresh_paid after insert or update or delete on public.order_payments
  for each row execute function public.refresh_order_paid();

-- Cobrado (por fecha de cobro) frente a pendiente (por mes del pedido), mes a mes.
create or replace function public.stats_collections(ws uuid, p_from date, p_to date, p_business uuid default null)
returns table (month date, collected_cents bigint, pending_cents bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  with months as (
    select generate_series(date_trunc('month', p_from)::date, date_trunc('month', p_to)::date, interval '1 month')::date as month
  ), c as (
    select date_trunc('month', p.paid_on)::date as month, sum(p.amount_cents) as v
    from public.order_payments p join public.orders o on o.id = p.order_id
    where p.workspace_id = ws and p.paid_on between p_from and p_to and (p_business is null or o.business_id = p_business)
    group by 1
  ), d as (
    select date_trunc('month', order_date)::date as month, sum(due_cents) as v
    from public.orders
    where workspace_id = ws and order_date between p_from and p_to and due_cents > 0 and (p_business is null or business_id = p_business)
    group by 1
  )
  select m.month, coalesce(c.v, 0)::bigint, coalesce(d.v, 0)::bigint
  from months m left join c on c.month = m.month left join d on d.month = m.month
  order by m.month;
$$;
