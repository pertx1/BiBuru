-- Proyectos: las categorías (las de Favoritos) pasan a tener subcategorías («IA › Claude») y sirven también para notas y tareas.
-- Cada categoría es un «proyecto» con sus vídeos, notas y tareas (pantalla /proyectos).

alter table public.video_categories add column if not exists parent_id uuid;
alter table public.video_categories add column if not exists description text check (description is null or char_length(description) <= 500);
alter table public.video_categories
  add constraint video_categories_parent_fk foreign key (parent_id, workspace_id) references public.video_categories (id, workspace_id) on delete set null (parent_id);
create index if not exists video_categories_parent_idx on public.video_categories (workspace_id, parent_id);

-- El nombre se repite solo bajo padres distintos («IA › Otros» y «Negocios › Otros»).
create unique index if not exists video_categories_name_parent_idx
  on public.video_categories (workspace_id, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));
drop index if exists public.video_categories_name_idx;

-- Sin ciclos (una categoría dentro de sí misma o de una suya), como las carpetas de notas.
create or replace function public.video_categories_prevent_cycle()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.parent_id is null then return new; end if;
  if new.parent_id = new.id then raise exception 'Una categoría no puede estar dentro de sí misma'; end if;
  if exists (
    with recursive up as (
      select id, parent_id from public.video_categories where id = new.parent_id
      union all
      select c.id, c.parent_id from public.video_categories c join up on c.id = up.parent_id
    )
    select 1 from up where id = new.id
  ) then raise exception 'Una categoría no puede estar dentro de una de sus subcategorías'; end if;
  return new;
end;
$$;
create trigger video_categories_no_cycle before insert or update of parent_id on public.video_categories
  for each row execute function public.video_categories_prevent_cycle();

-- Notas y tareas también pueden ir en una categoría (proyecto).
alter table public.notes add column if not exists category_id uuid;
alter table public.notes add constraint notes_category_fk foreign key (category_id, workspace_id) references public.video_categories (id, workspace_id) on delete set null (category_id);
create index if not exists notes_category_idx on public.notes (workspace_id, category_id) where category_id is not null;
alter table public.tasks add column if not exists category_id uuid;
alter table public.tasks add constraint tasks_category_fk foreign key (category_id, workspace_id) references public.video_categories (id, workspace_id) on delete set null (category_id);
create index if not exists tasks_category_idx on public.tasks (workspace_id, category_id) where category_id is not null;

-- Categorías de partida (lo pedido): «Posibles negocios» e «IA» con «Claude» y «Otras IA» dentro. Fijadas para que la IA las use.
do $$
declare w record; ia uuid;
begin
  for w in select ws.id, ws.owner_id from public.workspaces ws loop
    insert into public.video_categories (workspace_id, user_id, name, pinned, description)
    select w.id, w.owner_id, 'Posibles negocios', true, 'Ideas de negocio por explorar: vídeos, notas y tareas para validarlas.'
    where not exists (select 1 from public.video_categories where workspace_id = w.id and lower(name) = 'posibles negocios');
    select id into ia from public.video_categories where workspace_id = w.id and lower(name) in ('ia', 'inteligencia artificial') and parent_id is null order by created_at limit 1;
    if ia is null then
      insert into public.video_categories (workspace_id, user_id, name, pinned, description) values (w.id, w.owner_id, 'IA', true, 'Herramientas y usos de la inteligencia artificial.') returning id into ia;
    else
      update public.video_categories set pinned = true where id = ia;
    end if;
    -- Una categoría «Claude» suelta que ya existiera pasa a estar dentro de IA (con sus vídeos), antes de crear las que falten.
    update public.video_categories c set parent_id = ia, pinned = true
     where c.workspace_id = w.id and c.parent_id is null and lower(c.name) = 'claude' and c.id <> ia
       and not exists (select 1 from public.video_categories x where x.workspace_id = w.id and x.parent_id = ia and lower(x.name) = 'claude');
    insert into public.video_categories (workspace_id, user_id, name, parent_id, pinned)
    select w.id, w.owner_id, n, ia, true from unnest(array['Claude', 'Otras IA']) n
    where not exists (select 1 from public.video_categories where workspace_id = w.id and parent_id = ia and lower(name) = lower(n));
  end loop;
end $$;
