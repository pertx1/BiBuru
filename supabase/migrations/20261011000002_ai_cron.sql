-- Amplía configure_cron: además de los avisos, programa la cola de clasificación de IA
-- (reintenta lo que quedó pendiente en la bandeja). Se puede repetir sin duplicar.
create or replace function public.configure_cron(app_url text, secret text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  base text := rtrim(app_url, '/');
begin
  if app_url !~ '^https://' then
    raise exception 'La URL debe empezar por https://';
  end if;
  if char_length(secret) < 20 then
    raise exception 'El secreto debe tener al menos 20 caracteres';
  end if;
  perform cron.schedule(
    'biburu-reminders',
    '* * * * *',
    format(
      $cmd$select net.http_post(url := %L, headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', %L), body := '{}'::jsonb, timeout_milliseconds := 25000)$cmd$,
      base || '/api/cron/reminders', 'Bearer ' || secret
    )
  );
  perform cron.schedule(
    'biburu-ai',
    '*/2 * * * *',
    format(
      $cmd$select net.http_post(url := %L, headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', %L), body := '{}'::jsonb, timeout_milliseconds := 25000)$cmd$,
      base || '/api/cron/ai', 'Bearer ' || secret
    )
  );
  return 'Programado: biburu-reminders (cada minuto) y biburu-ai (cada 2 minutos)';
end;
$$;
revoke all on function public.configure_cron(text, text) from public, anon, authenticated;
