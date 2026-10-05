-- BiBuru · Fase 3 · Tareas, calendario y objetivos.
-- Fechas y horas "de pared": date + time en la zona horaria del perfil (Europe/Madrid), sin
-- convertir a UTC. Evita desfases por cambio de hora; el cron (Fase 5) las interpreta con
-- profiles.timezone. Valores de objetivos en "punto fijo ×100" (euros = céntimos).

alter table public.profiles
  add column weekly_review_dow  smallint not null default 0 check (weekly_review_dow between 0 and 6), -- 0 = lunes
  add column weekly_review_time time     not null default '10:00';

-- ---------------------------------------------------------------- objetivos
create table public.goals (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  user_id       uuid not null default auth.uid() references auth.users (id),
  business_id   uuid,
  title         text not null check (char_length(title) between 1 and 200),
  description   text check (description is null or char_length(description) <= 2000),
  measure_type  text not null default 'number' check (measure_type in ('number', 'euros', 'percent', 'milestones')),
  target_value  bigint not null default 0 check (target_value >= 0),
  current_value bigint not null default 0,
  -- Progreso automático: ingresos/beneficio del periodo del negocio (o de todos) o % de tareas hechas.
  auto_source   text check (auto_source in ('income', 'profit', 'tasks')),
  period_start  date,
  deadline      date,
  status        text not null default 'active' check (status in ('active', 'completed', 'archived')),
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (id, workspace_id),
  foreign key (business_id, workspace_id) references public.businesses (id, workspace_id) on delete set null (business_id)
);
create index goals_workspace_idx on public.goals (workspace_id, status, deadline);

create table public.goal_milestones (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  user_id       uuid not null default auth.uid() references auth.users (id),
  goal_id       uuid not null,
  title         text not null check (char_length(title) between 1 and 200),
  done          boolean not null default false,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  foreign key (goal_id, workspace_id) references public.goals (id, workspace_id) on delete cascade
);
create index goal_milestones_goal_idx on public.goal_milestones (goal_id, sort_order);

create table public.goal_progress (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  user_id       uuid not null default auth.uid() references auth.users (id),
  goal_id       uuid not null,
  recorded_on   date not null default current_date,
  value         bigint not null,
  note          text check (note is null or char_length(note) <= 500),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (goal_id, recorded_on),
  foreign key (goal_id, workspace_id) references public.goals (id, workspace_id) on delete cascade
);

-- ------------------------------------------------------------------- tareas
create table public.tasks (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  user_id       uuid not null default auth.uid() references auth.users (id),
  business_id   uuid,
  goal_id       uuid,
  parent_id     uuid,                                  -- subtarea de otra tarea (un solo nivel)
  title         text not null check (char_length(title) between 1 and 200),
  notes         text check (notes is null or char_length(notes) <= 5000),
  due_date      date,
  due_time      time,
  priority      smallint not null default 0 check (priority between 0 and 3),   -- 0 ninguna · 1 baja · 2 media · 3 alta
  status        text not null default 'open' check (status in ('open', 'done')),
  completed_at  timestamptz,
  -- {"freq":"daily|weekly|monthly|yearly","interval":1,"byweekday":[0..6],"until":"AAAA-MM-DD"}
  recurrence    jsonb check (recurrence is null or (jsonb_typeof(recurrence) = 'object' and recurrence ->> 'freq' in ('daily','weekly','monthly','yearly'))),
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (due_time is null or due_date is not null),
  unique (id, workspace_id),
  foreign key (business_id, workspace_id) references public.businesses (id, workspace_id) on delete set null (business_id),
  foreign key (goal_id, workspace_id) references public.goals (id, workspace_id) on delete set null (goal_id),
  foreign key (parent_id, workspace_id) references public.tasks (id, workspace_id) on delete cascade
);
create index tasks_open_due_idx on public.tasks (workspace_id, status, due_date);
create index tasks_business_idx on public.tasks (workspace_id, business_id) where business_id is not null;
create index tasks_goal_idx on public.tasks (goal_id) where goal_id is not null;
create index tasks_parent_idx on public.tasks (parent_id) where parent_id is not null;

-- Solo un nivel de subtareas: una subtarea no puede tener hijas ni ser hija de otra subtarea.
create or replace function public.tasks_enforce_depth()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.parent_id is not null then
    if new.parent_id = new.id then
      raise exception 'Una tarea no puede ser subtarea de sí misma';
    end if;
    if exists (select 1 from public.tasks p where p.id = new.parent_id and p.parent_id is not null) then
      raise exception 'Las subtareas solo tienen un nivel';
    end if;
    if exists (select 1 from public.tasks c where c.parent_id = new.id) then
      raise exception 'Una tarea con subtareas no puede ser subtarea';
    end if;
  end if;
  return new;
end;
$$;
create trigger tasks_depth before insert or update of parent_id on public.tasks
  for each row execute function public.tasks_enforce_depth();

-- ------------------------------------------------------------------ eventos
create table public.events (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  user_id       uuid not null default auth.uid() references auth.users (id),
  business_id   uuid,
  title         text not null check (char_length(title) between 1 and 200),
  notes         text check (notes is null or char_length(notes) <= 5000),
  location      text check (location is null or char_length(location) <= 200),
  all_day       boolean not null default false,
  start_date    date not null,
  start_time    time,
  end_date      date not null,
  end_time      time,
  recurrence    jsonb check (recurrence is null or (jsonb_typeof(recurrence) = 'object' and recurrence ->> 'freq' in ('daily','weekly','monthly','yearly'))),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (all_day or (start_time is not null and end_time is not null)),
  check (end_date >= start_date),
  check (all_day or end_date > start_date or end_time >= start_time),
  unique (id, workspace_id),
  foreign key (business_id, workspace_id) references public.businesses (id, workspace_id) on delete set null (business_id)
);
create index events_range_idx on public.events (workspace_id, start_date, end_date);

select public.apply_workspace_policies(t) from unnest(array['goals','goal_milestones','goal_progress','tasks','events']) as t;
