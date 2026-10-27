-- BiBuru · Redes: historias de Instagram, historias de TikTok (asistidas) y Shorts de YouTube, sin Metricool.
-- Solo añade: YouTube como red y un formato por destino. Una misma cuenta puede recibir la publicación y la historia a la vez,
-- así que la clave única del destino pasa a ser (publicación, cuenta, formato).

alter table public.social_accounts drop constraint if exists social_accounts_platform_check;
alter table public.social_accounts add constraint social_accounts_platform_check check (platform in ('instagram', 'tiktok', 'youtube'));

-- Formato del destino: Instagram post/reel/story, TikTok video/story, YouTube short.
alter table public.social_post_targets add column format text;
update public.social_post_targets t
   set format = case
     when a.platform = 'tiktok' then 'video'
     when p.media_kind in ('reel', 'video') then 'reel'
     else 'post'
   end
  from public.social_accounts a, public.social_posts p
 where a.id = t.account_id and p.id = t.post_id;
update public.social_post_targets set format = 'post' where format is null;
alter table public.social_post_targets alter column format set not null;
alter table public.social_post_targets alter column format set default 'post';
alter table public.social_post_targets add constraint social_post_targets_format_check check (format in ('post', 'reel', 'story', 'video', 'short'));

-- YouTube exige declarar si el vídeo está hecho para niños.
alter table public.social_post_targets add column made_for_kids boolean not null default false;

alter table public.social_post_targets drop constraint if exists social_post_targets_post_id_account_id_key;
alter table public.social_post_targets add constraint social_post_targets_post_account_format_key unique (post_id, account_id, format);
