-- Clave personal para los widgets de iPhone (app Scriptable): solo lectura de un resumen (tareas de hoy, ventas, pedidos, cobros, stock).
-- Solo se guarda el hash; la clave se enseña una vez. Una por persona y espacio.
create table public.widget_tokens (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  token_hash    text not null unique check (char_length(token_hash) = 64),
  last_used_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id, workspace_id)
);
create trigger widget_tokens_set_updated_at before update on public.widget_tokens
  for each row execute function public.set_updated_at();
alter table public.widget_tokens enable row level security;
revoke all on public.widget_tokens from anon, authenticated;
grant select, insert, update, delete on public.widget_tokens to authenticated;
-- Credencial personal (como share_tokens): solo la ve y la toca su dueño.
create policy widget_tokens_own on public.widget_tokens for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.is_workspace_member(workspace_id));
