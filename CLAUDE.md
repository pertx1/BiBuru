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
- `supabase/migrations/*.sql` migraciones versionadas (única fuente de verdad del esquema). **Se aplican solas al desplegar en producción** (`scripts/migrate.mjs` en `npm run build`, con `POSTGRES_URL_NON_POOLING` de la integración Supabase–Vercel; registro en `biburu_meta.migrations`; también programa `configure_cron`). Nunca editar una migración ya aplicada: crear una nueva.
- `public/sw.js` service worker (estáticos + página offline; nunca cachea datos).

## Autenticación (decisiones)
- Enlace mágico **y** código de 6 dígitos en el mismo correo. En iOS la PWA instalada
  y Safari tienen almacenamiento separado: el enlace abre Safari, así que dentro de
  la PWA se entra con el código. El enlace usa `token_hash` + `verifyOtp` (sin PKCE)
  para funcionar aunque se abra en otro navegador que el que lo pidió.
- **Cuenta con contraseña (sin código del correo)**: pestañas Entrar / Crear cuenta / Código por correo (`src/app/login`). Requiere en Supabase «Allow new users to sign up» ON y «Confirm email» OFF. El registro está ABIERTO por defecto; el acceso lo decide `hasAccess` (`src/lib/allowed-emails.ts`): con `OPEN_SIGNUP=false` solo la lista `ALLOWED_EMAILS`. Sin verificación de correo, el primero que registra un correo se lo queda: crear primero la cuenta propia.
- Registro (modo lista) en tres capas: (1) Supabase con "Allow new users to sign up"
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

## Avisos (Fase 5)
- Planificación pura en `src/lib/notifications/planning.ts` sobre hora «de pared» local (sin convertir a UTC); el orquestador
  `cron.ts` consulta, **reclama** cada aviso en `notification_log` (único por usuario+clave) y solo entonces envía. Si ningún dispositivo lo
  recibe por un fallo temporal se libera la reclamación (reintento al minuto siguiente); 404/410 borran la suscripción.
- El cron usa la clave de servicio (`createAdminClient`, solo servidor) porque no hay sesión de usuario. `/api/cron/*` y `/api/antola/*`
  son públicos para el proxy de sesión pero exigen su propio secreto (comparación en tiempo constante).
- Tareas y eventos NO materializan recordatorios: se calculan en cada pasada (una sola fuente de verdad, sin sincronizaciones que olvidar).
  `reminders` solo guarda los recordatorios sueltos. Un aviso de tarea solo se envía si al editarla su hora era futura.
- El service worker muestra SIEMPRE una notificación por cada push (obligatorio en iOS) y abre `/aviso/<tipo>/<id>`.

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

## IA (Fase 6)
- Toda llamada al modelo pasa por `runAi` (`src/lib/ai/run.ts`); nunca usar el SDK directamente desde páginas o acciones.
- Presupuesto en micro-euros, tope mensual en `profiles.ai_monthly_budget_cents`; el gasto se calcula desde `ai_usage` (RPC `ai_spend`).
- Gasto y pedidos solo se crean tras confirmación humana; la autoaplicación se limita a task/note/idea/event con confianza ≥ 0,85.
- Pruebas con `fakeProvider`; `server-only` está aliasado a un stub en `vitest.config.mts`.
- Si cambian modelos o precios de Gemini: variables `GEMINI_MODEL_*` y precios editables en Ajustes (tabla `ai_prices`).

## Favoritos (Fase 7)
- `saved_videos` / `video_categories` siguen la convención por espacio. `integrations` es la excepción deliberada: credencial personal, RLS por `user_id`, sin insert desde el cliente y sin permiso de lectura del token (`refresh_token_enc`); solo el servidor (clave de servicio) lo lee y descifra.
- Los módulos de `src/lib/favorites/*` que usan servidor no se importan desde componentes de cliente (usar `labels.ts` para constantes compartidas).
- Cualquier fetch a dominios externos desde enlaces del usuario se limita a dominios conocidos (anti-SSRF).
- Listas por RSS (`youtube_feeds`, `src/lib/favorites/rss.ts`): alternativa sin Google Cloud. Solo se pide `https://www.youtube.com/feeds/videos.xml?playlist_id=<id validado>`; el feed trae ~15 vídeos y nada privado/oculto. Las revisa el cron de `/api/cron/videos` (las que llevan >1 h) y, de respaldo, abrir Favoritos (`after()`).

## Inicio personalizable y navegación
- Catálogo de widgets en `src/lib/home/layout.ts` (metadatos puros: grupo, tamaños, ajustes, vista previa, por defecto) y componentes en
  `src/components/home/registry.tsx`. **Añadir un widget** = crear su componente (async, carga sus datos) + darlo de alta en `WIDGETS` y en el registro.
- Disposición y barra en `user_ui_prefs` (por usuario + espacio; RLS `user_id = auth.uid()`, como `push_subscriptions`: son preferencias personales).
  `null` = por defecto. Todo lo leído pasa por `normalizeLayout` / `normalizeTabs` (nunca confiar en el jsonb guardado).
- Cada widget va envuelto en `WidgetBoundary` + `Suspense` (aislado). El periodo de Inicio va en la URL (`?periodo=&comparar=0`); `homeRange` da actual y anterior.
- Cifras de negocio de Inicio: siempre `stats_totals` / `stats_monthly` / `stats_daily` (las mismas que Estadísticas). Colores de gráficos en tokens
  `--chart-income` / `--chart-expense` / `--good` / `--bad` (validados para daltonismo en claro y oscuro).
- Barra inferior: hasta 5 secciones + «Más» (fijo). El botón + de captura es opcional (`user_ui_prefs.show_capture_button`, apagado por
  defecto; con él caben 4). Sin él, las capturas pendientes de enviar se marcan en la primera pestaña.
- Arrastrar: `@dnd-kit` con asa (`touch-none`) para que funcione con el dedo en iOS; el DnD nativo de HTML5 no sirve en táctil.
- IA en Inicio: `src/lib/ai/home.ts` (función `brief` en `ai_usage`). Textos cacheados en `ai_home_notes` (único por usuario+espacio+tipo+día):
  el resumen se genera una vez al día al abrir Inicio; la sugerencia solo al pulsar y se reutiliza 3 h. Nunca generar en el render del servidor.
- Ajustes de widgets con elementos del usuario (objetivo, carpeta, categoría): `kind` "goal" | "folder" | "category", "" = automático;
  las listas se piden al abrir los ajustes (`loadWidgetOptions`), no en cada carga de Inicio.

## Noticias
- `src/lib/news/`: `feeds.ts` (RSS/Atom/YouTube/Google News/Mastodon + JSON público de Bluesky, og:image), `text.ts` (enlaces canónicos, clave de titular),
  `select.ts` (24 h, duplicados entre medios/redes, ya publicadas, «No me interesa», descartes por palabras, reparto por tema), `digest.ts` (esquema JSON,
  instrucciones, composición con nota ≥ 3 y máx. 10, sin IA = titulares por tema, aviso), `service.ts` (servidor: recogida, comprobación, generación, cron).
- Solo titular, entradilla, enlace, medio/autor e imagen (dirección original, carga diferida). Nunca artículos completos. Sin X, Instagram ni TikTok; sin scraping.
- Toda descarga de direcciones de usuario pasa por `src/lib/net/safe-fetch.ts` (solo IPs públicas, tiempo y tamaño máximos, redirecciones comprobadas).
  `SAFE_FETCH_ALLOW_LOCAL=1` solo existe para `scripts/e2e/news.mjs` y se ignora en Vercel.
- Idempotencia: `news_digests` único por usuario+espacio+día y se «reclama» (fila `pending`) antes de llamar a la IA; el aviso usa `notification_log`
  (`news:<día>`) desde `/api/cron/reminders`, así respeta horas de silencio. «Generar ahora»: `manual_runs` ≤ 2 (restricción en BD).
- Cron `biburu-news` cada 15 min (`/api/cron/news`): recoge 12 fuentes por pasada y genera desde 20 min antes de `profiles.news_time`.
  Respaldo: abrir Noticias genera con `after()` si ya tocaba. Una llamada a Gemini por día y usuario (`feature = 'news'`, cuenta en el presupuesto).
- Fuentes precargadas se crean «sin comprobar»; la primera recogida las marca `ok` o `down`. Las nuevas se comprueban antes de guardarse.

## Pedidos: cobros y deuda
- `order_payments` (por espacio) + `orders.paid_cents` (trigger `refresh_order_paid`) + `orders.due_cents` (columna generada: total − cobrado; 0 si
  `payment_reviewed = false` o cancelado). Pedidos anteriores a los cobros = «Sin revisar» (no son deuda) hasta `reviewOldOrders`.
- Lógica pura en `src/lib/orders/payments.ts` (estado de pago, «Quién me debe», antigüedad, filtros de la URL); lecturas en `src/lib/orders/data.ts`.
- Filtros en la URL (`q, estado, pago, fecha, desde, hasta, cliente, producto, canal`); el último se recuerda en `localStorage`. Detalle con `?abrir=`, nuevo destacado con `?nuevo=`.
- `Sheet variant="panel"`: pantalla completa en móvil y panel lateral en escritorio (formularios largos).

## Stock
- Reutiliza `tshirt_stocks`/`dtf_stocks` (Producción, con `min_quantity`) y añade `stock_items` (genéricos, vínculo opcional con pedidos por producto o nombre)
  y `stock_movements`. Claves de artículo: `tshirt|modelo|talla`, `dtf|diseño|variante`, `item|<id>`.
- Hay que pedir cuando disponible (`tienes − reservado`) ≤ 0 o < mínimo (como «Pedir ya» y BATU); reservan los pedidos `sin_hacer` y `sin_llegar`.
  Lógica pura en `src/lib/stock/shortage.ts` (`planTasks` = `applyItems` de BATU).
- `syncStockTasks(businessId)`: tarea «Pedir …» para hoy y prioridad alta por artículo (`tasks.stock_key`); una tachada que sigue faltando no se repite;
  con stock se suelta la clave (y la pendiente se completa sola). Se llama tras tocar pedidos o stock y al abrir Stock, Producción y Tareas
  (`syncAllStockTasks`). Nunca lanza.
- Pago: `markOrderUnpaid` / `restorePayments` (selector de estado de pago en la lista, con «Deshacer»).

## Correo (Outlook)
- `src/lib/mail/graph.ts` (OAuth `common`, solo `offline_access User.Read Mail.Read`, delta de la bandeja), `service.ts` (token cifrado y rotado, sync),
  `sanitize.ts` (HTML limpio + iframe `sandbox` con CSP que bloquea imágenes remotas). Solo cabeceras en BD; el cuerpo se pide al abrir.
- `mail_accounts` es credencial personal (RLS por `user_id`, sin lectura de `refresh_token_enc`/`delta_link`). Cron `biburu-mail` cada 10 min.
- La IA solo ve un correo con `profiles.mail_ai_allowed` y a petición («Resumir con IA», `feature = 'mail'`).

## Redes (Instagram y TikTok)
- Tablas comunes: `social_accounts` (tokens cifrados, ilegibles desde la app; visibles para el espacio), `social_daily` (foto diaria), `social_media`,
  `social_posts` + `social_post_targets` (una fila por red; `mode` direct/draft/assisted) + `social_post_files` (bucket privado `social-media`, carpeta del espacio).
- `src/lib/social/instagram.ts` (graph.instagram.com, contenedor → estado → publicar) y `tiktok.ts` (Login Kit, Display API, Content Posting con subida de
  archivo en un trozo). `service.ts` es el cron común (`/api/cron/social`, cada 5 min); TikTok se registra con `registerSocialHooks` desde `tiktok-service.ts`
  (impórtalo donde haga falta TikTok). Cada cuenta/destino va en su try/catch: un fallo no para a los demás.
- TikTok sin auditoría = privado: por defecto no se pide `video.publish`; modo con `tiktokModeFor` (directa solo con `TIKTOK_DIRECT_POST_AUDITED=1`).
- Las publicaciones salen en el Calendario (`postsToItems`) y se arrastran con `@dnd-kit` (asa `touch-none`, pulsación larga en táctil).

## Móvil
- `npm run test:mobile` (con la app local levantada, ver `scripts/e2e/README.md`) falla si alguna pantalla tiene scroll horizontal; informa de zonas < 44 px y letra < 16 px.
- Zonas de 44 px solo en móvil (`min-h-11 md:min-h-…`). Gestos: `SwipeRow` (tareas) y `PullToRefresh` (layout).
- Los avisos (`ToastProvider`) se muestran como `popover` para quedar encima de los `<dialog>` abiertos.

## Páginas públicas
- `/privacidad` y `/terminos` (las piden Meta y TikTok); están en `PUBLIC_PATHS` del proxy.
