-- BiBuru · Fase 7 · Favoritos: vídeos guardados, categorías, integración con YouTube y cola de análisis.

alter table public.profiles
  add column video_long_minutes integer not null default 20 check (video_long_minutes between 1 and 600);  -- por encima, no se analiza sin confirmar

-- ---------------------------------------------------------------- categorías
create table public.video_categories (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  user_id       uuid not null default auth.uid() references auth.users (id),
  name          text not null check (char_length(name) between 1 and 60),
  pinned        boolean not null default false,       -- «fijada»: la IA la reutiliza y no se funde sola
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (id, workspace_id)
);
create unique index video_categories_name_idx on public.video_categories (workspace_id, lower(name));

-- ---------------------------------------------------------------- vídeos
create table public.saved_videos (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces (id) on delete cascade,
  user_id         uuid not null default auth.uid() references auth.users (id),
  source          text not null check (source in ('youtube', 'tiktok', 'other')),
  external_id     text check (external_id is null or char_length(external_id) <= 80),   -- id de YouTube / de TikTok
  url             text not null check (char_length(url) <= 2000),
  title           text not null default '' check (char_length(title) <= 300),
  channel         text check (channel is null or char_length(channel) <= 200),
  thumbnail_url   text check (thumbnail_url is null or char_length(thumbnail_url) <= 2000),
  duration_sec    integer check (duration_sec is null or duration_sec >= 0),
  published_at    timestamptz,
  added_via       text not null default 'manual' check (added_via in ('manual', 'youtube_like', 'youtube_playlist')),
  origin_list     text check (origin_list is null or char_length(origin_list) <= 200),
  status          text not null default 'por_ver' check (status in ('por_ver', 'visto', 'aplicado', 'archivado')),
  -- Cola de análisis: pending → analyzing → ready | error | needs_confirm (vídeo largo; espera confirmación)
  analysis_status text not null default 'pending' check (analysis_status in ('pending', 'analyzing', 'ready', 'error', 'needs_confirm')),
  analysis_mode   text check (analysis_mode in ('video', 'light', 'text')),
  analysis_attempts integer not null default 0,
  analysis_next_try_at timestamptz,
  analysis_error  text check (analysis_error is null or char_length(analysis_error) <= 300),
  analysis_cost_micros bigint not null default 0,
  summary         text check (summary is null or char_length(summary) <= 4000),
  key_points      jsonb not null default '[]'::jsonb,
  actions         jsonb not null default '[]'::jsonb,   -- ideas accionables
  utility         smallint check (utility between 1 and 5),
  category_id     uuid,
  business_id     uuid,
  business_reason text check (business_reason is null or char_length(business_reason) <= 500),
  notes           text check (notes is null or char_length(notes) <= 5000),
  fts             tsvector generated always as (
                    to_tsvector('spanish', coalesce(title, '') || ' ' || coalesce(channel, '') || ' ' || coalesce(summary, ''))
                  ) stored,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (id, workspace_id),
  foreign key (category_id, workspace_id) references public.video_categories (id, workspace_id) on delete set null (category_id),
  foreign key (business_id, workspace_id) references public.businesses (id, workspace_id) on delete set null (business_id)
);
-- Sin duplicados: el mismo vídeo (por id) o la misma URL solo una vez por espacio.
create unique index saved_videos_external_idx on public.saved_videos (workspace_id, source, external_id) where external_id is not null;
create unique index saved_videos_url_idx on public.saved_videos (workspace_id, url);
create index saved_videos_list_idx on public.saved_videos (workspace_id, status, created_at desc);
create index saved_videos_queue_idx on public.saved_videos (analysis_next_try_at) where analysis_status = 'pending';
create index saved_videos_fts_idx on public.saved_videos using gin (fts);

select public.apply_workspace_policies(t) from unnest(array['video_categories', 'saved_videos']) as t;
create trigger saved_videos_taggings_cleanup after delete on public.saved_videos for each row execute function public.taggings_cleanup('video');

-- ---------------------------------------------------------------- integraciones (credenciales personales)
-- Excepción deliberada a la regla «por espacio»: un token de Google es de UNA persona, no se comparte con el equipo.
-- El token se guarda cifrado (AES-256-GCM) por el servidor; la base nunca ve el valor en claro.
create table public.integrations (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references public.workspaces (id) on delete cascade,
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  provider         text not null check (provider in ('google')),
  account_email    text check (account_email is null or char_length(account_email) <= 200),
  refresh_token_enc text not null,
  scopes           text,
  sync_likes       boolean not null default true,
  sync_playlists   jsonb not null default '[]'::jsonb,       -- [{id, title}] elegidas por la persona
  last_sync_at     timestamptz,
  last_sync_error  text check (last_sync_error is null or char_length(last_sync_error) <= 300),
  last_sync_added  integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (user_id, provider)
);
alter table public.integrations enable row level security;
create policy integrations_select on public.integrations for select to authenticated using (user_id = (select auth.uid()));
create policy integrations_update on public.integrations for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy integrations_delete on public.integrations for delete to authenticated using (user_id = (select auth.uid()));
-- Sin política de insert: el alta la hace solo el servidor (clave de servicio) tras el OAuth.
-- El token cifrado no debe poder leerse desde el navegador: se retira el permiso de columna.
-- Permisos explícitos (no dependen de los privilegios por defecto de Supabase): leer columnas seguras, cambiar qué se
-- sincroniza y desconectar. Sin insert: el alta la hace solo el servidor.
revoke all on public.integrations from anon, authenticated;
grant delete on public.integrations to authenticated;
grant select (id, workspace_id, user_id, provider, account_email, scopes, sync_likes, sync_playlists, last_sync_at, last_sync_error, last_sync_added, created_at, updated_at) on public.integrations to authenticated;
grant update (sync_likes, sync_playlists) on public.integrations to authenticated;
create trigger integrations_set_updated_at before update on public.integrations for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- búsqueda: añade vídeos
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
    union all
    select 'video', v.id, v.business_id, coalesce(nullif(v.title, ''), v.url),
           coalesce(case when v.summary is null then v.channel else ts_headline('spanish', v.summary, tsq, 'MaxFragments=1,MaxWords=18,MinWords=6,ShortWord=2') end, ''),
           ts_rank(v.fts, tsq), v.created_at::date
    from public.saved_videos v where v.workspace_id = ws and v.fts @@ tsq
  ) r(kind, id, business_id, title, snippet, rank, happened_on)
  order by rank desc, happened_on desc nulls last
  limit lim;
end;
$$;
revoke execute on function public.search_all(uuid, text, integer) from public, anon;
grant execute on function public.search_all(uuid, text, integer) to authenticated;

-- ---------------------------------------------------------------- cron
-- Sustituye a configure_cron para programar también: cola de análisis de vídeos (cada 3 min) y sincronización con
-- YouTube (cada 6 horas). Se ejecuta una vez a mano; se puede repetir sin duplicar.
create or replace function public.configure_cron(app_url text, secret text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  base text := rtrim(app_url, '/');
  tpl text := $cmd$select net.http_post(url := %L, headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', %L), body := '{}'::jsonb, timeout_milliseconds := 25000)$cmd$;
begin
  if app_url !~ '^https://' then
    raise exception 'La URL debe empezar por https://';
  end if;
  if char_length(secret) < 20 then
    raise exception 'El secreto debe tener al menos 20 caracteres';
  end if;
  perform cron.schedule('biburu-reminders', '* * * * *', format(tpl, base || '/api/cron/reminders', 'Bearer ' || secret));
  perform cron.schedule('biburu-ai', '*/2 * * * *', format(tpl, base || '/api/cron/ai', 'Bearer ' || secret));
  perform cron.schedule('biburu-videos', '*/3 * * * *', format(tpl, base || '/api/cron/videos', 'Bearer ' || secret));
  perform cron.schedule('biburu-youtube-sync', '5 */6 * * *', format(tpl, base || '/api/cron/youtube-sync', 'Bearer ' || secret));
  return 'Programado: avisos (1 min), IA (2 min), análisis de vídeos (3 min) y sincronización de YouTube (cada 6 h)';
end;
$$;
revoke all on function public.configure_cron(text, text) from public, anon, authenticated;

-- Las colas en segundo plano (cron) usan la clave de servicio: necesitan ejecutar las funciones de consumo de IA.
-- (BYPASSRLS salta las políticas, pero no los permisos de ejecución de funciones.)
do $$
begin
  if exists (select from pg_roles where rolname = 'service_role') then
    grant execute on function public.ai_spend(uuid, timestamptz, timestamptz), public.ai_recent_calls(uuid, integer) to service_role;
  end if;
end $$;
