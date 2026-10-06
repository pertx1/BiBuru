-- BiBuru · Barra inferior sin el botón + (opcional): hasta 5 secciones + «Más».
alter table public.user_ui_prefs drop constraint user_ui_prefs_mobile_tabs_check;
alter table public.user_ui_prefs add constraint user_ui_prefs_mobile_tabs_check check (mobile_tabs is null or cardinality(mobile_tabs) <= 5);
-- El botón + de captura en el centro de la barra: apagado por defecto (la captura sigue en Inicio y en el escritorio).
alter table public.user_ui_prefs add column show_capture_button boolean not null default false;
