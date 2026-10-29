-- Reordenar las categorías de los vídeos ya analizados con el árbol nuevo («IA › Claude»), sin volver a analizarlos:
-- la IA solo ve título, canal y resumen. null = pendiente de reordenar (todos los que ya estaban); el análisis nuevo ya lo hace.
alter table public.saved_videos add column if not exists recategorized_at timestamptz;
create index if not exists saved_videos_recat_idx on public.saved_videos (workspace_id) where recategorized_at is null and analysis_status = 'ready';
-- Lo que se ha elegido a mano no lo cambia la IA.
alter table public.saved_videos add column if not exists category_manual boolean not null default false;

alter table public.ai_usage drop constraint ai_usage_feature_check;
alter table public.ai_usage add constraint ai_usage_feature_check
  check (feature in ('classify', 'chat', 'voice', 'video', 'video_light', 'brief', 'news', 'mail', 'review', 'recategorize'));
