-- BiBuru · Noticias: resumen diario filtrado por «¿esto me sirve para ganar más dinero o escalar mis negocios?».
-- Solo se guardan titular, entradilla, enlace, medio/autor e imagen (dirección original); nunca artículos completos.

-- Ajustes por persona (en el perfil, como los demás avisos).
alter table public.profiles
  add column news_enabled  boolean not null default true,
  add column news_time     time    not null default '08:00',
  add column news_weekends boolean not null default true;

-- ---------------------------------------------------------------- temas (por espacio)
create table public.news_topics (
  id          uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 60),
  description text check (description is null or char_length(description) <= 300),
  keywords    text[] not null default '{}' check (cardinality(keywords) <= 40),
  color       text not null default '#7b6cf6' check (color ~ '^#[0-9a-fA-F]{6}$'),
  icon        text not null default 'newspaper' check (char_length(icon) <= 30),
  sort_order  integer not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (workspace_id, name),
  unique (id, workspace_id)
);
create index news_topics_ws_idx on public.news_topics (workspace_id, sort_order);
select public.apply_workspace_policies('news_topics');

-- ---------------------------------------------------------------- fuentes
create table public.news_sources (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind          text not null check (kind in ('rss', 'google_news', 'youtube', 'bluesky', 'mastodon', 'blog')),
  name          text not null check (char_length(name) between 1 and 100),
  url           text not null check (url ~ '^https://' and char_length(url) <= 1000),  -- feed o API pública ya construida
  handle        text check (handle is null or char_length(handle) <= 200),            -- lo que escribió la persona (búsqueda, @cuenta…)
  topic_id      uuid,
  lang          text not null default 'es' check (lang in ('es', 'en')),
  active        boolean not null default true,
  preset        boolean not null default false,
  status        text not null default 'unchecked' check (status in ('unchecked', 'ok', 'down')),
  last_checked_at timestamptz,
  last_fetched_at timestamptz,
  last_error    text check (last_error is null or char_length(last_error) <= 300),
  fail_count    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (workspace_id, url),
  unique (id, workspace_id),
  foreign key (topic_id, workspace_id) references public.news_topics (id, workspace_id) on delete set null (topic_id)
);
create index news_sources_due_idx on public.news_sources (active, last_fetched_at nulls first);
select public.apply_workspace_policies('news_sources');

-- ---------------------------------------------------------------- noticias recogidas
create table public.news_items (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  source_id     uuid,
  topic_id      uuid,
  source_kind   text not null check (source_kind in ('rss', 'google_news', 'youtube', 'bluesky', 'mastodon', 'blog')),
  url           text not null check (url ~ '^https?://' and char_length(url) <= 2000),
  url_hash      text not null check (char_length(url_hash) = 40),
  title         text not null check (char_length(title) between 1 and 400),
  title_key     text not null check (char_length(title_key) <= 400),  -- titular normalizado para detectar duplicados
  snippet       text check (snippet is null or char_length(snippet) <= 600),
  outlet        text check (outlet is null or char_length(outlet) <= 120),
  author        text check (author is null or char_length(author) <= 120),
  image_url     text check (image_url is null or (image_url ~ '^https://' and char_length(image_url) <= 2000)),
  published_at  timestamptz,
  fetched_at    timestamptz not null default now(),
  digest_day    date,                                     -- día en que salió en un resumen (no se repite)
  score         smallint check (score is null or score between 1 and 5),
  feedback      text check (feedback is null or feedback in ('useful', 'hidden')),
  fts           tsvector generated always as (to_tsvector('spanish', coalesce(title, '') || ' ' || coalesce(snippet, '') || ' ' || coalesce(outlet, ''))) stored,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (workspace_id, url_hash),
  foreign key (source_id, workspace_id) references public.news_sources (id, workspace_id) on delete set null (source_id),
  foreign key (topic_id, workspace_id) references public.news_topics (id, workspace_id) on delete set null (topic_id)
);
create index news_items_recent_idx on public.news_items (workspace_id, fetched_at desc);
create index news_items_fts_idx on public.news_items using gin (fts);
select public.apply_workspace_policies('news_items');

-- ---------------------------------------------------------------- resumen diario (uno por persona y día)
create table public.news_digests (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  day           date not null,
  status        text not null check (status in ('ai', 'fallback', 'empty')),
  content       jsonb not null check (jsonb_typeof(content) = 'object'),
  manual_runs   integer not null default 0 check (manual_runs between 0 and 2),
  cost_micros   bigint not null default 0,
  notified_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id, workspace_id, day)
);
create trigger news_digests_set_updated_at before update on public.news_digests for each row execute function public.set_updated_at();
alter table public.news_digests enable row level security;
revoke all on public.news_digests from anon, authenticated;
grant select, insert, update, delete on public.news_digests to authenticated;
create policy news_digests_own on public.news_digests for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.is_workspace_member(workspace_id));

-- El resumen de noticias cuenta en el presupuesto de IA como lo demás.
alter table public.ai_usage drop constraint ai_usage_feature_check;
alter table public.ai_usage add constraint ai_usage_feature_check
  check (feature in ('classify', 'chat', 'voice', 'video', 'video_light', 'brief', 'news'));

-- ---------------------------------------------------------------- cron: también noticias (cada 15 min)
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
  perform cron.schedule('biburu-news', '*/15 * * * *', format(tpl, base || '/api/cron/news', 'Bearer ' || secret));
  return 'Programado: avisos (1 min), IA (2 min), vídeos (3 min), YouTube (6 h) y noticias (15 min)';
end;
$$;
revoke all on function public.configure_cron(text, text) from public, anon, authenticated;
