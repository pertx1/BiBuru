-- Conector de Claude (MCP): una clave personal en la dirección que se añade en Claude (claude.ai, la app o Claude Code).
-- Da acceso a tareas, notas, proyectos, búsqueda y vídeos de ese espacio. Solo se guarda el hash; se enseña una vez.
create table public.mcp_tokens (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  token_hash    text not null unique check (char_length(token_hash) = 64),
  last_used_at  timestamptz,
  last_client   text check (last_client is null or char_length(last_client) <= 120),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id, workspace_id)
);
create trigger mcp_tokens_set_updated_at before update on public.mcp_tokens
  for each row execute function public.set_updated_at();
alter table public.mcp_tokens enable row level security;
revoke all on public.mcp_tokens from anon, authenticated;
grant select, insert, update, delete on public.mcp_tokens to authenticated;
-- Credencial personal (como widget_tokens): solo la ve y la toca su dueño.
create policy mcp_tokens_own on public.mcp_tokens for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.is_workspace_member(workspace_id));
