-- BiBuru · Inicio, tanda 2: textos de IA cacheados para Inicio y vídeos convertidos en tarea.

-- Nueva función de IA para Inicio («Resumen del día» y «Sugerencia»): cuenta en el presupuesto como las demás.
alter table public.ai_usage drop constraint ai_usage_feature_check;
alter table public.ai_usage add constraint ai_usage_feature_check
  check (feature in ('classify', 'chat', 'voice', 'video', 'video_light', 'brief'));

-- Textos generados por la IA para Inicio. Uno por usuario, espacio, tipo y día: así el resumen se genera
-- una sola vez al día (la restricción única evita pagar dos veces si se piden a la vez) y la sugerencia se reutiliza unas horas.
create table public.ai_home_notes (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  kind          text not null check (kind in ('brief', 'suggestion')),
  day           date not null,
  content       text not null check (char_length(content) between 1 and 4000),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id, workspace_id, kind, day)
);
create trigger ai_home_notes_set_updated_at before update on public.ai_home_notes
  for each row execute function public.set_updated_at();
alter table public.ai_home_notes enable row level security;
revoke all on public.ai_home_notes from anon, authenticated;
grant select, insert, update, delete on public.ai_home_notes to authenticated;
-- Personales (resumen pensado para quien lo lee), como las preferencias de Inicio.
create policy ai_home_notes_own on public.ai_home_notes for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.is_workspace_member(workspace_id));

-- Vídeo → tarea: se recuerda la tarea creada para no volver a proponer sus ideas (widget «Ideas sin convertir»).
alter table public.saved_videos add column task_id uuid;
alter table public.saved_videos add constraint saved_videos_task_fk
  foreign key (task_id, workspace_id) references public.tasks (id, workspace_id) on delete set null (task_id);
create index saved_videos_task_idx on public.saved_videos (task_id) where task_id is not null;
