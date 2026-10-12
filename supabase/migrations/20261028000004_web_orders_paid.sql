-- Los pedidos de la web se cobran al hacerlos: salen como pagados solos.
-- «De la web» = el canal contiene la palabra «web» (Web, Tienda web, Página web…).
-- Se apunta un cobro automático (order_payments.auto_web) por lo que falte hasta el total, y se ajusta si cambia el total;
-- se quita si el pedido se cancela o deja de ser de la web. Si marcas a mano uno como «No pagado», se respeta (orders.auto_paid_off).
alter table public.order_payments add column if not exists auto_web boolean not null default false;
alter table public.orders add column if not exists auto_paid_off boolean not null default false;

create or replace function public.is_web_channel(p text)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(p ~* '(^|[^[:alpha:]])web([^[:alpha:]]|$)', false);
$$;

create or replace function public.sync_web_payment(p_order uuid)
returns void
language plpgsql
security definer   -- actúa solo sobre el pedido que se acaba de tocar (lo llama el trigger de orders)
set search_path = ''
as $$
declare
  o record;
  manual bigint;
  target bigint;
begin
  select id, workspace_id, user_id, channel, status, total_cents, order_date, auto_paid_off into o from public.orders where id = p_order;
  if not found then return; end if;
  if not public.is_web_channel(o.channel) or o.status = 'cancelado' or o.auto_paid_off then
    delete from public.order_payments where order_id = o.id and auto_web;
    return;
  end if;
  select coalesce(sum(amount_cents), 0) into manual from public.order_payments where order_id = o.id and not auto_web;
  target := o.total_cents - manual;
  if target <= 0 then
    delete from public.order_payments where order_id = o.id and auto_web;
  elsif exists (select 1 from public.order_payments where order_id = o.id and auto_web) then
    update public.order_payments set amount_cents = target, paid_on = o.order_date
     where order_id = o.id and auto_web and (amount_cents <> target or paid_on <> o.order_date);
  else
    insert into public.order_payments (workspace_id, user_id, order_id, paid_on, amount_cents, method, note, auto_web)
    values (o.workspace_id, o.user_id, o.id, o.order_date, target, 'tarjeta', 'Pagado en la web', true);
  end if;
end;
$$;
revoke all on function public.sync_web_payment(uuid) from public, anon, authenticated;

-- Los triggers son security definer para poder llamar a sync_web_payment (que nadie puede ejecutar directamente).
create or replace function public.orders_web_paid()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.sync_web_payment(new.id);
  return null;
end;
$$;
create trigger orders_web_paid after insert or update of channel, status, total_cents, order_date, auto_paid_off on public.orders
  for each row execute function public.orders_web_paid();

-- Los pedidos de la web que ya había.
select public.sync_web_payment(id) from public.orders where public.is_web_channel(channel);

-- Si se apunta o quita un cobro a mano en un pedido de la web, el automático se ajusta para no pasarse del total.
create or replace function public.order_payments_web_resync()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.sync_web_payment(coalesce(new.order_id, old.order_id));
  return null;
end;
$$;
create trigger order_payments_web_resync_ins after insert or update on public.order_payments
  for each row when (not new.auto_web) execute function public.order_payments_web_resync();
create trigger order_payments_web_resync_del after delete on public.order_payments
  for each row when (not old.auto_web) execute function public.order_payments_web_resync();
