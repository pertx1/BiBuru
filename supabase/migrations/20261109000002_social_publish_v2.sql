-- Redes v2: bloqueo para no enviar dos veces, texto distinto por red.
-- Solo añade columnas y una función.
alter table public.social_post_targets add column if not exists locked_until timestamptz;
alter table public.social_posts add column if not exists caption_instagram text check (caption_instagram is null or char_length(caption_instagram) <= 2200);
alter table public.social_posts add column if not exists caption_tiktok text check (caption_tiktok is null or char_length(caption_tiktok) <= 2200);

-- Reclama un destino para publicarlo: una sola orden UPDATE, así dos pasadas del programador (o «Publicar ahora» y el
-- programador a la vez) nunca envían lo mismo. El bloqueo dura hasta p_until (se suelta al terminar el paso).
create or replace function public.claim_social_target(p_id uuid, p_until timestamptz)
returns boolean
language sql
set search_path = ''
as $$
  with c as (
    update public.social_post_targets set locked_until = p_until
     where id = p_id and status in ('pendiente', 'publicando')
       and (next_try_at is null or next_try_at <= now())
       and (locked_until is null or locked_until < now())
    returning 1)
  select exists (select 1 from c);
$$;
revoke execute on function public.claim_social_target(uuid, timestamptz) from public, anon, authenticated;
do $$ begin
  if exists (select from pg_roles where rolname = 'service_role') then
    grant execute on function public.claim_social_target(uuid, timestamptz) to service_role;
  end if;
end $$;
