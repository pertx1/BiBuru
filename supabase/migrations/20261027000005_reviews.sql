-- BiBuru · Revisión diaria, semanal y mensual.
-- Cada revisión se genera sola a su hora (cron de avisos), se guarda en un histórico (foto de los datos) y avisa con una
-- notificación. «Revisado» la cierra; mientras no se cierra sigue en Inicio. Solo añade: una tabla nueva, columnas con valor
-- por defecto y un valor más permitido en ai_usage.feature (el párrafo opcional con IA).

create table public.reviews (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind          text not null check (kind in ('diaria', 'semanal', 'mensual')),
  period_start  date not null,
  period_end    date not null check (period_end >= period_start),
  data          jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),   -- foto de las cifras al generarse
  ai_summary    text check (ai_summary is null or char_length(ai_summary) <= 3000),
  priorities    text[] not null default '{}' check (cardinality(priorities) <= 3),     -- semanal: 3 prioridades (se crean como tareas)
  reviewed_at   timestamptz,
  notified_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (workspace_id, user_id, kind, period_start)
);
create index reviews_list_idx on public.reviews (workspace_id, user_id, kind, period_start desc);
create index reviews_open_idx on public.reviews (user_id) where reviewed_at is null;
select public.apply_workspace_policies('reviews');

-- Cuándo se genera cada una (hora «de pared» en la zona del perfil). Semanal por defecto el domingo (6; 0 = lunes) por la tarde.
alter table public.profiles
  add column review_daily_enabled   boolean  not null default true,
  add column review_daily_time      time     not null default '08:30',
  add column review_weekly_enabled  boolean  not null default true,
  add column review_weekly_dow      smallint not null default 6 check (review_weekly_dow between 0 and 6),
  add column review_weekly_time     time     not null default '18:00',
  add column review_monthly_enabled boolean  not null default true,
  add column review_monthly_time    time     not null default '09:00';

-- Párrafo de resumen con IA (opcional, a petición, dentro del presupuesto mensual).
alter table public.ai_usage drop constraint ai_usage_feature_check;
alter table public.ai_usage add constraint ai_usage_feature_check
  check (feature in ('classify', 'chat', 'voice', 'video', 'video_light', 'brief', 'news', 'mail', 'review'));
