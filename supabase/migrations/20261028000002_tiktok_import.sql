-- Favoritos y «Me gusta» importados desde «Descargar tus datos» de TikTok.
alter table public.saved_videos drop constraint if exists saved_videos_added_via_check;
alter table public.saved_videos add constraint saved_videos_added_via_check
  check (added_via in ('manual', 'youtube_like', 'youtube_playlist', 'tiktok_import'));
