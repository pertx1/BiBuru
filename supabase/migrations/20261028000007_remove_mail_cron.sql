-- El correo (Outlook) se quitó de BiBuru: se deja de programar su tarea (cada 10 min) y configure_cron ya no la crea.
-- Las tablas del correo se quedan (las migraciones solo añaden); la app ya no las lee ni las escribe.
create or replace function public.configure_cron(app_url text, secret text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  base text := rtrim(app_url, '/');
  tpl text := $cmd$select net.http_post(url := %L, headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', %L), body := '{}'::jsonb, timeout_milliseconds := 25000)$cmd$;
begin
  if app_url !~ '^https://' then
    raise exception 'La URL debe empezar por https://';
  end if;
  if char_length(secret) < 20 then
    raise exception 'El secreto debe tener al menos 20 caracteres';
  end if;
  perform cron.schedule('biburu-reminders', '* * * * *', format(tpl, base || '/api/cron/reminders', 'Bearer ' || secret));
  perform cron.schedule('biburu-ai', '*/2 * * * *', format(tpl, base || '/api/cron/ai', 'Bearer ' || secret));
  perform cron.schedule('biburu-videos', '*/3 * * * *', format(tpl, base || '/api/cron/videos', 'Bearer ' || secret));
  perform cron.schedule('biburu-youtube-sync', '5 */6 * * *', format(tpl, base || '/api/cron/youtube-sync', 'Bearer ' || secret));
  perform cron.schedule('biburu-news', '*/15 * * * *', format(tpl, base || '/api/cron/news', 'Bearer ' || secret));
  perform cron.schedule('biburu-social', '*/5 * * * *', format(tpl, base || '/api/cron/social', 'Bearer ' || secret));
  if exists (select 1 from cron.job where jobname = 'biburu-mail') then
    perform cron.unschedule('biburu-mail');
  end if;
  return 'Programado: avisos (1 min), IA (2 min), vídeos (3 min), YouTube (6 h), noticias (15 min) y redes (5 min)';
end;
$$;
revoke all on function public.configure_cron(text, text) from public, anon, authenticated;

-- Si ya estaba programada, se quita ahora (solo donde existe pg_cron).
do $$
declare found boolean;
begin
  if to_regclass('cron.job') is null then return; end if;
  execute 'select exists (select 1 from cron.job where jobname = $1)' into found using 'biburu-mail';
  if found then execute 'select cron.unschedule($1)' using 'biburu-mail'; end if;
end $$;
