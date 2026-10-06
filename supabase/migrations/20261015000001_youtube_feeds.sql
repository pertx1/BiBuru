-- BiBuru · Listas de YouTube por RSS (sin Google Cloud): la app lee el feed público de una lista
-- (https://www.youtube.com/feeds/videos.xml?playlist_id=…) y añade a Favoritos los vídeos nuevos.

create table public.youtube_feeds (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces (id) on delete cascade,
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  playlist_id     text not null check (playlist_id ~ '^[A-Za-z0-9_-]{10,64}$'),
  title           text not null default 'Lista de YouTube' check (char_length(title) between 1 and 200),
  last_checked_at timestamptz,
  last_error      text check (last_error is null or char_length(last_error) <= 300),
  last_added      integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (workspace_id, playlist_id)
);
create index youtube_feeds_workspace_idx on public.youtube_feeds (workspace_id);
create index youtube_feeds_checked_idx on public.youtube_feeds (last_checked_at nulls first);
select public.apply_workspace_policies('youtube_feeds');
