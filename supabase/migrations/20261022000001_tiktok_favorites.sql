-- BiBuru · Favoritos de TikTok: en qué se basa cada análisis, vídeos no disponibles y subida temporal del vídeo. Solo añade.

-- «Texto y portada» (descripción, hashtags, autor e imagen de portada) o «Vídeo completo» (archivo subido por la persona).
alter table public.saved_videos add column analysis_basis text
  check (analysis_basis is null or analysis_basis in ('texto', 'texto_portada', 'video_completo', 'enlace'));
-- Privado o borrado en TikTok (el oEmbed oficial no lo devuelve): se guarda igualmente, marcado.
alter table public.saved_videos add column unavailable boolean not null default false;
-- Archivo subido para el análisis completo (ruta en Storage); se borra al terminar.
alter table public.saved_videos add column upload_path text check (upload_path is null or char_length(upload_path) <= 300);
alter table public.saved_videos add column upload_duration_sec integer check (upload_duration_sec is null or upload_duration_sec between 1 and 36000);

-- Bucket privado y temporal. Solo el servidor lo lee y lo borra (clave de servicio); la subida usa una URL firmada de un solo uso.
-- 50 MB = límite por archivo del plan gratuito de Supabase.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('video-uploads', 'video-uploads', false, 52428800, array['video/mp4', 'video/quicktime', 'video/webm'])
on conflict (id) do nothing;
