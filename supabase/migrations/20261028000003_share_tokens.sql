-- Clave personal para el atajo de iPhone «Compartir → BiBuru» (guarda enlaces en Favoritos sin abrir la app).
-- Solo se guarda el hash (sha256) de la clave; la clave se enseña una vez al crearla. Una por persona y espacio.
create table public.share_tokens (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  token_hash    text not null unique check (char_length(token_hash) = 64),
  last_used_at  timestamptz,
  uses          integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id, workspace_id)
);
create trigger share_tokens_set_updated_at before update on public.share_tokens
  for each row execute function public.set_updated_at();
alter table public.share_tokens enable row level security;
revoke all on public.share_tokens from anon, authenticated;
grant select, insert, update, delete on public.share_tokens to authenticated;
-- Credencial personal (como push_subscriptions): solo la ve y la toca su dueño.
create policy share_tokens_own on public.share_tokens for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.is_workspace_member(workspace_id));
