-- BiBuru · Fase 1 · Base multiusuario.
-- Convenciones (ver CLAUDE.md):
--   * Toda tabla de datos lleva id, user_id (quien la crea), workspace_id
--     (espacio al que pertenece), created_at y updated_at.
--   * RLS: se puede ver/escribir una fila si eres miembro de su workspace.
--   * Hoy cada usuario tiene un único workspace personal.


-- ---------------------------------------------------------------- utilidades
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------- workspaces
create table public.workspaces (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 80),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index workspaces_owner_id_idx on public.workspaces (owner_id);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  role         text not null default 'member' check (role in ('owner', 'admin', 'member')),
  created_at   timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index workspace_members_user_id_idx on public.workspace_members (user_id);

-- ------------------------------------------------------------------ profiles
create table public.profiles (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null unique references auth.users (id) on delete cascade,
  default_workspace_id  uuid references public.workspaces (id) on delete set null,
  display_name          text check (display_name is null or char_length(display_name) <= 80),
  timezone              text not null default 'Europe/Madrid',
  daily_digest_time     time not null default '08:00',
  quiet_hours_start     time not null default '22:00',
  quiet_hours_end       time not null default '08:00',
  ai_monthly_budget_cents integer not null default 1000 check (ai_monthly_budget_cents >= 0),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create trigger workspaces_set_updated_at before update on public.workspaces
  for each row execute function public.set_updated_at();
create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------ helpers de RLS
-- security definer para evitar recursión de políticas; se evalúan una vez por
-- consulta gracias al `(select ...)` en las políticas.
create or replace function public.is_workspace_member(ws uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws and m.user_id = (select auth.uid())
  );
$$;

create or replace function public.is_workspace_admin(ws uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws
      and m.user_id = (select auth.uid())
      and m.role in ('owner', 'admin')
  );
$$;

revoke all on function public.is_workspace_member(uuid) from public, anon;
revoke all on function public.is_workspace_admin(uuid) from public, anon;
grant execute on function public.is_workspace_member(uuid) to authenticated;
grant execute on function public.is_workspace_admin(uuid) to authenticated;

-- ----------------------------------------------------------------------- RLS
alter table public.workspaces        enable row level security;
alter table public.workspace_members enable row level security;
alter table public.profiles          enable row level security;

create policy workspaces_select on public.workspaces
  for select to authenticated
  using (public.is_workspace_member(id));
create policy workspaces_update on public.workspaces
  for update to authenticated
  using (public.is_workspace_admin(id))
  with check (public.is_workspace_admin(id));

create policy workspace_members_select on public.workspace_members
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_workspace_member(workspace_id));
create policy workspace_members_insert on public.workspace_members
  for insert to authenticated
  with check (public.is_workspace_admin(workspace_id));
create policy workspace_members_delete on public.workspace_members
  for delete to authenticated
  using (public.is_workspace_admin(workspace_id) and role <> 'owner');

create policy profiles_select on public.profiles
  for select to authenticated
  using (user_id = (select auth.uid()));
create policy profiles_update on public.profiles
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Permisos de tabla mínimos (RLS hace el resto). Los inserts de workspaces y
-- profiles solo los hace el trigger de alta de usuario.
revoke all on public.workspaces, public.workspace_members, public.profiles from anon, authenticated;
grant select, update on public.workspaces to authenticated;
grant select, insert, delete on public.workspace_members to authenticated;
grant select, update on public.profiles to authenticated;

-- ------------------------------------------------- alta automática de usuario
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ws_id uuid;
begin
  insert into public.workspaces (owner_id, name)
  values (new.id, 'Personal')
  returning id into ws_id;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (ws_id, new.id, 'owner');

  insert into public.profiles (user_id, default_workspace_id, display_name)
  values (new.id, ws_id, split_part(new.email, '@', 1));

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
