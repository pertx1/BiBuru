-- BiBuru · Widgets que la app añade una sola vez a un Inicio ya personalizado (p. ej. «Sin fecha» y «Revisión de hoy»).
-- Si luego los quitas, no vuelven: la lista recuerda cuáles se añadieron ya. Solo añade una columna con valor por defecto.
alter table public.user_ui_prefs
  add column seeded_widgets text[] not null default '{}' check (cardinality(seeded_widgets) <= 50);
