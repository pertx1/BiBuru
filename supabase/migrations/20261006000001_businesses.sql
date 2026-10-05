-- BiBuru · Fase 2 · Negocios, productos, pedidos, gastos e ingresos.
-- Importes en céntimos enteros. Fechas contables como `date` (sin zona horaria).
-- Todas las tablas: id, user_id (autor), workspace_id (pertenencia), created_at, updated_at.

-- ----------------------------------------------------------------- negocios
create table public.businesses (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  user_id       uuid not null default auth.uid() references auth.users (id),
  name          text not null check (char_length(name) between 1 and 60),
  description   text check (description is null or char_length(description) <= 500),
  color         text not null default '#0f766e' check (color ~ '^#[0-9a-fA-F]{6}$'),
  icon          text not null default 'briefcase' check (char_length(icon) <= 30),
  archived      boolean not null default false,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (id, workspace_id)
);
create index businesses_workspace_idx on public.businesses (workspace_id, archived, sort_order);

-- ----------------------------------------------- categorías de gasto (editables)
create table public.expense_categories (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  user_id       uuid not null default auth.uid() references auth.users (id),
  name          text not null check (char_length(name) between 1 and 60),
  color         text not null default '#64748b' check (color ~ '^#[0-9a-fA-F]{6}$'),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (id, workspace_id),
  unique (workspace_id, name)
);

-- ---------------------------------------------------------------- productos
create table public.products (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  user_id       uuid not null default auth.uid() references auth.users (id),
  business_id   uuid not null,
  name          text not null check (char_length(name) between 1 and 80),
  cost_cents    integer not null default 0 check (cost_cents >= 0),
  price_cents   integer not null default 0 check (price_cents >= 0),
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (id, workspace_id),
  unique (business_id, name),
  foreign key (business_id, workspace_id) references public.businesses (id, workspace_id) on delete cascade
);
create index products_business_idx on public.products (workspace_id, business_id);

-- ------------------------------------------------------------------ pedidos
-- Campos de PROFITY conservados: número de pedido, fecha, estado, y por línea
-- modelo (product_name), color, talla, cantidad y precio.
create table public.orders (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  user_id       uuid not null default auth.uid() references auth.users (id),
  business_id   uuid not null,
  order_number  text check (order_number is null or char_length(order_number) <= 40),
  order_date    date not null default current_date,
  customer      text check (customer is null or char_length(customer) <= 120),
  channel       text check (channel is null or char_length(channel) <= 60),
  status        text not null default 'sin_hacer'
                check (status in ('sin_hacer','en_casa','en_paquete','enviado','sin_llegar','cancelado')),
  notes         text check (notes is null or char_length(notes) <= 2000),
  -- Totales desnormalizados (los mantiene un trigger) para listar y agregar rápido.
  total_cents   bigint not null default 0,
  cost_cents    bigint not null default 0,
  external_id   text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (id, workspace_id),
  foreign key (business_id, workspace_id) references public.businesses (id, workspace_id) on delete cascade
);
create index orders_business_date_idx on public.orders (workspace_id, business_id, order_date desc);
create index orders_status_idx on public.orders (workspace_id, business_id, status);
create unique index orders_external_idx on public.orders (workspace_id, external_id) where external_id is not null;

create table public.order_items (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references public.workspaces (id) on delete cascade,
  user_id          uuid not null default auth.uid() references auth.users (id),
  order_id         uuid not null,
  product_id       uuid references public.products (id) on delete set null,
  product_name     text not null check (char_length(product_name) between 1 and 80),
  color            text check (color is null or char_length(color) <= 40),
  size             text check (size is null or char_length(size) <= 20),
  quantity         integer not null default 1 check (quantity > 0),
  unit_price_cents integer not null default 0 check (unit_price_cents >= 0),
  unit_cost_cents  integer not null default 0 check (unit_cost_cents >= 0),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  foreign key (order_id, workspace_id) references public.orders (id, workspace_id) on delete cascade
);
create index order_items_order_idx on public.order_items (order_id);
create index order_items_stats_idx on public.order_items (workspace_id, product_name);

create or replace function public.refresh_order_totals()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  oid uuid;
begin
  oid := coalesce(new.order_id, old.order_id);
  update public.orders o
  set total_cents = coalesce(s.total, 0), cost_cents = coalesce(s.cost, 0)
  from (
    select sum(quantity::bigint * unit_price_cents) as total,
           sum(quantity::bigint * unit_cost_cents)  as cost
    from public.order_items where order_id = oid
  ) s
  where o.id = oid;
  return null;
end;
$$;
create trigger order_items_refresh_totals
  after insert or update or delete on public.order_items
  for each row execute function public.refresh_order_totals();

-- ------------------------------------------------------------------- gastos
-- Campos de PROFITY: fecha, categoría, concepto, importe, método de pago.
create table public.expenses (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspaces (id) on delete cascade,
  user_id        uuid not null default auth.uid() references auth.users (id),
  business_id    uuid not null,
  expense_date   date not null default current_date,
  concept        text check (concept is null or char_length(concept) <= 120),
  category_id    uuid references public.expense_categories (id) on delete set null,
  amount_cents   integer not null check (amount_cents > 0),
  supplier       text check (supplier is null or char_length(supplier) <= 120),
  payment_method text check (payment_method is null or char_length(payment_method) <= 40),
  -- Recurrencia: la fila "plantilla" tiene `recurrence`; las generadas apuntan a ella.
  recurrence     text check (recurrence in ('weekly','monthly','yearly')),
  recurrence_end date,
  recurring_parent_id uuid references public.expenses (id) on delete set null,
  attachment_path text,
  external_id    text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (id, workspace_id),
  foreign key (business_id, workspace_id) references public.businesses (id, workspace_id) on delete cascade
);
create index expenses_business_date_idx on public.expenses (workspace_id, business_id, expense_date desc);
create index expenses_category_idx on public.expenses (category_id);
create unique index expenses_external_idx on public.expenses (workspace_id, external_id) where external_id is not null;
create unique index expenses_recurring_unique on public.expenses (recurring_parent_id, expense_date)
  where recurring_parent_id is not null;

-- ----------------------------------------------------------------- ingresos
-- Ingresos que no son pedidos (PROFITY: Income). Campos: fecha, fuente, concepto, importe, método.
create table public.incomes (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspaces (id) on delete cascade,
  user_id        uuid not null default auth.uid() references auth.users (id),
  business_id    uuid not null,
  income_date    date not null default current_date,
  source         text not null check (char_length(source) between 1 and 60),
  concept        text check (concept is null or char_length(concept) <= 120),
  amount_cents   integer not null check (amount_cents > 0),
  method         text check (method is null or char_length(method) <= 40),
  external_id    text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (id, workspace_id),
  foreign key (business_id, workspace_id) references public.businesses (id, workspace_id) on delete cascade
);
create index incomes_business_date_idx on public.incomes (workspace_id, business_id, income_date desc);
create unique index incomes_external_idx on public.incomes (workspace_id, external_id) where external_id is not null;

-- ----------------------------------------------------- updated_at + RLS + permisos
do $$
declare
  t text;
begin
  foreach t in array array['businesses','expense_categories','products','orders','order_items','expenses','incomes']
  loop
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', t || '_set_updated_at', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_workspace_member(workspace_id))', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.is_workspace_member(workspace_id) and user_id = (select auth.uid()))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id))', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.is_workspace_member(workspace_id))', t || '_delete', t);
  end loop;
end $$;

-- ------------------------------------------- categorías de gasto por defecto
create or replace function public.seed_default_expense_categories(ws uuid, uid uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.expense_categories (workspace_id, user_id, name, color) values
    (ws, uid, 'Materiales',  '#0f766e'),
    (ws, uid, 'Producción',  '#7c3aed'),
    (ws, uid, 'Envíos',      '#d97706'),
    (ws, uid, 'Marketing',   '#db2777'),
    (ws, uid, 'Software',    '#2563eb'),
    (ws, uid, 'Impuestos',   '#dc2626'),
    (ws, uid, 'Otros',       '#64748b')
  on conflict (workspace_id, name) do nothing;
$$;
revoke all on function public.seed_default_expense_categories(uuid, uuid) from public, anon, authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ws_id uuid;
begin
  insert into public.workspaces (owner_id, name) values (new.id, 'Personal') returning id into ws_id;
  insert into public.workspace_members (workspace_id, user_id, role) values (ws_id, new.id, 'owner');
  insert into public.profiles (user_id, default_workspace_id, display_name)
    values (new.id, ws_id, split_part(new.email, '@', 1));
  perform public.seed_default_expense_categories(ws_id, new.id);
  return new;
end;
$$;

-- Usuarios que ya existían antes de esta migración.
select public.seed_default_expense_categories(w.id, w.owner_id) from public.workspaces w;

-- ------------------------------------------------ gastos recurrentes (idempotente)
-- Genera las apariciones de las plantillas recurrentes hasta `up_to` (hoy por defecto).
-- Se llama al abrir Gastos y, desde la Fase 5, por el cron. Seguro de repetir.
create or replace function public.materialize_recurring_expenses(ws uuid, up_to date default current_date)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  t record;
  d date;
  step interval;
  n integer := 0;
  inserted integer;
begin
  for t in
    select * from public.expenses
    where workspace_id = ws and recurrence is not null and recurring_parent_id is null
  loop
    step := case t.recurrence when 'weekly' then interval '7 days'
                              when 'monthly' then interval '1 month'
                              else interval '1 year' end;
    -- Se avanza desde la fecha de la plantilla multiplicando el paso (evita derivar
    -- el día 31 -> 28 -> 28 en meses cortos).
    for i in 1..600 loop
      d := (t.expense_date + step * i)::date;
      exit when d > up_to or (t.recurrence_end is not null and d > t.recurrence_end);
      insert into public.expenses
        (workspace_id, user_id, business_id, expense_date, concept, category_id, amount_cents,
         supplier, payment_method, recurring_parent_id)
      values
        (ws, t.user_id, t.business_id, d, t.concept, t.category_id, t.amount_cents,
         t.supplier, t.payment_method, t.id)
      on conflict (recurring_parent_id, expense_date) where recurring_parent_id is not null do nothing;
      get diagnostics inserted = row_count;
      n := n + inserted;
    end loop;
  end loop;
  return n;
end;
$$;
grant execute on function public.materialize_recurring_expenses(uuid, date) to authenticated;

-- ------------------------------------------------------- estadísticas (agregadas en SQL)
-- Todas son `security invoker`: RLS se aplica con el usuario que llama.
-- Ingresos = pedidos no cancelados + ingresos sueltos. Beneficio = ingresos - gastos
-- (misma definición que PROFITY; el coste unitario es solo informativo).
create or replace function public.stats_totals(
  ws uuid, p_from date, p_to date, p_business uuid default null)
returns table (business_id uuid, income_cents bigint, expense_cents bigint, orders_count bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  with o as (
    select business_id, sum(total_cents) as inc, count(*) as n
    from public.orders
    where workspace_id = ws and status <> 'cancelado'
      and order_date between p_from and p_to
      and (p_business is null or business_id = p_business)
    group by business_id
  ), i as (
    select business_id, sum(amount_cents) as inc
    from public.incomes
    where workspace_id = ws and income_date between p_from and p_to
      and (p_business is null or business_id = p_business)
    group by business_id
  ), e as (
    select business_id, sum(amount_cents) as exp
    from public.expenses
    where workspace_id = ws and expense_date between p_from and p_to
      and (p_business is null or business_id = p_business)
    group by business_id
  )
  select b.id,
         coalesce(o.inc, 0) + coalesce(i.inc, 0),
         coalesce(e.exp, 0),
         coalesce(o.n, 0)
  from public.businesses b
  left join o on o.business_id = b.id
  left join i on i.business_id = b.id
  left join e on e.business_id = b.id
  where b.workspace_id = ws and (p_business is null or b.id = p_business);
$$;

create or replace function public.stats_monthly(
  ws uuid, p_from date, p_to date, p_business uuid default null)
returns table (month date, income_cents bigint, expense_cents bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  with months as (
    select generate_series(date_trunc('month', p_from)::date, date_trunc('month', p_to)::date, interval '1 month')::date as month
  ), o as (
    select date_trunc('month', order_date)::date as month, sum(total_cents) as v
    from public.orders
    where workspace_id = ws and status <> 'cancelado' and order_date between p_from and p_to
      and (p_business is null or business_id = p_business)
    group by 1
  ), i as (
    select date_trunc('month', income_date)::date as month, sum(amount_cents) as v
    from public.incomes
    where workspace_id = ws and income_date between p_from and p_to
      and (p_business is null or business_id = p_business)
    group by 1
  ), e as (
    select date_trunc('month', expense_date)::date as month, sum(amount_cents) as v
    from public.expenses
    where workspace_id = ws and expense_date between p_from and p_to
      and (p_business is null or business_id = p_business)
    group by 1
  )
  select m.month, coalesce(o.v, 0) + coalesce(i.v, 0), coalesce(e.v, 0)
  from months m
  left join o on o.month = m.month
  left join i on i.month = m.month
  left join e on e.month = m.month
  order by m.month;
$$;

-- group_by: 'product' | 'size' (producto + talla) | 'color'
create or replace function public.stats_top_products(
  ws uuid, p_from date, p_to date, p_business uuid default null,
  group_by text default 'product', max_rows integer default 8)
returns table (label text, units bigint, revenue_cents bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    case group_by
      when 'size'  then case when oi.size is null then oi.product_name else oi.product_name || ' · ' || oi.size end
      when 'color' then coalesce(oi.color, 'Sin especificar')
      else oi.product_name end as label,
    sum(oi.quantity)::bigint as units,
    sum(oi.quantity::bigint * oi.unit_price_cents) as revenue_cents
  from public.order_items oi
  join public.orders o on o.id = oi.order_id and o.workspace_id = oi.workspace_id
  where o.workspace_id = ws and o.status <> 'cancelado'
    and o.order_date between p_from and p_to
    and (p_business is null or o.business_id = p_business)
    and (group_by <> 'color' or oi.color is not null)
  group by 1
  order by units desc, revenue_cents desc
  limit greatest(max_rows, 1);
$$;

create or replace function public.stats_expenses_by_category(
  ws uuid, p_from date, p_to date, p_business uuid default null, max_rows integer default 8)
returns table (label text, color text, amount_cents bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(c.name, 'Sin categoría'), coalesce(c.color, '#64748b'), sum(e.amount_cents)::bigint
  from public.expenses e
  left join public.expense_categories c on c.id = e.category_id
  where e.workspace_id = ws and e.expense_date between p_from and p_to
    and (p_business is null or e.business_id = p_business)
  group by 1, 2
  order by 3 desc
  limit greatest(max_rows, 1);
$$;

grant execute on function
  public.stats_totals(uuid, date, date, uuid),
  public.stats_monthly(uuid, date, date, uuid),
  public.stats_top_products(uuid, date, date, uuid, text, integer),
  public.stats_expenses_by_category(uuid, date, date, uuid, integer)
to authenticated;
revoke execute on function
  public.stats_totals(uuid, date, date, uuid),
  public.stats_monthly(uuid, date, date, uuid),
  public.stats_top_products(uuid, date, date, uuid, text, integer),
  public.stats_expenses_by_category(uuid, date, date, uuid, integer),
  public.materialize_recurring_expenses(uuid, date)
from anon, public;
grant execute on function
  public.stats_totals(uuid, date, date, uuid),
  public.stats_monthly(uuid, date, date, uuid),
  public.stats_top_products(uuid, date, date, uuid, text, integer),
  public.stats_expenses_by_category(uuid, date, date, uuid, integer),
  public.materialize_recurring_expenses(uuid, date)
to authenticated;

-- ---------------------------------------------------- adjuntos (fotos de tickets)
-- Bucket privado. Ruta: <workspace_id>/<business_id>/<archivo>.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 3145728, array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do nothing;

create policy receipts_select on storage.objects for select to authenticated
  using (bucket_id = 'receipts' and public.is_workspace_member(((storage.foldername(name))[1])::uuid));
create policy receipts_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts' and public.is_workspace_member(((storage.foldername(name))[1])::uuid));
create policy receipts_update on storage.objects for update to authenticated
  using (bucket_id = 'receipts' and public.is_workspace_member(((storage.foldername(name))[1])::uuid));
create policy receipts_delete on storage.objects for delete to authenticated
  using (bucket_id = 'receipts' and public.is_workspace_member(((storage.foldername(name))[1])::uuid));
