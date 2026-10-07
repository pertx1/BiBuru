-- BiBuru · Correo de Outlook (Microsoft Graph, solo lectura). Solo añade.
-- Se guardan remitente, asunto, fecha y vista previa; el cuerpo y los adjuntos se piden a Microsoft al abrir el mensaje.

-- Cuentas conectadas: credencial PERSONAL (como `integrations`): RLS por user_id, sin insert desde el cliente
-- y sin permiso de lectura del token cifrado ni del enlace de sincronización.
create table public.mail_accounts (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  workspace_id     uuid not null references public.workspaces (id) on delete cascade,
  business_id      uuid,
  provider         text not null default 'microsoft' check (provider in ('microsoft')),
  email            text not null check (char_length(email) between 3 and 320),
  display_name     text check (display_name is null or char_length(display_name) <= 200),
  refresh_token_enc text not null,
  delta_link       text check (delta_link is null or char_length(delta_link) <= 4000),
  status           text not null default 'ok' check (status in ('ok', 'error', 'revoked')),
  last_sync_at     timestamptz,
  last_error       text check (last_error is null or char_length(last_error) <= 300),
  notify_new       boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (user_id, provider, email),
  unique (id, workspace_id),
  foreign key (business_id, workspace_id) references public.businesses (id, workspace_id) on delete set null (business_id)
);
create index mail_accounts_sync_idx on public.mail_accounts (status, last_sync_at nulls first);
alter table public.mail_accounts enable row level security;
revoke all on public.mail_accounts from anon, authenticated;
grant select (id, user_id, workspace_id, business_id, provider, email, display_name, status, last_sync_at, last_error, notify_new, created_at, updated_at) on public.mail_accounts to authenticated;
grant update (business_id, notify_new) on public.mail_accounts to authenticated;
grant delete on public.mail_accounts to authenticated;
create policy mail_accounts_select on public.mail_accounts for select to authenticated using (user_id = (select auth.uid()));
create policy mail_accounts_update on public.mail_accounts for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and public.is_workspace_member(workspace_id));
create policy mail_accounts_delete on public.mail_accounts for delete to authenticated using (user_id = (select auth.uid()));
create trigger mail_accounts_set_updated_at before update on public.mail_accounts for each row execute function public.set_updated_at();

-- Cabeceras de los mensajes (bandeja de entrada). Personales: solo las ve quien conectó la cuenta.
create table public.mail_messages (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  workspace_id    uuid not null references public.workspaces (id) on delete cascade,
  account_id      uuid not null references public.mail_accounts (id) on delete cascade,
  graph_id        text not null check (char_length(graph_id) <= 400),
  from_name       text check (from_name is null or char_length(from_name) <= 200),
  from_address    text check (from_address is null or char_length(from_address) <= 320),
  subject         text check (subject is null or char_length(subject) <= 500),
  preview         text check (preview is null or char_length(preview) <= 300),
  received_at     timestamptz not null,
  is_read         boolean not null default false,
  has_attachments boolean not null default false,
  web_link        text check (web_link is null or (web_link ~ '^https://' and char_length(web_link) <= 2000)),
  notified_at     timestamptz,
  fts             tsvector generated always as (to_tsvector('spanish', coalesce(subject, '') || ' ' || coalesce(from_name, '') || ' ' || coalesce(from_address, '') || ' ' || coalesce(preview, ''))) stored,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (account_id, graph_id)
);
create index mail_messages_inbox_idx on public.mail_messages (user_id, received_at desc);
create index mail_messages_unread_idx on public.mail_messages (account_id) where not is_read;
create index mail_messages_fts_idx on public.mail_messages using gin (fts);
alter table public.mail_messages enable row level security;
revoke all on public.mail_messages from anon, authenticated;
grant select on public.mail_messages to authenticated;
create policy mail_messages_select on public.mail_messages for select to authenticated using (user_id = (select auth.uid()));
create trigger mail_messages_set_updated_at before update on public.mail_messages for each row execute function public.set_updated_at();

-- Privacidad: el contenido de los correos NO va a la IA salvo que la persona lo active en Ajustes.
alter table public.profiles add column mail_ai_allowed boolean not null default false;

-- ---------------------------------------------------------------- cron: también correo (cada 10 min)
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
  return 'Programado: avisos (1 min), IA (2 min), vídeos (3 min), YouTube (6 h), noticias (15 min) y correo (10 min)';
end;
$$;
revoke all on function public.configure_cron(text, text) from public, anon, authenticated;

-- «Resumir con IA» un correo (solo si la persona lo activa): cuenta en el presupuesto como lo demás.
alter table public.ai_usage drop constraint ai_usage_feature_check;
alter table public.ai_usage add constraint ai_usage_feature_check
  check (feature in ('classify', 'chat', 'voice', 'video', 'video_light', 'brief', 'news', 'mail'));
