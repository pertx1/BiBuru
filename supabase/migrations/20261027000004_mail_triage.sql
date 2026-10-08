-- BiBuru · Mensajes de cada negocio: el correo también se puede marcar como «respondido» o «archivado» en BiBuru
-- (no cambia nada en Outlook). Solo añade una columna nula y el permiso de cambiarla (solo tus correos).
alter table public.mail_messages
  add column triage text check (triage is null or triage in ('respondido', 'archivado'));
grant update (triage) on public.mail_messages to authenticated;
create policy mail_messages_update_triage on public.mail_messages for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create index mail_messages_untriaged_idx on public.mail_messages (account_id, received_at desc) where triage is null and not is_read;
