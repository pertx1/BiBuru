-- BiBuru · Bandeja unificada de mensajes de redes (mensajes directos, comentarios y menciones) y sincronización automática.
-- Solo añade: tablas nuevas y columnas nuevas con valor por defecto. No toca datos existentes.

-- ---------------------------------------------------------------- hilos (una conversación, o un comentario raíz con sus respuestas)
create table public.social_threads (
  id                 uuid primary key default gen_random_uuid(),
  workspace_id       uuid not null references public.workspaces (id) on delete cascade,
  user_id            uuid not null default auth.uid() references auth.users (id) on delete cascade,
  account_id         uuid not null,
  platform           text not null check (platform in ('instagram', 'tiktok')),
  kind               text not null check (kind in ('dm', 'comment', 'mention')),
  external_id        text not null check (char_length(external_id) <= 300),       -- id de conversación o del comentario raíz
  -- Publicación (comentarios y menciones).
  media_external_id  text check (media_external_id is null or char_length(media_external_id) <= 200),
  media_permalink    text check (media_permalink is null or (media_permalink ~ '^https://' and char_length(media_permalink) <= 2000)),
  media_caption      text check (media_caption is null or char_length(media_caption) <= 500),
  media_thumbnail    text check (media_thumbnail is null or (media_thumbnail ~ '^https://' and char_length(media_thumbnail) <= 4000)),
  -- Persona.
  participant_id     text check (participant_id is null or char_length(participant_id) <= 200),
  participant_name   text check (participant_name is null or char_length(participant_name) <= 200),
  participant_username text check (participant_username is null or char_length(participant_username) <= 200),
  preview            text check (preview is null or char_length(preview) <= 300),
  last_message_at    timestamptz not null default now(),
  last_inbound_at    timestamptz,                                                   -- para la ventana de 24 h de Instagram
  status             text not null default 'sin_responder' check (status in ('sin_responder', 'respondido', 'archivado')),
  unread             boolean not null default true,
  labels             text[] not null default '{}' check (cardinality(labels) <= 10),
  customer_name      text check (customer_name is null or char_length(customer_name) <= 200),
  order_id           uuid,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (account_id, kind, external_id),
  unique (id, workspace_id),
  foreign key (account_id, workspace_id) references public.social_accounts (id, workspace_id) on delete cascade,
  foreign key (order_id, workspace_id) references public.orders (id, workspace_id) on delete set null (order_id)
);
create index social_threads_list_idx on public.social_threads (workspace_id, status, last_message_at desc);
create index social_threads_account_idx on public.social_threads (account_id, last_message_at desc);
select public.apply_workspace_policies('social_threads');

-- ---------------------------------------------------------------- mensajes (y comentarios) de cada hilo
create table public.social_messages (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  thread_id     uuid not null,
  external_id   text check (external_id is null or char_length(external_id) <= 300),
  direction     text not null check (direction in ('in', 'out')),
  author_name   text check (author_name is null or char_length(author_name) <= 200),
  body          text not null default '' check (char_length(body) <= 5000),
  attachments   jsonb not null default '[]' check (jsonb_typeof(attachments) = 'array'),
  sent_at       timestamptz not null default now(),
  -- Respuestas mías: enviando → enviado / error (con reintento). «público» o «privado» en comentarios.
  send_status   text check (send_status is null or send_status in ('enviando', 'enviado', 'error')),
  send_mode     text check (send_mode is null or send_mode in ('dm', 'public', 'private')),
  error         text check (error is null or char_length(error) <= 500),
  hidden        boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (thread_id, external_id),
  foreign key (thread_id, workspace_id) references public.social_threads (id, workspace_id) on delete cascade
);
create index social_messages_thread_idx on public.social_messages (thread_id, sent_at);
select public.apply_workspace_policies('social_messages');

-- ---------------------------------------------------------------- respuestas guardadas (por negocio o generales)
create table public.social_saved_replies (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  business_id   uuid,
  title         text not null check (char_length(title) between 1 and 80),
  body          text not null check (char_length(body) between 1 and 1000),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  foreign key (business_id, workspace_id) references public.businesses (id, workspace_id) on delete cascade
);
create index social_saved_replies_ws_idx on public.social_saved_replies (workspace_id, business_id);
select public.apply_workspace_policies('social_saved_replies');

-- ---------------------------------------------------------------- sincronización de cuentas
alter table public.social_accounts
  add column followers_count     integer check (followers_count is null or followers_count >= 0),
  add column last_sync_at        timestamptz,
  add column sync_error          text check (sync_error is null or char_length(sync_error) <= 300),
  add column rate_limited_until  timestamptz,
  add column inbox_synced_at     timestamptz,
  add column webhook_subscribed  boolean not null default false;
grant select (followers_count, last_sync_at, sync_error, rate_limited_until, inbox_synced_at, webhook_subscribed) on public.social_accounts to authenticated;

-- Ajustes: IA para sugerir respuestas (apagada), avisos de mensajes (encendidos) y avisos de hitos de redes (apagados).
alter table public.profiles
  add column inbox_ai_suggest     boolean not null default false,
  add column inbox_push_enabled   boolean not null default true,
  add column social_alerts_enabled boolean not null default false;

-- Tiempo real: la bandeja y los contadores cambian sin recargar (Supabase Realtime respeta RLS). Si la publicación no existe
-- (Postgres sin Supabase, p. ej. en los tests), se omite.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    execute 'alter publication supabase_realtime add table public.social_threads';
  end if;
end $$;
