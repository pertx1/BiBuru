-- BiBuru · Stock que falta: mínimos, artículos genéricos (materiales y productos), movimientos y tareas de reposición.
-- Solo añade. El stock de prendas y DTF de Producción ya existía (tshirt_stocks / dtf_stocks): se reutiliza.

-- Stock mínimo en lo que ya existía.
alter table public.tshirt_stocks add column min_quantity integer not null default 0 check (min_quantity between 0 and 100000);
alter table public.dtf_stocks add column min_quantity integer not null default 0 check (min_quantity between 0 and 100000);

-- Artículos genéricos por negocio (bolsas, etiquetas, productos terminados…). El vínculo con pedidos es opcional:
-- por producto del catálogo (product_id) o por nombre, y si se indica, solo las líneas de ese color/talla.
create table public.stock_items (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  user_id       uuid not null default auth.uid() references auth.users (id),
  business_id   uuid not null,
  name          text not null check (char_length(name) between 1 and 80),
  variant       text not null default '' check (char_length(variant) <= 60),   -- texto libre: «Negra M», «10×15»…
  product_id    uuid,
  match_color   text check (match_color is null or char_length(match_color) <= 40),
  match_size    text check (match_size is null or char_length(match_size) <= 20),
  quantity      integer not null default 0 check (quantity between -100000 and 1000000),  -- lo que tienes (antes de pedidos)
  min_quantity  integer not null default 0 check (min_quantity between 0 and 100000),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (business_id, name, variant),
  unique (id, workspace_id),
  foreign key (business_id, workspace_id) references public.businesses (id, workspace_id) on delete cascade,
  foreign key (product_id, workspace_id) references public.products (id, workspace_id) on delete set null (product_id)
);
create index stock_items_business_idx on public.stock_items (workspace_id, business_id);
select public.apply_workspace_policies('stock_items');

-- Movimientos: entradas, salidas y ajustes (histórico; el stock se guarda en cada tabla).
create table public.stock_movements (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  user_id       uuid not null default auth.uid() references auth.users (id),
  business_id   uuid not null,
  item_key      text not null check (char_length(item_key) between 1 and 200),   -- tshirt|modelo|talla · dtf|diseño|variante · item|<id>
  label         text not null check (char_length(label) between 1 and 200),
  kind          text not null check (kind in ('entrada', 'salida', 'ajuste')),
  delta         integer not null check (delta <> 0 and abs(delta) <= 1000000),
  reason        text check (reason is null or char_length(reason) <= 200),
  moved_on      date not null default current_date,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  foreign key (business_id, workspace_id) references public.businesses (id, workspace_id) on delete cascade
);
create index stock_movements_business_idx on public.stock_movements (workspace_id, business_id, created_at desc);
select public.apply_workspace_policies('stock_movements');

-- Tareas de reposición: una sola abierta por artículo y variante (la crea y mantiene la app).
alter table public.tasks add column stock_key text check (stock_key is null or char_length(stock_key) <= 200);
alter table public.tasks add column stock_missing integer check (stock_missing is null or stock_missing >= 0);
create unique index tasks_stock_open_idx on public.tasks (workspace_id, business_id, stock_key) where stock_key is not null and status = 'open';
