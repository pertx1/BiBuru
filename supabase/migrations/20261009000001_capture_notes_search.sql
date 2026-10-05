-- BiBuru · Fase 4 · Bandeja de entrada, notas, carpetas, etiquetas y búsqueda global.

-- ------------------------------------------------------------------ carpetas
create table public.folders (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  user_id       uuid not null default auth.uid() references auth.users (id),
  parent_id     uuid,
  name          text not null check (char_length(name) between 1 and 80),
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (id, workspace_id),
  foreign key (parent_id, workspace_id) references public.folders (id, workspace_id) on delete cascade
);
create index folders_parent_idx on public.folders (workspace_id, parent_id);

-- Evita ciclos (una carpeta dentro de sí misma o de una descendiente).
create or replace function public.folders_prevent_cycle()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.parent_id is null then
    return new;
  end if;
  if new.parent_id = new.id then
    raise exception 'Una carpeta no puede estar dentro de sí misma';
  end if;
  if exists (
    with recursive up as (
      select id, parent_id from public.folders where id = new.parent_id
      union all
      select f.id, f.parent_id from public.folders f join up on f.id = up.parent_id
    )
    select 1 from up where id = new.id
  ) then
    raise exception 'Una carpeta no puede moverse dentro de una de sus subcarpetas';
  end if;
  return new;
end;
$$;
create trigger folders_no_cycle before insert or update of parent_id on public.folders
  for each row execute function public.folders_prevent_cycle();

-- -------------------------------------------------------------------- notas
create table public.notes (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  user_id       uuid not null default auth.uid() references auth.users (id),
  business_id   uuid,
  folder_id     uuid,
  title         text not null default '' check (char_length(title) <= 200),
  body          text not null default '' check (char_length(body) <= 200000),   -- Markdown
  pinned        boolean not null default false,
  fts           tsvector generated always as (
                  to_tsvector('spanish', coalesce(title, '') || ' ' || coalesce(body, ''))
                ) stored,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (id, workspace_id),
  foreign key (business_id, workspace_id) references public.businesses (id, workspace_id) on delete set null (business_id),
  foreign key (folder_id, workspace_id) references public.folders (id, workspace_id) on delete set null (folder_id)
);
create index notes_workspace_idx on public.notes (workspace_id, pinned desc, updated_at desc);
create index notes_folder_idx on public.notes (workspace_id, folder_id);
create index notes_fts_idx on public.notes using gin (fts);

-- ---------------------------------------------------------------- etiquetas
create table public.tags (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  user_id       uuid not null default auth.uid() references auth.users (id),
  name          text not null check (char_length(name) between 1 and 40),
  color         text not null default '#64748b' check (color ~ '^#[0-9a-fA-F]{6}$'),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (id, workspace_id)
);
create unique index tags_name_idx on public.tags (workspace_id, lower(name));

-- Etiquetas compartidas por notas, tareas y vídeos (polimórfico; se limpia con triggers).
create table public.taggings (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  user_id       uuid not null default auth.uid() references auth.users (id),
  tag_id        uuid not null,
  item_type     text not null check (item_type in ('note', 'task', 'video')),
  item_id       uuid not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (tag_id, item_type, item_id),
  foreign key (tag_id, workspace_id) references public.tags (id, workspace_id) on delete cascade
);
create index taggings_item_idx on public.taggings (workspace_id, item_type, item_id);

create or replace function public.taggings_cleanup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.taggings where item_type = tg_argv[0] and item_id = old.id;
  return old;
end;
$$;
revoke all on function public.taggings_cleanup() from public, anon, authenticated;
create trigger notes_taggings_cleanup after delete on public.notes for each row execute function public.taggings_cleanup('note');
create trigger tasks_taggings_cleanup after delete on public.tasks for each row execute function public.taggings_cleanup('task');

-- ---------------------------------------------------- bandeja de entrada
create table public.inbox_items (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  user_id       uuid not null default auth.uid() references auth.users (id),
  client_id     uuid not null,                      -- id generado en el dispositivo: hace idempotente el envío offline
  source        text not null default 'text' check (source in ('text', 'voice', 'chat', 'link')),
  raw_text      text not null check (char_length(raw_text) between 1 and 10000),
  status        text not null default 'pending' check (status in ('pending', 'processing', 'proposed', 'accepted', 'discarded')),
  proposal      jsonb,                              -- propuesta de la IA (Fase 6)
  captured_at   timestamptz not null default now(), -- cuándo se apuntó en el dispositivo
  processed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (workspace_id, client_id)
);
create index inbox_status_idx on public.inbox_items (workspace_id, status, captured_at desc);

-- -------------------------------------------------- tareas: carpeta + texto
alter table public.tasks add column folder_id uuid;
alter table public.tasks add constraint tasks_folder_fk foreign key (folder_id, workspace_id)
  references public.folders (id, workspace_id) on delete set null (folder_id);
alter table public.tasks add column fts tsvector generated always as (
  to_tsvector('spanish', coalesce(title, '') || ' ' || coalesce(notes, ''))
) stored;
create index tasks_fts_idx on public.tasks using gin (fts);
create index tasks_folder_idx on public.tasks (folder_id) where folder_id is not null;

-- ------------------------------------------ búsqueda de texto: pedidos y gastos
alter table public.orders add column fts tsvector generated always as (
  to_tsvector('spanish', coalesce(customer, '') || ' ' || coalesce(order_number, '') || ' ' || coalesce(channel, '') || ' ' || coalesce(notes, ''))
) stored;
create index orders_fts_idx on public.orders using gin (fts);

alter table public.order_items add column fts tsvector generated always as (
  to_tsvector('spanish', coalesce(product_name, '') || ' ' || coalesce(color, '') || ' ' || coalesce(size, ''))
) stored;
create index order_items_fts_idx on public.order_items using gin (fts);

alter table public.expenses add column fts tsvector generated always as (
  to_tsvector('spanish', coalesce(concept, '') || ' ' || coalesce(supplier, '') || ' ' || coalesce(payment_method, ''))
) stored;
create index expenses_fts_idx on public.expenses using gin (fts);

select public.apply_workspace_policies(t) from unnest(array['folders','notes','tags','taggings','inbox_items']) as t;

-- ---------------------------------------------------------- búsqueda global
-- "gaz ujue" -> 'gaz':* & 'ujue':*   (prefijos, para buscar mientras se escribe).
create or replace function public.prefix_tsquery(q text)
returns tsquery
language plpgsql
immutable
set search_path = ''
as $$
declare
  terms text[];
begin
  select array_agg(t || ':*') into terms
  from regexp_split_to_table(lower(coalesce(q, '')), '[^[:alnum:]áéíóúüñ]+') as t
  where char_length(t) >= 1;
  if terms is null then
    return null;
  end if;
  return to_tsquery('spanish', array_to_string(terms, ' & '));
exception when others then
  return null;
end;
$$;

-- Notas, tareas, pedidos y gastos (los vídeos se añaden en la Fase 7). security invoker: RLS aplica.
create or replace function public.search_all(ws uuid, q text, max_rows integer default 30)
returns table (kind text, id uuid, business_id uuid, title text, snippet text, rank real, happened_on date)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  tsq tsquery := public.prefix_tsquery(q);
  lim integer := least(greatest(max_rows, 1), 100);
begin
  if tsq is null then
    return;
  end if;
  return query
  select * from (
    select 'note'::text, n.id, n.business_id,
           coalesce(nullif(n.title, ''), left(n.body, 60)),
           ts_headline('spanish', n.body, tsq, 'MaxFragments=1,MaxWords=18,MinWords=6,ShortWord=2'),
           ts_rank(n.fts, tsq), n.updated_at::date
    from public.notes n where n.workspace_id = ws and n.fts @@ tsq
    union all
    select 'task', t.id, t.business_id, t.title,
           case when t.notes is null then '' else ts_headline('spanish', t.notes, tsq, 'MaxFragments=1,MaxWords=18,MinWords=6,ShortWord=2') end,
           ts_rank(t.fts, tsq), t.due_date
    from public.tasks t where t.workspace_id = ws and t.fts @@ tsq
    union all
    select 'order', o.id, o.business_id,
           coalesce(o.customer, 'Pedido ' || o.order_number, 'Pedido'),
           coalesce((select string_agg(i.quantity || '× ' || i.product_name, ', ') from public.order_items i where i.order_id = o.id), ''),
           ts_rank(o.fts, tsq), o.order_date
    from public.orders o where o.workspace_id = ws and o.fts @@ tsq
    union all
    select 'order', o.id, o.business_id,
           coalesce(o.customer, 'Pedido ' || o.order_number, 'Pedido'),
           i.quantity || '× ' || i.product_name,
           ts_rank(i.fts, tsq), o.order_date
    from public.order_items i join public.orders o on o.id = i.order_id
    where i.workspace_id = ws and i.fts @@ tsq
    union all
    select 'expense', e.id, e.business_id, coalesce(e.concept, e.supplier, 'Gasto'),
           coalesce(e.supplier, ''), ts_rank(e.fts, tsq), e.expense_date
    from public.expenses e where e.workspace_id = ws and e.fts @@ tsq
  ) r(kind, id, business_id, title, snippet, rank, happened_on)
  order by rank desc, happened_on desc nulls last
  limit lim;
end;
$$;
revoke execute on function public.search_all(uuid, text, integer) from public, anon;
grant execute on function public.search_all(uuid, text, integer) to authenticated;
revoke execute on function public.prefix_tsquery(text) from public, anon;
grant execute on function public.prefix_tsquery(text) to authenticated;
