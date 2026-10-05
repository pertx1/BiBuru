-- BiBuru · Fase 8 · Borrado de cuenta: al borrar un usuario de auth, se borran en cascada todos sus datos.
-- Las tablas de datos tenían `user_id references auth.users` sin cascada y bloqueaban el borrado.
-- Se recrean todas esas claves foráneas con `on delete cascade` (también las de tablas futuras si se repite esta migración).
do $$
declare r record;
begin
  for r in
    select c.conrelid::regclass as tbl, c.conname, a.attname as col
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f' and c.confrelid = 'auth.users'::regclass and c.confdeltype = 'a'
      and c.connamespace = 'public'::regnamespace and array_length(c.conkey, 1) = 1
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
    execute format('alter table %s add constraint %I foreign key (%I) references auth.users (id) on delete cascade', r.tbl, r.conname, r.col);
  end loop;
end $$;
