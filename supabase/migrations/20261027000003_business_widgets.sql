-- BiBuru · Resumen de cada negocio con widgets (como Inicio). La disposición es personal: se guarda por usuario y espacio,
-- un objeto { "<id del negocio>": [widgets] }. Vacío = la disposición por defecto. Solo añade una columna.
alter table public.user_ui_prefs
  add column business_widgets jsonb not null default '{}'::jsonb check (jsonb_typeof(business_widgets) = 'object');
