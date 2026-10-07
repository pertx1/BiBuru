-- BiBuru · Tareas como en Antola (BATU): prioridad alta/media/baja, recordatorio por tarea (a una hora o «antes»),
-- repetición simple (cada día, días concretos, cada semana, cada mes) con series, subtareas en su propia tabla
-- y clave externa para integraciones («origen:clave»). Convierte los datos existentes; no borra columnas.

-- ---------------------------------------------------------------- prioridad: 1 baja · 2 media · 3 alta
alter table public.tasks drop constraint if exists tasks_priority_check;
update public.tasks set priority = 2 where priority = 0;
alter table public.tasks alter column priority set default 2;
alter table public.tasks add constraint tasks_priority_check check (priority between 1 and 3);

-- ---------------------------------------------------------------- columnas nuevas
alter table public.tasks
  -- Instante UTC de la tarea (fecha + hora local de su autor). Solo si tiene hora; la fecha y hora «de pared» siguen en due_date/due_time.
  add column due_at                  timestamptz,
  add column reminder_mode           text not null default 'none' check (reminder_mode in ('none', 'at_time', 'before')),
  add column reminder_at             timestamptz,                         -- modo «a una hora»
  add column reminder_minutes_before integer check (reminder_minutes_before is null or reminder_minutes_before in (0, 5, 10, 15, 30, 60, 120, 1440)),
  -- Próximo aviso pendiente (lo calcula la app; el cron lo pone a null tras enviarlo).
  add column remind_at               timestamptz,
  add column repeat                  text not null default 'none' check (repeat in ('none', 'daily', 'weekdays', 'weekly', 'monthly')),
  add column repeat_days             smallint[] not null default '{}' check (repeat_days <@ array[0,1,2,3,4,5,6]::smallint[]),  -- 0 = domingo
  add column series_id               uuid,
  add column spawned_from_id         uuid,
  add column external_key            text check (external_key is null or char_length(external_key) between 3 and 200);

-- Una tarea solo genera una siguiente (completar dos veces a la vez no duplica).
alter table public.tasks add constraint tasks_spawned_from_unique unique (spawned_from_id);
alter table public.tasks add constraint tasks_spawned_from_fk
  foreign key (spawned_from_id, workspace_id) references public.tasks (id, workspace_id) on delete set null (spawned_from_id);

create index tasks_remind_at_idx on public.tasks (remind_at) where remind_at is not null;
create index tasks_repeat_due_idx on public.tasks (workspace_id, due_date) where repeat <> 'none' and status = 'open';

-- ---------------------------------------------------------------- subtareas (antes: tareas hijas con parent_id)
create table public.subtasks (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  user_id       uuid not null default auth.uid() references auth.users (id),
  task_id       uuid not null,
  title         text not null check (char_length(title) between 1 and 300),
  done          boolean not null default false,
  position      integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  foreign key (task_id, workspace_id) references public.tasks (id, workspace_id) on delete cascade
);
create index subtasks_task_idx on public.subtasks (task_id, position);
create index subtasks_workspace_idx on public.subtasks (workspace_id);
select public.apply_workspace_policies('subtasks');

insert into public.subtasks (workspace_id, user_id, task_id, title, done, position, created_at)
select c.workspace_id, c.user_id, c.parent_id, left(c.title, 300), c.status = 'done',
       (row_number() over (partition by c.parent_id order by c.sort_order, c.created_at))::int - 1, c.created_at
from public.tasks c where c.parent_id is not null;
delete from public.tasks where parent_id is not null;

-- ---------------------------------------------------------------- repetición: de jsonb a repeat/repeat_days
-- Antes: {"freq","interval","byweekday" (0 = lunes),"until"}. Ahora: opciones de Antola (días con 0 = domingo).
-- Lo que no tiene equivalente exacto (cada año, cada N días/semanas/meses, «hasta») se aproxima y se deja una nota.
with src as (
  select t.id, t.due_date,
         t.recurrence ->> 'freq' as freq,
         coalesce((t.recurrence ->> 'interval')::int, 1) as every,
         coalesce(array(select ((d::int + 1) % 7)::smallint from jsonb_array_elements_text(coalesce(t.recurrence -> 'byweekday', '[]'::jsonb)) d order by 1), '{}') as days,
         t.recurrence ->> 'until' as until
  from public.tasks t where t.recurrence is not null
), conv as (
  select id, due_date, until, every, freq, days,
    case
      when freq = 'daily' then 'daily'
      when freq = 'weekly' and cardinality(days) > 1 then 'weekdays'
      when freq = 'weekly' and cardinality(days) = 1 and due_date is not null and days[1] <> extract(dow from due_date)::smallint then 'weekdays'
      when freq = 'weekly' then 'weekly'
      when freq = 'monthly' then 'monthly'
      else 'none'
    end as rep
  from src
)
update public.tasks t set
  repeat = c.rep,
  repeat_days = case when c.rep = 'weekdays' then c.days else '{}' end,
  -- Repetir sin fecha: Antola pone hoy. Aquí, la fecha en que se creó.
  due_date = coalesce(t.due_date, case when c.rep <> 'none' then t.created_at::date end),
  series_id = case when c.rep <> 'none' then t.id end,
  recurrence = null,
  notes = case
    when c.freq = 'yearly' then left(concat_ws(E'\n\n', t.notes, 'Antes se repetía cada año: ahora no se repite. Revísala.'), 5000)
    when c.every > 1 or c.until is not null then left(concat_ws(E'\n\n', t.notes,
      'Antes se repetía ' || case c.freq when 'daily' then 'cada ' || c.every || ' días' when 'weekly' then 'cada ' || c.every || ' semanas' else 'cada ' || c.every || ' meses' end
      || coalesce(' hasta el ' || to_char(c.until::date, 'DD/MM/YYYY'), '') || '. Ahora se aproxima: revísala.'), 5000)
    else t.notes end
from conv c where c.id = t.id;

-- ---------------------------------------------------------------- hora UTC y recordatorios
-- Instante de las tareas con hora, en la zona del perfil de quien las creó.
update public.tasks t set due_at = (t.due_date + t.due_time) at time zone coalesce(p.timezone, 'Europe/Madrid')
from public.profiles p where p.user_id = t.user_id and t.due_date is not null and t.due_time is not null;
update public.tasks set due_at = (due_date + due_time) at time zone 'Europe/Madrid' where due_at is null and due_date is not null and due_time is not null;

-- Antes el aviso era global (profiles.task_lead_minutes) para toda tarea con hora. Se pasa a cada tarea abierta
-- con hora como «antes» con la opción más cercana por debajo, y solo se programa si aún no ha pasado.
update public.tasks t set
  reminder_mode = 'before',
  reminder_minutes_before = (select max(m) from unnest(array[0, 5, 10, 15, 30, 60, 120, 1440]) m where m <= coalesce(p.task_lead_minutes, 0))
from public.profiles p where p.user_id = t.user_id and t.status = 'open' and t.due_at is not null;
update public.tasks set remind_at = due_at - make_interval(mins => reminder_minutes_before)
where reminder_mode = 'before' and due_at is not null and due_at - make_interval(mins => reminder_minutes_before) > now();

-- «Avisos de tareas» (Ajustes): apaga solo los de tareas.
alter table public.profiles add column task_reminders_enabled boolean not null default true;

-- ---------------------------------------------------------------- clave externa (integraciones)
-- Igual que Antola: «origen:clave», única por espacio. Las tareas de Stock pasan a tener la suya (una por artículo).
with k as (
  select id, 'stock:' || business_id || ':' || stock_key as key,
         row_number() over (partition by workspace_id, business_id, stock_key order by (status = 'open') desc, created_at desc) as n
  from public.tasks where stock_key is not null and business_id is not null
)
update public.tasks t set external_key = k.key from k where k.id = t.id and k.n = 1;
create unique index tasks_external_key_idx on public.tasks (workspace_id, external_key) where external_key is not null;
