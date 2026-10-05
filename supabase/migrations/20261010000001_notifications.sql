-- BiBuru · Fase 5 · Avisos: suscripciones push, recordatorios sueltos, registro anti-duplicados y cron.

-- Preferencias de avisos en el perfil (ya existían: daily_digest_time, quiet_hours_*, weekly_review_*).
alter table public.profiles
  add column task_lead_minutes     integer  not null default 0   check (task_lead_minutes between 0 and 10080),
  add column event_lead_minutes    integer  not null default 30  check (event_lead_minutes between 0 and 10080),
  add column daily_digest_enabled  boolean  not null default true,
  add column overdue_alert_enabled boolean  not null default true,
  add column overdue_alert_time    time     not null default '17:00',
  add column weekly_review_enabled boolean  not null default true;

-- ------------------------------------------------- suscripciones push (una por dispositivo)
create table public.push_subscriptions (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint      text not null unique check (endpoint ~ '^https://' and char_length(endpoint) <= 2000),
  p256dh        text not null check (char_length(p256dh) between 20 and 200),
  auth          text not null check (char_length(auth) between 10 and 100),
  user_agent    text check (user_agent is null or char_length(user_agent) <= 300),
  last_success_at timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);
create trigger push_subscriptions_set_updated_at before update on public.push_subscriptions
  for each row execute function public.set_updated_at();
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;
grant select, insert, update, delete on public.push_subscriptions to authenticated;
-- Las claves de un dispositivo son personales: solo su dueño las ve (aunque comparta workspace).
create policy push_subscriptions_own on public.push_subscriptions for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.is_workspace_member(workspace_id));

-- ------------------------------------------------------------- recordatorios sueltos
create table public.reminders (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  user_id       uuid not null default auth.uid() references auth.users (id),
  task_id       uuid,
  event_id      uuid,
  title         text not null check (char_length(title) between 1 and 200),
  remind_at     timestamptz not null,
  status        text not null default 'pending' check (status in ('pending', 'sent', 'snoozed')),
  sent_at       timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (task_id is null or event_id is null),
  foreign key (task_id, workspace_id) references public.tasks (id, workspace_id) on delete cascade,
  foreign key (event_id, workspace_id) references public.events (id, workspace_id) on delete cascade
);
create index reminders_due_idx on public.reminders (status, remind_at) where status in ('pending', 'snoozed');
select public.apply_workspace_policies('reminders');

-- Registro de avisos enviados: garantiza que el cron (cada minuto, con reintentos) es idempotente.
-- Solo lo usa el servidor con la clave de servicio: sin políticas = nadie más puede leerlo.
create table public.notification_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  dedupe_key  text not null check (char_length(dedupe_key) <= 300),
  kind        text not null,
  created_at  timestamptz not null default now(),
  unique (user_id, dedupe_key)
);
create index notification_log_created_idx on public.notification_log (created_at);
alter table public.notification_log enable row level security;
revoke all on public.notification_log from anon, authenticated;

-- ------------------------------------------------------------------ cron (pg_cron + pg_net)
-- En Supabase se activan en el panel (Database → Extensions) o aquí. En un Postgres sin ellas no pasa nada.
do $$
begin
  begin create extension if not exists pg_cron; exception when others then raise notice 'pg_cron no disponible: %', sqlerrm; end;
  begin create extension if not exists pg_net;  exception when others then raise notice 'pg_net no disponible: %', sqlerrm; end;
end $$;

-- Se ejecuta una vez a mano en el SQL Editor tras desplegar:
--   select public.configure_cron('https://TU-APP.vercel.app', 'TU_CRON_SECRET');
-- Programa la llamada cada minuto a /api/cron/reminders con el secreto. Se puede repetir sin duplicar.
create or replace function public.configure_cron(app_url text, secret text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if app_url !~ '^https://' then
    raise exception 'La URL debe empezar por https://';
  end if;
  if char_length(secret) < 20 then
    raise exception 'El secreto debe tener al menos 20 caracteres';
  end if;
  perform cron.schedule(
    'biburu-reminders',
    '* * * * *',
    format(
      $cmd$select net.http_post(url := %L, headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', %L), body := '{}'::jsonb, timeout_milliseconds := 25000)$cmd$,
      rtrim(app_url, '/') || '/api/cron/reminders', 'Bearer ' || secret
    )
  );
  return 'Programado: biburu-reminders cada minuto';
end;
$$;
revoke all on function public.configure_cron(text, text) from public, anon, authenticated;
