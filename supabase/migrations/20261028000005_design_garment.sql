-- «Prenda fija» de un diseño: al pedirlo resta esa prenda (de la talla del pedido) aunque el color diga otra cosa.
-- P. ej. Gatazka Sudadera y Eguzkilore siempre van en Sudadera negra.
alter table public.dtf_designs add column if not exists garment_model text check (garment_model is null or char_length(garment_model) between 1 and 40);

-- Lo pedido: Gatazka Sudadera y Eguzkilore → la sudadera del negocio (si existe).
update public.dtf_designs d
   set garment_model = (select t.model from public.tshirt_stocks t
                         where t.business_id = d.business_id and lower(t.model) like '%sudadera%'
                         order by (lower(t.model) like '%negra%') desc, t.model limit 1)
 where d.garment_model is null and lower(btrim(d.name)) in ('gatazka sudadera', 'eguzkilore');
