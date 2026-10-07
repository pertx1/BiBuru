-- BiBuru · Redes sociales (Instagram y TikTok de negocio): cuentas, estadísticas diarias, publicaciones y programación.
-- Solo añade. Los tokens van cifrados y la app no puede leerlos (como Google y Outlook).

-- ---------------------------------------------------------------- cuentas
create table public.social_accounts (
  id                 uuid primary key default gen_random_uuid(),
  workspace_id       uuid not null references public.workspaces (id) on delete cascade,
  user_id            uuid not null default auth.uid() references auth.users (id) on delete cascade,
  business_id        uuid,
  platform           text not null check (platform in ('instagram', 'tiktok')),
  external_id        text not null check (char_length(external_id) <= 200),
  username           text check (username is null or char_length(username) <= 200),
  display_name       text check (display_name is null or char_length(display_name) <= 200),
  avatar_url         text check (avatar_url is null or (avatar_url ~ '^https://' and char_length(avatar_url) <= 2000)),
  account_type       text check (account_type is null or char_length(account_type) <= 40),
  access_token_enc   text not null,
  refresh_token_enc  text,
  token_expires_at   timestamptz,
  refresh_expires_at timestamptz,
  scopes             text check (scopes is null or char_length(scopes) <= 1000),
  status             text not null default 'ok' check (status in ('ok', 'expiring', 'expired', 'error')),
  last_error         text check (last_error is null or char_length(last_error) <= 300),
  last_snapshot_on   date,
  last_media_sync_at timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (workspace_id, platform, external_id),
  unique (id, workspace_id),
  foreign key (business_id, workspace_id) references public.businesses (id, workspace_id) on delete set null (business_id)
);
create index social_accounts_ws_idx on public.social_accounts (workspace_id);
alter table public.social_accounts enable row level security;
revoke all on public.social_accounts from anon, authenticated;
-- Las estadísticas son del negocio: las ve todo el espacio. El alta la hace el servidor tras el OAuth.
grant select (id, workspace_id, user_id, business_id, platform, external_id, username, display_name, avatar_url, account_type, token_expires_at, status, last_error, last_snapshot_on, last_media_sync_at, scopes, created_at, updated_at) on public.social_accounts to authenticated;
grant update (business_id) on public.social_accounts to authenticated;
grant delete on public.social_accounts to authenticated;
create policy social_accounts_select on public.social_accounts for select to authenticated using (public.is_workspace_member(workspace_id));
create policy social_accounts_update on public.social_accounts for update to authenticated using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy social_accounts_delete on public.social_accounts for delete to authenticated using (public.is_workspace_member(workspace_id));
create trigger social_accounts_set_updated_at before update on public.social_accounts for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- foto diaria de la cuenta (histórico propio)
create table public.social_daily (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  account_id    uuid not null,
  day           date not null,
  followers     integer check (followers is null or followers >= 0),
  reach         integer check (reach is null or reach >= 0),
  views         integer check (views is null or views >= 0),
  interactions  integer check (interactions is null or interactions >= 0),
  likes         integer, comments integer, shares integer, saves integer, profile_views integer,
  -- TikTok no da datos por día: se guardan los acumulados de sus vídeos y el día = diferencia con la foto anterior.
  views_total   bigint, interactions_total bigint,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (account_id, day),
  foreign key (account_id, workspace_id) references public.social_accounts (id, workspace_id) on delete cascade
);
alter table public.social_daily enable row level security;
revoke all on public.social_daily from anon, authenticated;
grant select on public.social_daily to authenticated;
create policy social_daily_select on public.social_daily for select to authenticated using (public.is_workspace_member(workspace_id));
create trigger social_daily_set_updated_at before update on public.social_daily for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- publicaciones de la cuenta (para el ranking)
create table public.social_media (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  account_id    uuid not null,
  external_id   text not null check (char_length(external_id) <= 200),
  caption       text check (caption is null or char_length(caption) <= 2500),
  media_type    text check (media_type is null or char_length(media_type) <= 40),
  permalink     text check (permalink is null or (permalink ~ '^https://' and char_length(permalink) <= 2000)),
  thumbnail_url text check (thumbnail_url is null or (thumbnail_url ~ '^https://' and char_length(thumbnail_url) <= 4000)),
  posted_at     timestamptz not null,
  reach         integer, views integer, likes integer, comments integer, shares integer, saves integer, interactions integer,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (account_id, external_id),
  foreign key (account_id, workspace_id) references public.social_accounts (id, workspace_id) on delete cascade
);
create index social_media_recent_idx on public.social_media (account_id, posted_at desc);
alter table public.social_media enable row level security;
revoke all on public.social_media from anon, authenticated;
grant select on public.social_media to authenticated;
create policy social_media_select on public.social_media for select to authenticated using (public.is_workspace_member(workspace_id));
create trigger social_media_set_updated_at before update on public.social_media for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- programación
create table public.social_posts (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references public.workspaces (id) on delete cascade,
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  business_id      uuid,
  title            text check (title is null or char_length(title) <= 120),
  caption          text not null default '' check (char_length(caption) <= 2200),
  hashtags         text not null default '' check (char_length(hashtags) <= 1000),
  media_kind       text not null default 'image' check (media_kind in ('image', 'carousel', 'reel', 'video')),
  scheduled_at     timestamptz,
  status           text not null default 'borrador' check (status in ('borrador', 'programada', 'publicando', 'publicada', 'error')),
  source_video_id  uuid,
  notes            text check (notes is null or char_length(notes) <= 5000),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (id, workspace_id),
  foreign key (business_id, workspace_id) references public.businesses (id, workspace_id) on delete set null (business_id),
  foreign key (source_video_id, workspace_id) references public.saved_videos (id, workspace_id) on delete set null (source_video_id)
);
create index social_posts_schedule_idx on public.social_posts (workspace_id, scheduled_at);
select public.apply_workspace_policies('social_posts');

-- Una fila por red en la que se publica (una publicación puede ir a Instagram y a TikTok a la vez).
-- mode: direct (publicación directa), draft (se envía a TikTok como borrador), assisted (aviso para publicarlo tú).
create table public.social_post_targets (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  post_id       uuid not null,
  account_id    uuid not null,
  mode          text not null default 'direct' check (mode in ('direct', 'draft', 'assisted')),
  status        text not null default 'pendiente' check (status in ('pendiente', 'publicando', 'publicada', 'enviada', 'avisada', 'error')),
  attempts      integer not null default 0,
  next_try_at   timestamptz,
  container_id  text check (container_id is null or char_length(container_id) <= 200),
  external_id   text check (external_id is null or char_length(external_id) <= 200),
  permalink     text check (permalink is null or (permalink ~ '^https://' and char_length(permalink) <= 2000)),
  privacy       text check (privacy is null or char_length(privacy) <= 40),
  error         text check (error is null or char_length(error) <= 500),
  published_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (post_id, account_id),
  foreign key (post_id, workspace_id) references public.social_posts (id, workspace_id) on delete cascade,
  foreign key (account_id, workspace_id) references public.social_accounts (id, workspace_id) on delete cascade
);
create index social_targets_due_idx on public.social_post_targets (status, next_try_at);
select public.apply_workspace_policies('social_post_targets');

-- Archivos de la publicación (temporales: se borran unos días después de publicar).
create table public.social_post_files (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  post_id       uuid not null,
  path          text not null check (char_length(path) <= 300),
  mime          text not null check (mime in ('image/jpeg', 'image/png', 'video/mp4', 'video/quicktime')),
  size_bytes    bigint not null check (size_bytes > 0 and size_bytes <= 104857600),
  position      smallint not null default 0 check (position between 0 and 9),
  deleted_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (path),
  foreign key (post_id, workspace_id) references public.social_posts (id, workspace_id) on delete cascade
);
select public.apply_workspace_policies('social_post_files');

-- Bucket privado. Ruta: <workspace_id>/<post_id>/<archivo>. 50 MB por archivo (límite del plan gratuito).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('social-media', 'social-media', false, 52428800, array['image/jpeg', 'image/png', 'video/mp4', 'video/quicktime'])
on conflict (id) do nothing;
create policy social_media_select on storage.objects for select to authenticated
  using (bucket_id = 'social-media' and public.is_workspace_member(((storage.foldername(name))[1])::uuid));
create policy social_media_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'social-media' and public.is_workspace_member(((storage.foldername(name))[1])::uuid));
create policy social_media_delete on storage.objects for delete to authenticated
  using (bucket_id = 'social-media' and public.is_workspace_member(((storage.foldername(name))[1])::uuid));

-- ---------------------------------------------------------------- cron: también redes (cada 5 min)
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
  perform cron.schedule('biburu-mail', '*/10 * * * *', format(tpl, base || '/api/cron/mail', 'Bearer ' || secret));
  perform cron.schedule('biburu-social', '*/5 * * * *', format(tpl, base || '/api/cron/social', 'Bearer ' || secret));
  return 'Programado: avisos (1 min), IA (2 min), vídeos (3 min), YouTube (6 h), noticias (15 min), correo (10 min) y redes (5 min)';
end;
$$;
revoke all on function public.configure_cron(text, text) from public, anon, authenticated;
