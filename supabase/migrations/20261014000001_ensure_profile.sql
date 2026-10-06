-- BiBuru · Repara cuentas sin perfil (usuarios creados antes de aplicar la migración base, o si el trigger falló).
-- 1) Crea espacio «Personal», membresía y perfil a quien no los tenga. 2) Función que la app llama sola si falta el perfil.

create or replace function public.ensure_profile_for(uid uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  ws_id uuid;
  mail text;
begin
  select default_workspace_id into ws_id from public.profiles where user_id = uid;
  if ws_id is not null then
    return ws_id;
  end if;
  select email into mail from auth.users where id = uid;
  if mail is null then
    return null;
  end if;
  select w.id into ws_id from public.workspaces w where w.owner_id = uid order by w.created_at limit 1;
  if ws_id is null then
    insert into public.workspaces (owner_id, name) values (uid, 'Personal') returning id into ws_id;
  end if;
  insert into public.workspace_members (workspace_id, user_id, role) values (ws_id, uid, 'owner')
    on conflict do nothing;
  insert into public.profiles (user_id, default_workspace_id, display_name) values (uid, ws_id, split_part(mail, '@', 1))
    on conflict (user_id) do update set default_workspace_id = coalesce(public.profiles.default_workspace_id, excluded.default_workspace_id);
  return ws_id;
end;
$$;
revoke all on function public.ensure_profile_for(uuid) from public, anon, authenticated;

-- Solo para uno mismo: la app la llama con la sesión del usuario.
create or replace function public.ensure_profile()
returns uuid
language sql
security definer
set search_path = ''
as $$ select public.ensure_profile_for((select auth.uid())) $$;
revoke all on function public.ensure_profile() from public, anon;
grant execute on function public.ensure_profile() to authenticated;

-- Reparación de las cuentas existentes.
select public.ensure_profile_for(u.id) from auth.users u where not exists (select 1 from public.profiles p where p.user_id = u.id and p.default_workspace_id is not null);
