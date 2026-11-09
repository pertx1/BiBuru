-- Akerra: Eguzkilore va en sudadera gris, negra o blanca según el color del pedido (prenda fija «Sudadera» = familia,
-- ver designGarment en src/lib/production/catalog.ts). Se crean las sudaderas que falten, con las tallas de las que ya hay
-- (o S–XXL) y cantidad 0 para que no cambie lo que tienes. Solo añade: no toca cantidades ni borra nada.
do $$
declare
  b record;
  c text;
  model_name text;
  sizes text[];
begin
  for b in select id, workspace_id, user_id from public.businesses where name ilike '%akerra%' loop
    select coalesce(array_agg(distinct t.size), array['S','M','L','XL','XXL']) into sizes
      from public.tshirt_stocks t where t.business_id = b.id and lower(t.model) like 'sudadera%';
    if array_length(sizes, 1) is null then sizes := array['S','M','L','XL','XXL']; end if;
    foreach c in array array['gris', 'negra', 'blanca'] loop
      -- Si ya existe con otras mayúsculas («Sudadera Gris»), se usa esa.
      select t.model into model_name from public.tshirt_stocks t
       where t.business_id = b.id and lower(btrim(t.model)) = 'sudadera ' || c limit 1;
      model_name := coalesce(model_name, 'Sudadera ' || c);
      insert into public.tshirt_stocks (workspace_id, user_id, business_id, model, size, quantity)
      select b.workspace_id, b.user_id, b.id, model_name, s, 0 from unnest(sizes) s
      on conflict (business_id, model, size) do nothing;
      model_name := null;
    end loop;
    update public.dtf_designs set garment_model = 'Sudadera'
     where business_id = b.id and lower(btrim(name)) like '%eguzkilore%';
  end loop;
end $$;
