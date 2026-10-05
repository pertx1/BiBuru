@AGENTS.md

# BiBuru · decisiones de arquitectura y convenciones

Panel personal ("segundo cerebro") para llevar varios negocios y el día a día.
Prioridades: apuntar algo cuesta <5 s, nada se pierde, 0 € fijos al mes
(salvo la API de Gemini, tope 10 €/mes). Interfaz en español de España, euros,
fechas dd/mm/aaaa, semana desde lunes, zona `Europe/Madrid`.

## Pila
Next.js 16 (App Router, **`proxy.ts` en vez de `middleware.ts`**), React 19,
TypeScript estricto, Tailwind 4, Supabase (Postgres + Auth + RLS), Vercel Hobby.
Los componentes de `src/components/ui` son estilo shadcn/ui escritos a mano
(el registro de shadcn no es accesible desde el entorno de desarrollo): mismas
convenciones (cva + `cn`), se pueden sustituir por los oficiales sin cambiar la API.
Antes de usar una API de Next lee `node_modules/next/dist/docs/` (ver AGENTS.md).

## Estructura
- `src/app/(app)/…` secciones protegidas con barra lateral/inferior.
- `src/app/login`, `src/app/auth/confirm` acceso (código de 6 dígitos + enlace).
- `src/proxy.ts` refresca sesión y redirige a `/login` si no hay sesión o el
  correo no está en `ALLOWED_EMAILS`.
- `src/lib/supabase/{server,client}.ts` clientes; `database.types.ts` tipos.
- `supabase/migrations/*.sql` migraciones versionadas (única fuente de verdad del esquema).
- `public/sw.js` service worker (estáticos + página offline; nunca cachea datos).

## Autenticación (decisiones)
- Enlace mágico **y** código de 6 dígitos en el mismo correo. En iOS la PWA instalada
  y Safari tienen almacenamiento separado: el enlace abre Safari, así que dentro de
  la PWA se entra con el código. El enlace usa `token_hash` + `verifyOtp` (sin PKCE)
  para funcionar aunque se abra en otro navegador que el que lo pidió.
- Registro cerrado en tres capas: (1) Supabase con "Allow new users to sign up"
  desactivado (usuarios creados a mano), (2) `ALLOWED_EMAILS` en la acción de login,
  `/auth/confirm` y `proxy.ts`, (3) RLS. Lista vacía = no entra nadie.
- **Abrir el registro más adelante**: activar "Allow new users to sign up" en Supabase,
  poner `shouldCreateUser: true` en `requestLogin` y sustituir `ALLOWED_EMAILS` por
  una tabla de invitaciones (o ampliar la variable).

## Modelo multiusuario y espacios compartidos
- Cada usuario nuevo recibe, por el trigger `handle_new_user`, un `workspace`
  "Personal", una fila `workspace_members` (rol `owner`) y un `profile`.
- **Convención para TODA tabla de datos futura**: columnas `id uuid`, `user_id`
  (quien la crea), `workspace_id` (a quién pertenece), `created_at`, `updated_at`
  (trigger `set_updated_at`). Políticas RLS: `using (is_workspace_member(workspace_id))`
  para leer y escribir; `with check` además exige `user_id = auth.uid()` al insertar.
  Índice en `workspace_id`. Los inserts desde el cliente rellenan `workspace_id` con
  `profiles.default_workspace_id`.
- Hoy cada usuario solo es miembro de su espacio, así que ve solo lo suyo. **Para
  compartir**: crear un workspace nuevo y añadir miembros en `workspace_members`
  (la política `workspace_members_insert` ya lo permite a owner/admin). Ninguna tabla
  ni política cambia; solo hay que añadir UI (selector de espacio, invitaciones).
- Nunca usar `user_id = auth.uid()` en políticas de lectura de datos: rompería el
  compartir. `user_id` es autoría, `workspace_id` es pertenencia.
- Las funciones `is_workspace_member/admin` son `security definer` con
  `search_path = ''` y usan `(select auth.uid())` para evaluarse una vez por consulta.

## Negocios, dinero y estadísticas (Fase 2)
- Dinero en céntimos enteros (`src/lib/money.ts`); fechas contables como `date` ISO sin zona (`src/lib/dates.ts`),
  solo "hoy" depende de Europe/Madrid. Nunca `float` ni `Date` para importes/fechas contables.
- Agregados (totales, serie mensual, rankings) se calculan en Postgres con funciones `stats_*` `security invoker`
  (RLS aplica). Los totales de cada pedido los mantiene el trigger `refresh_order_totals`.
- Referencias entre tablas con FK compuesta `(id, workspace_id)`: un negocio de un workspace no se puede enlazar
  desde otro. Toda tabla nueva sigue la misma plantilla (ver migración 2) y su test en `tests/`.
- Borrados con "Deshacer": el cliente conserva una copia y la restaura con el mismo `id` (acciones de guardado
  aceptan `id` y hacen upsert). No hay borrado lógico.
- Tipos: `npm run db:types` regenera `database.types.ts` desde las migraciones (sin Docker).
- Server Actions en `src/app/(app)/negocios/actions.ts`; lecturas en `src/lib/data.ts`.

## Producción (Fase 2B)
- Tablas por negocio (`tshirt_stocks`, `dtf_designs`, `dtf_stocks`, `shirt_dtf_rules`, `design_dtf_rules`, `print_bag_checks`, `invoices`,
  `api_tokens`). La lógica pura vive en `src/lib/production/` (catálogo, stock, bolsa) con tests; el stock mostrado es siempre
  `base − demanda de pedidos pendientes`, nunca se guarda ya descontado.
- Helper SQL `apply_workspace_policies(tabla)`: aplica trigger `updated_at`, RLS y permisos estándar a una tabla nueva (usarlo en migraciones).
- Antola no usa la service role: `antola_snapshot(hash)` (security definer) es la única función ejecutable por `anon`.

## Tareas, calendario y objetivos (Fase 3)
- Fechas y horas «de pared»: `date` + `time` en la zona del perfil, sin convertir a UTC. El cron (Fase 5) las interpreta con `profiles.timezone`.
  Es lo que evita saltos al cambiar la hora y hace triviales las recurrencias.
- Recurrencias propias (`src/lib/tasks/recurrence.ts`) sobre fechas ISO: diaria, semanal (días, semana desde lunes), mensual y anual,
  sin derivar el día 31 ni el 29 de febrero. Guardadas como jsonb `{freq, interval, byweekday, until}`. No se usa `rrule` por sus problemas
  con zonas horarias; el motor está cubierto por tests.
- Alta rápida: parser determinista (`quick-parse.ts`). `chrono-node` se probó y falla con «pasado mañana» o «5 de la tarde».
  La IA (Fase 6) puede reutilizar el mismo parser como base.
- Completar una tarea recurrente crea la siguiente ocurrencia (desde hoy si se completó tarde); eso permite deshacer borrando la creada.
- Valores de objetivos en punto fijo ×100 (euros = céntimos). Progreso automático calculado al leer; el histórico guarda un punto por día.
- Subtareas: un solo nivel, forzado por trigger.

## Captura, notas y búsqueda (Fase 4)
- Una captura nunca depende de la red ni de la IA: `enqueue` (IndexedDB) → `captureItem` (idempotente por `client_id`) → bandeja. La IA (Fase 6)
  solo añade una propuesta (`inbox_items.proposal`); si falla, la captura sigue ahí.
- Búsqueda: columnas `fts` generadas (`to_tsvector('spanish', …)`) + GIN; `search_all(ws, q)` es `security invoker` y construye la consulta
  con prefijos (`prefix_tsquery`). Los vídeos se añaden en la Fase 7 ampliando esa función.
- Carpetas: sin ciclos (trigger); borrar una carpeta sube sus subcarpetas y deja las notas sin carpeta.
- Markdown: `react-markdown` sin HTML en bruto; imágenes e iframes desactivados.
- DnD nativo de HTML5: hay que poner `dropEffect = "move"` en `dragover` o Chromium cancela el soltado.

## Seguridad
- Secretos solo en servidor; en el cliente únicamente `NEXT_PUBLIC_*` (URL y clave
  publishable de Supabase).
- Toda entrada se valida con Zod. Respuesta de login idéntica exista o no el correo.
- Cabeceras de seguridad en `next.config.ts`.
- Tests de permisos: `npm run test:db` (Postgres real + stub de Supabase en
  `supabase/tests/`); deben ampliarse con cada tabla nueva.

## Convenciones de código
- Español en la interfaz y comentarios; identificadores de código en inglés.
- Dinero en céntimos enteros (Fase 2). Fechas en UTC en base de datos, mostrar en la
  zona del perfil.
- Zonas táctiles ≥ 44 px (`min-h-11`), inputs `text-base` en móvil (evita zoom de iOS),
  áreas seguras con `.pt-safe`/`.pb-safe`.
- Commits pequeños y descriptivos. CI: lint, typecheck, test, test:db, build.
