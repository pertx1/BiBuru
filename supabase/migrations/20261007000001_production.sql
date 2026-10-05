-- BiBuru · Fase 2B · Módulo de producción (portado de PROFITY): stock de prendas y DTF,
-- reglas de color, bolsa para la imprenta, facturas (enlaces) y conexión con Antola.
-- Se activa por negocio (businesses.production_enabled).

-- Helper reutilizable: aplica trigger updated_at, RLS y permisos estándar a una tabla de datos.
create or replace function public.apply_workspace_policies(tbl text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', tbl || '_set_updated_at', tbl);
  execute format('alter table public.%I enable row level security', tbl);
  execute format('revoke all on public.%I from anon, authenticated', tbl);
  execute format('grant select, insert, update, delete on public.%I to authenticated', tbl);
  execute format('create policy %I on public.%I for select to authenticated using (public.is_workspace_member(workspace_id))', tbl || '_select', tbl);
  execute format('create policy %I on public.%I for insert to authenticated with check (public.is_workspace_member(workspace_id) and user_id = (select auth.uid()))', tbl || '_insert', tbl);
  execute format('create policy %I on public.%I for update to authenticated using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id))', tbl || '_update', tbl);
  execute format('create policy %I on public.%I for delete to authenticated using (public.is_workspace_member(workspace_id))', tbl || '_delete', tbl);
end;
$$;
revoke all on function public.apply_workspace_policies(text) from public, anon, authenticated;

alter table public.businesses add column production_enabled boolean not null default false;

-- Plantilla de columnas comunes en cada tabla nueva (workspace, autor, negocio, fechas).
create table public.tshirt_stocks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id),
  business_id uuid not null,
  model text not null check (char_length(model) between 1 and 40),      -- p. ej. "Blanca", "Sudadera negra"
  size text not null check (char_length(size) between 1 and 10),
  quantity integer not null default 0,                                   -- stock base (antes de restar pedidos)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, model, size),
  foreign key (business_id, workspace_id) references public.businesses (id, workspace_id) on delete cascade
);

create table public.dtf_designs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id),
  business_id uuid not null,
  name text not null check (char_length(name) between 1 and 60),
  -- standalone: una sola variante (no depende del color de prenda); paired: versión blanco y negro.
  kind text not null default 'paired' check (kind in ('standalone', 'paired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, name),
  foreign key (business_id, workspace_id) references public.businesses (id, workspace_id) on delete cascade
);

create table public.dtf_stocks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id),
  business_id uuid not null,
  name text not null check (char_length(name) between 1 and 60),
  variant text not null check (variant in ('UNICO', 'BLANCO', 'NEGRO')),
  quantity integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, name, variant),
  foreign key (business_id, workspace_id) references public.businesses (id, workspace_id) on delete cascade
);

create table public.shirt_dtf_rules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id),
  business_id uuid not null,
  shirt_color text not null check (char_length(shirt_color) between 1 and 40),
  shirt_color_key text not null,
  dtf_color text not null check (char_length(dtf_color) between 1 and 40),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, shirt_color_key),
  foreign key (business_id, workspace_id) references public.businesses (id, workspace_id) on delete cascade
);

create table public.design_dtf_rules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id),
  business_id uuid not null,
  design text not null check (char_length(design) between 1 and 60),
  dtf_color text not null check (char_length(dtf_color) between 1 and 40),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, design),
  foreign key (business_id, workspace_id) references public.businesses (id, workspace_id) on delete cascade
);

create table public.print_bag_checks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id),
  business_id uuid not null,
  key text not null check (char_length(key) between 1 and 300),
  quantity integer not null check (quantity >= 0),                       -- cantidad al marcar (detecta cambios)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, key),
  foreign key (business_id, workspace_id) references public.businesses (id, workspace_id) on delete cascade
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id),
  business_id uuid not null,
  name text not null check (char_length(name) between 1 and 80),
  url text not null check (char_length(url) <= 2000 and url ~* '^https?://'),
  external_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (business_id, workspace_id) references public.businesses (id, workspace_id) on delete cascade
);
create unique index invoices_external_idx on public.invoices (workspace_id, external_id) where external_id is not null;

-- Claves de acceso para integraciones externas (Antola). Solo se guarda el hash SHA-256.
create table public.api_tokens (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id),
  business_id uuid not null,
  kind text not null check (kind in ('antola')),
  token_hash text not null unique check (char_length(token_hash) = 64),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, kind),
  foreign key (business_id, workspace_id) references public.businesses (id, workspace_id) on delete cascade
);

select public.apply_workspace_policies(t) from unnest(array[
  'tshirt_stocks','dtf_designs','dtf_stocks','shirt_dtf_rules','design_dtf_rules','print_bag_checks','invoices','api_tokens'
]) as t;

create index tshirt_stocks_business_idx on public.tshirt_stocks (workspace_id, business_id);
create index dtf_stocks_business_idx on public.dtf_stocks (workspace_id, business_id);
create index invoices_business_idx on public.invoices (workspace_id, business_id);

-- Foto instantánea para Antola: devuelve lo necesario para calcular «Pedir ya» a quien presente
-- una clave válida (su hash). Es la única función que puede llamar un usuario sin sesión.
create or replace function public.antola_snapshot(p_hash text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  t record;
begin
  select * into t from public.api_tokens where token_hash = p_hash and kind = 'antola';
  if not found then
    return null;
  end if;
  return jsonb_build_object(
    'designs', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'kind', kind)) from public.dtf_designs where business_id = t.business_id), '[]'::jsonb),
    'tshirt_stocks', coalesce((select jsonb_agg(jsonb_build_object('model', model, 'size', size, 'quantity', quantity)) from public.tshirt_stocks where business_id = t.business_id), '[]'::jsonb),
    'dtf_stocks', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'variant', variant, 'quantity', quantity)) from public.dtf_stocks where business_id = t.business_id), '[]'::jsonb),
    'shirt_rules', coalesce((select jsonb_agg(jsonb_build_object('shirt_color_key', shirt_color_key, 'dtf_color', dtf_color)) from public.shirt_dtf_rules where business_id = t.business_id), '[]'::jsonb),
    'design_rules', coalesce((select jsonb_agg(jsonb_build_object('design', design, 'dtf_color', dtf_color)) from public.design_dtf_rules where business_id = t.business_id), '[]'::jsonb),
    'pending_items', coalesce((
      select jsonb_agg(jsonb_build_object('product_name', i.product_name, 'color', i.color, 'size', i.size, 'quantity', i.quantity))
      from public.orders o join public.order_items i on i.order_id = o.id
      where o.business_id = t.business_id and o.status in ('sin_hacer', 'sin_llegar')
    ), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.antola_snapshot(text) from public;
grant execute on function public.antola_snapshot(text) to anon, authenticated;
