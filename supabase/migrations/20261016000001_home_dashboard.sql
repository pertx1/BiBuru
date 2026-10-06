-- BiBuru · Inicio personalizable: preferencias de interfaz por usuario y serie diaria para los gráficos.

-- Preferencias de interfaz (una fila por usuario y espacio). Son personales, como los dispositivos de avisos:
-- aunque se comparta el espacio, cada persona tiene su propio Inicio y su propia barra inferior.
create table public.user_ui_prefs (
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  home_widgets  jsonb check (home_widgets is null or (jsonb_typeof(home_widgets) = 'array' and jsonb_array_length(home_widgets) <= 60)),
  mobile_tabs   text[] check (mobile_tabs is null or cardinality(mobile_tabs) <= 4),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (user_id, workspace_id)
);
create trigger user_ui_prefs_set_updated_at before update on public.user_ui_prefs
  for each row execute function public.set_updated_at();
alter table public.user_ui_prefs enable row level security;
revoke all on public.user_ui_prefs from anon, authenticated;
grant select, insert, update, delete on public.user_ui_prefs to authenticated;
create policy user_ui_prefs_own on public.user_ui_prefs for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.is_workspace_member(workspace_id));

-- Serie diaria (misma lógica que stats_monthly: pedidos no cancelados + ingresos sueltos; gastos).
-- Sirve para los gráficos de 7 y 30 días de Inicio.
create or replace function public.stats_daily(
  ws uuid, p_from date, p_to date, p_business uuid default null)
returns table (day date, income_cents bigint, expense_cents bigint, orders_count bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  with days as (
    select generate_series(p_from, p_to, interval '1 day')::date as day
  ), o as (
    select order_date as day, sum(total_cents) as v, count(*) as n
    from public.orders
    where workspace_id = ws and status <> 'cancelado' and order_date between p_from and p_to
      and (p_business is null or business_id = p_business)
    group by 1
  ), i as (
    select income_date as day, sum(amount_cents) as v
    from public.incomes
    where workspace_id = ws and income_date between p_from and p_to
      and (p_business is null or business_id = p_business)
    group by 1
  ), e as (
    select expense_date as day, sum(amount_cents) as v
    from public.expenses
    where workspace_id = ws and expense_date between p_from and p_to
      and (p_business is null or business_id = p_business)
    group by 1
  )
  select d.day,
         (coalesce(o.v, 0) + coalesce(i.v, 0))::bigint,
         coalesce(e.v, 0)::bigint,
         coalesce(o.n, 0)::bigint
  from days d
  left join o on o.day = d.day
  left join i on i.day = d.day
  left join e on e.day = d.day
  where p_to - p_from <= 400   -- tope: como mucho ~13 meses de días
  order by d.day;
$$;
revoke all on function public.stats_daily(uuid, date, date, uuid) from public, anon;
grant execute on function public.stats_daily(uuid, date, date, uuid) to authenticated;
