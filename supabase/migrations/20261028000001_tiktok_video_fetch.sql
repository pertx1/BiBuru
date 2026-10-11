-- TikTok: el análisis intenta bajar el vídeo para que la IA lo vea entero.
-- 'ok' = se analizó el vídeo; 'failed' = no se pudo bajar y se analizó con el texto y la portada; null = sin intentar
-- (los TikTok analizados antes de esto vuelven solos a la cola una vez).
alter table public.saved_videos add column if not exists tiktok_fetch text check (tiktok_fetch in ('ok', 'failed'));
