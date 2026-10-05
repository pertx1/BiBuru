-- BiBuru · Fase 6 · IA: control de gasto, chat, clasificación de capturas.
-- Costes en micro-euros (1 € = 1.000.000) para no perder precisión con tokens baratos.

alter table public.profiles
  add column ai_auto_apply boolean not null default false,   -- aplicar solas las propuestas de alta confianza (nunca gastos ni pedidos)
  add column ai_alert_month text;                            -- mes (AAAA-MM) en que ya se avisó del 80 %, para avisar una sola vez

alter table public.inbox_items
  add column ai_attempts integer not null default 0,
  add column ai_last_error text check (ai_last_error is null or char_length(ai_last_error) <= 300),
  add column ai_next_try_at timestamptz;
create index inbox_ai_queue_idx on public.inbox_items (ai_next_try_at) where status = 'pending';

-- --------------------------------------------------------------- consumo de IA
create table public.ai_usage (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  user_id       uuid not null default auth.uid() references auth.users (id),
  feature       text not null check (feature in ('classify', 'chat', 'voice', 'video', 'video_light')),
  model         text not null check (char_length(model) <= 80),
  input_tokens  integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  cost_micros   bigint  not null default 0 check (cost_micros >= 0),
  ok            boolean not null default true,
  error         text check (error is null or char_length(error) <= 300),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index ai_usage_month_idx on public.ai_usage (workspace_id, created_at desc);

-- Precios por modelo editables (€ por millón de tokens). Si no hay fila se usan los de la aplicación.
create table public.ai_prices (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  user_id       uuid not null default auth.uid() references auth.users (id),
  model         text not null check (char_length(model) between 1 and 80),
  input_eur_per_mtok  numeric(12, 4) not null check (input_eur_per_mtok >= 0),
  output_eur_per_mtok numeric(12, 4) not null check (output_eur_per_mtok >= 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (workspace_id, model)
);

-- Historial del chat. Una conversación = un conversation_id. `pending_action` guarda la tarjeta de confirmación
-- (gastos y pedidos) hasta que la persona la confirma o la cancela.
create table public.chat_messages (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references public.workspaces (id) on delete cascade,
  user_id          uuid not null default auth.uid() references auth.users (id),
  conversation_id  uuid not null,
  role             text not null check (role in ('user', 'assistant')),
  content          text not null default '' check (char_length(content) <= 20000),
  links            jsonb,                          -- elementos creados: [{kind, id, label, href}]
  pending_action   jsonb,
  action_status    text check (action_status in ('pending', 'done', 'cancelled')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index chat_messages_conv_idx on public.chat_messages (workspace_id, user_id, conversation_id, created_at);

select public.apply_workspace_policies(t) from unnest(array['ai_usage', 'ai_prices', 'chat_messages']) as t;

-- Consumo agrupado por función entre dos instantes. security invoker: RLS aplica.
create or replace function public.ai_spend(ws uuid, p_from timestamptz, p_to timestamptz default now())
returns table (feature text, calls bigint, input_tokens bigint, output_tokens bigint, cost_micros bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select u.feature, count(*), coalesce(sum(u.input_tokens), 0)::bigint, coalesce(sum(u.output_tokens), 0)::bigint, coalesce(sum(u.cost_micros), 0)::bigint
  from public.ai_usage u
  where u.workspace_id = ws and u.created_at >= p_from and u.created_at < p_to
  group by u.feature;
$$;

-- Llamadas a la IA en los últimos N segundos (para limitar las peticiones por minuto).
create or replace function public.ai_recent_calls(ws uuid, seconds integer default 60)
returns bigint
language sql
stable
security invoker
set search_path = ''
as $$
  select count(*) from public.ai_usage where workspace_id = ws and created_at >= now() - make_interval(secs => seconds);
$$;
revoke execute on function public.ai_spend(uuid, timestamptz, timestamptz), public.ai_recent_calls(uuid, integer) from public, anon;
grant execute on function public.ai_spend(uuid, timestamptz, timestamptz), public.ai_recent_calls(uuid, integer) to authenticated;
