-- BiBuru · Cada pedido resta del stock.
-- Solo añade: columnas nuevas (nulas o con valor por defecto), una función, triggers y una nueva versión de antola_snapshot.
-- Los pedidos anteriores NO descuentan (sus líneas no tienen `stock_effects`); para eso está «Recalcular desde pedidos».

-- Qué descuenta cada línea: el artículo elegido (stock_key) y el efecto calculado al guardar (prenda y/o DTF o artículo).
-- `stock_effects` = [{ "key": "tshirt|negra|M", "label": "Camiseta negra M", "qty": 2 }] (qty = unidades totales de la línea).
-- null = línea «sin vincular al stock» (texto libre o pedido anterior): no descuenta y sigue reservando como antes.
alter table public.order_items
  add column stock_key text check (stock_key is null or char_length(stock_key) between 1 and 200),
  add column stock_effects jsonb check (stock_effects is null or (jsonb_typeof(stock_effects) = 'array' and jsonb_array_length(stock_effects) <= 10));

-- Movimientos ligados a un pedido: son el «libro» que dice cuánto ha descontado ya cada pedido (así editar ajusta solo la diferencia).
alter table public.stock_movements
  add column order_id uuid,
  add column source text not null default 'manual' check (source in ('manual', 'pedido', 'recalculo')),
  add column order_label text check (order_label is null or char_length(order_label) <= 200),
  add constraint stock_movements_order_fk foreign key (order_id, workspace_id) references public.orders (id, workspace_id) on delete set null (order_id);
create index stock_movements_order_idx on public.stock_movements (order_id) where order_id is not null;
create index stock_movements_item_idx on public.stock_movements (workspace_id, business_id, item_key, created_at desc);

-- ---------------------------------------------------------------- aplicar el stock de un pedido
-- Compara lo que el pedido DEBE haber descontado (sus líneas vinculadas; nada si está cancelado o se borra) con lo que YA descontó
-- (sus movimientos) y aplica solo la diferencia. Idempotente: llamarla dos veces no descuenta dos veces.
-- `for update` sobre el pedido serializa dos llamadas a la vez sobre el mismo pedido; `quantity = quantity - x` es atómico entre pedidos.
-- security invoker: se aplica con los permisos de quien guarda (RLS).
create or replace function public.apply_order_stock(p_order uuid, p_clear boolean default false)
returns table (item_key text, label text, delta integer, quantity integer)
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  o record;
  r record;
  v_qty integer;
  v_item uuid;
  v_reason text;
  v_label text;
begin
  select id, workspace_id, business_id, user_id, status, order_number, customer into o from public.orders where id = p_order for update;
  if not found then return; end if;
  v_label := left(coalesce(nullif('Pedido ' || coalesce('#' || o.order_number, ''), 'Pedido '), 'Pedido') || coalesce(' · ' || o.customer, ''), 200);

  for r in
    with desired as (
      select e->>'key' as k, max(e->>'label') as lbl, sum(greatest((e->>'qty')::integer, 0)) as q
      from public.order_items i
      cross join lateral jsonb_array_elements(coalesce(i.stock_effects, '[]'::jsonb)) e
      where i.order_id = p_order and not p_clear and o.status <> 'cancelado' and coalesce(e->>'key', '') <> ''
      group by 1
    ),
    applied as (
      select m.item_key as k, max(m.label) as lbl, -sum(m.delta) as q
      from public.stock_movements m
      where m.order_id = p_order and m.source in ('pedido', 'recalculo')
      group by 1
    )
    select coalesce(d.k, a.k) as k, coalesce(d.lbl, a.lbl) as lbl, coalesce(d.q, 0) - coalesce(a.q, 0) as diff, coalesce(a.q, 0) as before_q
    from desired d full join applied a on a.k = d.k
    where coalesce(d.q, 0) <> coalesce(a.q, 0)
  loop
    v_qty := null;
    if r.k like 'tshirt|%' then
      update public.tshirt_stocks s set quantity = s.quantity - r.diff
      where s.workspace_id = o.workspace_id and s.business_id = o.business_id and s.model = split_part(r.k, '|', 2) and s.size = split_part(r.k, '|', 3)
      returning s.quantity into v_qty;
    elsif r.k like 'dtf|%' then
      update public.dtf_stocks s set quantity = s.quantity - r.diff
      where s.workspace_id = o.workspace_id and s.business_id = o.business_id and s.name = split_part(r.k, '|', 2) and s.variant = split_part(r.k, '|', 3)
      returning s.quantity into v_qty;
    elsif r.k ~ '^item\|[0-9a-fA-F-]{36}$' then
      v_item := split_part(r.k, '|', 2)::uuid;
      update public.stock_items s set quantity = s.quantity - r.diff
      where s.workspace_id = o.workspace_id and s.business_id = o.business_id and s.id = v_item
      returning s.quantity into v_qty;
    end if;
    if v_qty is null then continue; end if;  -- el artículo ya no existe: no hay nada que mover

    v_reason := case
      when p_clear then 'Pedido borrado'
      when o.status = 'cancelado' then 'Pedido cancelado'
      when r.before_q = 0 then 'Pedido'
      else 'Pedido editado'
    end;
    insert into public.stock_movements (workspace_id, user_id, business_id, item_key, label, kind, delta, reason, moved_on, order_id, source, order_label)
    values (o.workspace_id, coalesce(auth.uid(), o.user_id), o.business_id, r.k, left(coalesce(r.lbl, r.k), 200),
            case when r.diff > 0 then 'salida' else 'entrada' end, -r.diff, v_reason,
            (now() at time zone 'Europe/Madrid')::date, p_order, 'pedido', v_label);

    item_key := r.k; label := coalesce(r.lbl, r.k); delta := -r.diff; quantity := v_qty;
    return next;
  end loop;
end;
$$;
revoke all on function public.apply_order_stock(uuid, boolean) from public;
grant execute on function public.apply_order_stock(uuid, boolean) to authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.apply_order_stock(uuid, boolean) to service_role;
  end if;
end $$;

-- Cancelar (o des-cancelar) un pedido devuelve (o vuelve a quitar) su stock.
create or replace function public.orders_stock_on_status()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform public.apply_order_stock(new.id);
  return new;
end;
$$;
create trigger orders_stock_status after update of status on public.orders
  for each row when (old.status is distinct from new.status) execute function public.orders_stock_on_status();

-- Borrar un pedido devuelve su stock. Si se está borrando el negocio entero (cascada), no hay nada que devolver.
create or replace function public.orders_stock_on_delete()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if exists (select 1 from public.businesses b where b.id = old.business_id)
     and exists (select 1 from public.stock_movements m where m.order_id = old.id) then
    perform public.apply_order_stock(old.id, true);
  end if;
  return old;
end;
$$;
create trigger orders_stock_delete before delete on public.orders
  for each row execute function public.orders_stock_on_delete();

-- ---------------------------------------------------------------- Antola
-- Las líneas ya descontadas del stock no deben contar otra vez como pendientes.
create or replace function public.antola_snapshot(p_hash text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  t record;
begin
  select * into t from public.api_tokens where token_hash = p_hash and kind = 'antola';
  if not found then
    return null;
  end if;
  return jsonb_build_object(
    'designs', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'kind', kind)) from public.dtf_designs where business_id = t.business_id), '[]'::jsonb),
    'tshirt_stocks', coalesce((select jsonb_agg(jsonb_build_object('model', model, 'size', size, 'quantity', quantity)) from public.tshirt_stocks where business_id = t.business_id), '[]'::jsonb),
    'dtf_stocks', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'variant', variant, 'quantity', quantity)) from public.dtf_stocks where business_id = t.business_id), '[]'::jsonb),
    'shirt_rules', coalesce((select jsonb_agg(jsonb_build_object('shirt_color_key', shirt_color_key, 'dtf_color', dtf_color)) from public.shirt_dtf_rules where business_id = t.business_id), '[]'::jsonb),
    'design_rules', coalesce((select jsonb_agg(jsonb_build_object('design', design, 'dtf_color', dtf_color)) from public.design_dtf_rules where business_id = t.business_id), '[]'::jsonb),
    'pending_items', coalesce((
      select jsonb_agg(jsonb_build_object('product_name', i.product_name, 'color', i.color, 'size', i.size, 'quantity', i.quantity))
      from public.orders o join public.order_items i on i.order_id = o.id
      where o.business_id = t.business_id and o.status in ('sin_hacer', 'sin_llegar') and i.stock_effects is null
    ), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.antola_snapshot(text) from public;
grant execute on function public.antola_snapshot(text) to anon, authenticated;
