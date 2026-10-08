# Progreso

| Fase | Estado |
|---|---|
| 1 · Base (repo, Supabase, Vercel, login, navegación, PWA) | **Hecha en código, pendiente de tu verificación** |
| 2 · Negocios, pedidos, gastos, estadísticas, importación PROFITY | **Hecha en código, pendiente de tu verificación** |
| 2B · Módulo de producción (stock, DTF, bolsa imprenta, facturas, Antola) | **Hecha en código, pendiente de tu verificación** |
| 3 · Tareas, calendario, objetivos | **Hecha en código, pendiente de tu verificación** |
| 4 · Captura, bandeja, notas, carpetas, búsqueda | **Hecha en código, pendiente de tu verificación** |
| 5 · Notificaciones push y tareas programadas | **Hecha en código, pendiente de tu verificación** |
| 6 · IA (clasificación, chat, voz, control de gasto) | Pendiente |
| 7 · Favoritos (vídeos) | Pendiente |
| 8 · Pulido | Pendiente |

## Negocios, stock, revisiones y tareas sin fecha (rama `negocios-revision`)
- **Cada pedido resta del stock** (transacción en BD; editar = diferencia; cancelar/borrar devuelve), vínculo por línea, aviso de falta, historial por artículo y «Recalcular desde pedidos».
- **Revisión diaria/semanal/mensual**: sección nueva, generación y aviso a su hora, histórico, interactiva, «Revisado», prioridades, IA opcional, filtro por negocio, widget.
- **Sin fecha** en Inicio (bloque fijo) y en el resumen de la mañana.
- **Negocios**: pestañas reordenadas (Producción, Ingresos, Tareas y Objetivos fuera, con redirección), Stock en tabla, botones por estado en Pedidos, Resumen con widgets por negocio (7 nuevos).
- **Mensajes por negocio** (correo + Instagram + TikTok) y Ajustes › Cuentas sin negocio.
- Pruebas: unitarias, `test:db` (pedidos a la vez, cancelar, editar…), y `scripts/e2e/negocios-revision.mjs` en el navegador.

## Mejoras «todo de una» (rama `mejoras-todo`)
- **Redes por negocio**: pestaña **Redes** en cada negocio y «Todas las redes» con filtro por negocio. Tarjeta por cuenta (seguidores, +hoy/+semana,
  sin responder, «Actualizado hace X min», límites). Secciones Bandeja / Contenido / Estadísticas (suma de todas o detalle por cuenta).
- **Bandeja unificada** (`social_threads`, `social_messages`, `social_saved_replies`): mensajes, comentarios y menciones de Instagram con filtros,
  búsqueda, etiquetas, hilo completo, respuesta (pública/privada en comentarios, ventana de 24 h), ocultar comentario, respuestas guardadas,
  «Sugerir respuesta» con IA (apagada), Crear pedido/tarea/nota, vínculo con cliente o pedido, avisos, contador y widget. Webhook verificado en
  `/api/webhooks/meta`. TikTok: «Abrir mensajes en TikTok» (no hay API). **Falta conectar**: permisos de mensajes y webhook en Meta.
- **Actualización automática**: cada hora (dentro del cron de Redes), al abrir si >15 min, «Actualizar todo» y tirar hacia abajo; tiempo real en la
  bandeja (Supabase Realtime, con respaldo cada minuto); alertas opcionales; foto diaria a medianoche; renovación de tokens y «Reconectar».

## Fase 1 — qué hay
- Next.js 16 + TS estricto + Tailwind 4, tema claro/oscuro, componentes base.
- Login por correo (enlace + código de 6 dígitos), registro cerrado, proxy de sesión.
- Migración `20261005000001_base.sql`: workspaces, miembros, perfiles, RLS, alta automática.
- 9 tests de permisos (RLS) + 4 de `ALLOWED_EMAILS`.
- Navegación móvil (barra inferior + botón de captura) y escritorio (barra lateral).
- PWA: manifest, iconos, service worker, página sin conexión, guía de instalación en iPhone.
- CI en GitHub Actions y workflow para aplicar migraciones a Supabase.

## Fase 2 — qué hay
- Migración `20261006000001_businesses.sql`: negocios, categorías de gasto, productos, pedidos + líneas
  (totales mantenidos por trigger), gastos (recurrentes y adjuntos), ingresos sueltos, estadísticas en SQL
  (`stats_*`), bucket privado `receipts` con RLS. Referencias entre workspaces imposibles (FK compuestas).
- App: `/negocios` (tarjetas por negocio con variación y vista global con comparativa), y por negocio:
  Resumen, Pedidos (filtros, líneas, estado rápido), Gastos (filtros, categorías editables, recurrentes, foto del
  ticket), Ingresos, Productos, Estadísticas (selector de periodo + comparación). Deshacer en vez de confirmar.
  Exportación CSV de pedidos y gastos (`;`, coma decimal, BOM, anti-inyección de fórmulas).
- Importación de PROFITY: `npm run import:profity:dry` (simula) y `npm run import:profity` (importa, repetible sin
  duplicar, con conciliación de nº y suma entre origen y destino).
- Tests: 22 de SQL/permisos, más dinero, fechas, validación, CSV e importación (unitarios).
- Probado de extremo a extremo con Postgres + PostgREST reales locales (`scripts/e2e/`): crear negocio, pedido,
  gasto, ingreso, estadísticas, CSV e importación (dos veces, sin duplicar).

## Fase 2B — módulo de producción (portado de PROFITY)
- Se activa por negocio (casilla en «Editar negocio»). Pestaña **Producción**: Stock (prendas por modelo y talla, DTF por diseño),
  «Pedir ya» (stock − pedidos sin hacer/sin llegar, como en PROFITY), Bolsa para la imprenta (con marcas y aviso de «ha cambiado»),
  Reglas de color de DTF, Facturas (enlaces) y conexión con Antola.
- Catálogo editable (antes estaba fijo en el código): modelos de prenda y diseños DTF (únicos o blanco/negro).
- Antola: `GET /api/antola/stock` con `Authorization: Bearer pf_…`. Solo se guarda el hash; la función SQL `antola_snapshot`
  es lo único que un usuario sin sesión puede llamar. La clave de PROFITY no se puede migrar (solo guardaba el hash): hay que generar una nueva.
- El script de importación trae también stock, reglas, diseños y facturas.

## Fase 3 — tareas, calendario y objetivos
- **Tareas**: alta en una línea en español («llamar a la imprenta mañana a las 10 #akerra !!», «cada lunes»…), vistas Hoy / 7 días / Todas /
  Por negocio / Hechas, atrasadas arrastradas a Hoy, subtareas, prioridad, recurrencia, posponer (1 hora, esta tarde, mañana, semana que viene),
  deshacer en todo. Al completar una tarea recurrente se crea la siguiente (sin generar atrasadas).
- **Calendario**: mes, semana (cuadrícula con franjas en escritorio, lista por días en móvil) y agenda; eventos con recurrencia y varios días;
  tareas con fecha; color por negocio; tocar un día para añadir.
- **Objetivos**: número, euros, porcentaje o hitos; progreso manual o automático (ingresos/beneficio del periodo del negocio, o % de tareas
  vinculadas); histórico; ritmo («va con retraso»); tareas vinculadas; día/hora de revisión semanal en Ajustes (el aviso llega en la Fase 5).
- Pendiente de fases posteriores: vínculo de tareas con carpetas (Fase 4), avisos (Fase 5).
- Tests: lógica de recurrencias, alta rápida (40 casos), posponer, calendario, objetivos, agrupación y 14 de SQL (permisos, integridad).

## Fase 4 — captura, bandeja, notas y búsqueda
- **Captura rápida**: botón central (móvil) / «Captura rápida» (escritorio). Abre al instante, Enter guarda. La captura se escribe primero en el
  dispositivo (IndexedDB, con localStorage de reserva) y luego se envía; sin red o con fallo no se pierde y se reenvía sola al volver la
  conexión, al abrir la app o cada 30 s. El envío es idempotente (`client_id`): reenviar no duplica.
- **Bandeja**: cada captura se convierte con un toque en tarea (entiende fechas y recurrencia) o nota, o se descarta; todo con «Deshacer».
- **Notas**: Markdown con barra de formato, vista previa segura (sin HTML ni imágenes remotas), autoguardado con copia local si no hay red,
  fijar, negocio, carpeta y etiquetas. **Carpetas** en árbol con arrastrar y soltar (notas y carpetas), renombrar, subcarpetas y borrado
  seguro (nada se pierde; se deshace).
- **Etiquetas** compartidas por notas y tareas (y vídeos en la Fase 7). **Tareas** ya tienen carpeta y etiquetas.
- **Búsqueda global** (Ctrl/Cmd+K y botón en móvil): Postgres full-text en español sobre notas, tareas, pedidos (cliente, nº, productos) y
  gastos; busca por raíz (camiseta ↔ camisetas) y mientras escribes.
- Tests: 63 de SQL (permisos, ciclos de carpetas, búsqueda, idempotencia) y la cola sin conexión (7) + validación.

## Fase 5 — avisos y tareas programadas
- **Web Push estándar** (VAPID, sin proveedores externos). Alta guiada en Ajustes: en iPhone enseña a instalar la app y pide el permiso con un
  botón (iOS exige gesto del usuario); botón «Enviar aviso de prueba»; lista de dispositivos.
- **Tipos de aviso**: tarea con hora (antelación configurable), evento con hora (antelación configurable), recordatorio suelto
  («recuérdame el viernes a las 9 pedir presupuesto»), resumen de la mañana, atrasadas por la tarde y revisión semanal de objetivos.
  Horas de silencio: no se envía nada; lo que cae en ese tramo llega al terminar si sigue siendo útil.
- **Al tocar el aviso** se abre `/aviso/...` con «Hecho» y «Posponer» (1 h, esta tarde, mañana, semana). Android y escritorio además
  muestran los botones en la propia notificación (iOS no los admite).
- **Cron**: Supabase Cron (`pg_cron` + `pg_net`) llama cada minuto a `/api/cron/reminders` con `CRON_SECRET`. Se activa una vez con
  `select public.configure_cron('https://TU-APP.vercel.app', 'TU_CRON_SECRET');`. Alternativa: cron-job.org (GET o POST con cabecera
  `Authorization: Bearer …`). El endpoint es idempotente (registro `notification_log`) y borra suscripciones caducadas (404/410).
- Probado con un «servicio push» local que **descifra** los avisos (RFC 8291): 6 tipos de aviso, sin duplicados al repetir, reintento tras
  fallo temporal, borrado de suscripciones caducadas y horas de silencio. Tests: 17 de planificación + 8 de SQL + conversión de hora local ↔ UTC con cambios de hora.
- Pendiente de ti: generar claves (`npm run vapid`), `CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY` en Vercel y programar el cron (ver README).

## Fase 6 — IA (Gemini)
- Todo pasa por `runAi` (`src/lib/ai/run.ts`): presupuesto mensual (10 € por defecto, bloquea al 100 %, aviso push al 80 %),
  límite de peticiones por minuto (`AI_MAX_RPM`, contado en BD), reintentos con espera ante 429/503 y registro de tokens/coste en `ai_usage`.
- Proveedor abstracto (`AiProvider`): Gemini en producción y `fakeProvider` en pruebas (sin gastar nada).
- Bandeja: cada captura se clasifica en segundo plano (`after()`); propuesta con Aceptar / Corregir / Descartar.
  Gastos y pedidos **nunca** se aplican solos; tarea/nota/idea/evento con confianza ≥ 0,85 solo si activas «aplicar solo» (con Deshacer).
- Chat (`/chat`) con herramientas (buscar, listar, crear/editar tareas, notas, eventos, recordatorios; gastos y pedidos como propuesta con confirmación).
- Dictado por voz: audio WAV 16 kHz generado en el navegador, transcrito en servidor, no se guarda el audio. Botón en la captura rápida y en el chat.
- Ajustes → Inteligencia artificial: consumo del mes por función, presupuesto, autoaplicar y precios por modelo (editables).
- Cron `/api/cron/ai` (cada 2 min vía `configure_cron`) reintenta capturas pendientes de clasificar.
- Tests: `src/lib/ai/*.test.ts` (precios, clasificación, `runAi` con BD en memoria y proveedor falso) y `tests/ai.test.ts` (RLS).
- **Sin verificar con servicios reales**: no hay clave de Gemini en el entorno de desarrollo; nombres de modelo y precios por defecto son estimaciones (configurables).

## Fase 7 — Favoritos (vídeos)
- Enlaces de YouTube y TikTok desde Favoritos o desde la captura rápida (la bandeja los manda a Favoritos). Sin duplicados (por id y por URL).
  TikTok: oEmbed oficial + resolución de enlaces cortos (solo dominios de TikTok, sin scraping ni descargas).
- OAuth de Google solo lectura (`youtube.readonly`), token cifrado AES-256-GCM (`TOKEN_ENCRYPTION_KEY`), columna ilegible desde el navegador (permisos de columna + RLS por usuario).
  Sincroniza «Me gusta» y listas elegidas cada 6 h (`/api/cron/youtube-sync`) y con «Sincronizar ahora». «Ver más tarde» no es accesible por la API de Google.
- Análisis con Gemini (cola `/api/cron/videos`, reintentos, estados pendiente/analizando/listo/error/espera confirmación): resumen, puntos clave, categoría reutilizada, etiquetas, ideas, negocio y utilidad 1–5.
  YouTube por URL directa; TikTok y otros solo con texto (la ficha lo indica). Vídeos largos (umbral editable, 20 min): coste estimado y confirmación; análisis ligero casi gratis.
- Vistas por estado/categoría/negocio, búsqueda (también en la búsqueda global), orden por utilidad o fecha, categorías (renombrar, fijar, fusionar), convertir en tarea o nota.
- Cron: `configure_cron` programa avisos, IA, vídeos y YouTube (volver a ejecutarlo una vez).
- Prueba e2e con Gemini falso: `scripts/e2e/phase67.mjs`. Corregido: el cron necesita permiso de ejecución de `ai_spend`/`ai_recent_calls` para `service_role`.
- **Sin verificar con servicios reales**: OAuth/API de YouTube y oEmbed de TikTok (solo probados con respuestas simuladas); duración desconocida (sin cuenta conectada) se estima en 30 min.

## Fase 8 — pulido
- Inicio completo (captura, hoy/atrasadas, eventos, recordatorios, negocios del mes con variación, objetivos, bandeja y vídeos por revisar).
- Lectura sin conexión (service worker v3 + aviso), exportación JSON/CSV, borrado de cuenta con cascada (arreglo: las FK `user_id` ahora son `on delete cascade`), CSP, asistente de claves en Ajustes.
- Rendimiento medido en local: páginas principales 13–30 ms de servidor (sin latencia de red a Supabase); gráficos cargados bajo demanda; índices GIN para búsqueda.
- Revisión de seguridad: endpoints con secreto o sesión, token cifrado y columna no legible, SSRF acotado a dominios conocidos, `npm audit --omit=dev` sin avisos (los 5 de dev son de `eslint-config-next`).
- Guía PDF final: `docs/BiBuru-Guia-Completa.pdf`.
- **Pendiente / límites**: asistente de importación Excel/CSV dentro de la app (hoy: script con Codespaces); pruebas contra Supabase/Vercel/iPhone/Gemini/YouTube reales; edición sin conexión.

## Inicio personalizable y barra configurable (tanda 1)
- Inicio = rejilla de widgets (2 columnas en móvil, 4 en escritorio) sin banner: fila fina con fecha, lupa y «Editar»; selector de periodo común
  (hoy, 7 días, 30 días, este mes, este año) con «Comparar» (periodo anterior «hasta hoy», como Shopify).
- Modo edición: añadir (galería agrupada con vista previa), quitar (con Deshacer), mover arrastrando desde ⠿ (`@dnd-kit`, funciona con el dedo),
  tamaño pequeño/mediano/grande y ajustes por widget. «Restablecer». Se guarda en `user_ui_prefs` (por usuario y espacio, RLS) y se ve igual en todos los dispositivos.
- Widgets: Resumen financiero (grande, primero por defecto: totales de siempre + «este mes», área de ingresos/gastos de 3/6/12 meses), Ventas y
  Beneficio y margen (tarjeta estilo Shopify: cifra, % con flecha, línea actual + discontinua anterior, tooltip), Tareas de hoy (se marcan),
  Agenda de hoy (eventos y recordatorios), Captura rápida, Objetivos activos, Bandeja y Vídeos por ver.
- Cada widget carga con su propio `Suspense` (esqueleto) y `WidgetBoundary` (si falla, aviso solo en su hueco). Nueva función SQL `stats_daily`.
- Barra inferior: Ajustes → Navegación (hasta 4 secciones, arrastrar para ordenar, restablecer). «Más» y el botón + son fijos; «Más» lista lo demás.
- Tests: normalización/guardado de disposición y barra, periodos, abreviaturas; en BD, RLS de `user_ui_prefs` y que el Resumen y la serie diaria cuadran con `stats_totals` (Estadísticas).
- Barra sin el botón +: ahora caben 5 secciones + «Más». El + se puede volver a activar en Ajustes → Navegación (entonces caben 4).
- **Tanda 2 (hecha)**: 24 widgets más (33 en total). Negocios: gastos por categoría, pedidos pendientes/últimos, comparativa entre negocios.
  Tareas: atrasadas, próximos 7 días, de un negocio, completadas esta semana (barras). Calendario: próximo evento con cuenta atrás, mini calendario del mes,
  semana de un vistazo. Objetivos: anillo de un objetivo, el más urgente, evolución (línea). Notas: fijadas, últimas, acceso a carpeta.
  Favoritos: más útiles (4–5), ideas sin convertir en tarea (nuevo `saved_videos.task_id`), últimos guardados, por categoría.
  IA: preguntar (abre el chat con `?q=` y lo envía), resumen del día (una vez al día, tabla `ai_home_notes`), consumo del mes, «¿Qué hago ahora?» (al pulsar, se reutiliza 3 h).
  Nueva función de IA `brief` (cuenta en el presupuesto). Probado con Gemini falso: la segunda visita no vuelve a llamar a la IA.
  anillo/evolución de objetivo, notas fijadas/últimas/carpeta, favoritos útiles/ideas/categorías, IA: preguntar, resumen del día cacheado, consumo, sugerencia).

## Noticias (resumen diario útil para el negocio)
- Sección «Noticias»: lo más importante (3 puntos), noticias con foto (la principal grande), resumen propio, medio con enlace, etiqueta Periódico/red,
  negocio al que aplica, «Qué puedes hacer», «No contrastado» para redes sin medio que lo recoja, idea del día, filtros por negocio/tema/tipo,
  histórico por días y buscador. Acciones: tarea (con la acción sugerida), nota, Útil y No me interesa (afinan los días siguientes). «Generar ahora» (2 al día).
- Ajustes → Noticias: activar, hora (8:00), fines de semana, temas (crear, editar, ordenar, desactivar) y fuentes (añadir con comprobación, activar, quitar, ver caídas).
- Fuentes: medios por RSS (13 precargadas: Expansión, Cinco Días, elEconomista, Xataka, Genbeta, Marketing4eCommerce, TechCrunch, The Verge y 5 búsquedas de Google News),
  YouTube (canal por ID), Bluesky (API pública oficial), Mastodon (RSS de la cuenta), newsletters y blogs (Substack y autodescubrimiento). X descartado a petición.
- Aviso push diario «Tus noticias de hoy» con titular principal, número y foto (Android/escritorio; el iPhone no muestra fotos en avisos de apps web).
- Widgets: Noticias de hoy (en la disposición por defecto), Idea del día y Noticias de un negocio.
- Probado de punta a punta en local con feeds, Gemini y servicio push falsos (`scripts/e2e/news.mjs`): duplicados, deportes y antiguas fuera, una sola IA,
  un solo resumen y un solo aviso con dos ejecuciones del cron, og:image, sin presupuesto → titulares, límite de 2 «Generar ahora».
- **Sin verificar con servicios reales**: que los feeds precargados respondan (el entorno de desarrollo no sale a internet; se comprueban solos en producción)
  y que `pg_cron` esté activo en tu Supabase.

## Trabajo nocturno (rama `noche-mejoras`)
Guía para ti: `docs/QUE-TENGO-QUE-HACER.md` (y `.pdf`, `npm run guide:pdf`). Decisiones: `docs/DECISIONES.md`. Móvil: `docs/movil/CAMBIOS.md`.
- **Pedidos**: estado de pago (Pendiente / Pago parcial / Pagado / Sin revisar), cobros por pedido, «Marcar como pagado», «Añadir cobro», «Me deben»,
  «Quién me debe» con gráficos (cobrado/pendiente por mes y antigüedad), tarea para reclamar, filtros con etiquetas y totales, «Nuevo pedido» aparte con
  borrador y pedido destacado. Widget «Pendiente de cobro».
- **Stock**: mínimos, materiales y productos, movimientos, tareas «Reponer» automáticas (una por artículo, se actualizan y se completan solas; al completarlas
  a mano preguntan las unidades). Pantalla Stock y widget «Stock que falta».
- **Móvil**: auditoría de 31 pantallas a 375/390/430 px sin scroll horizontal, zonas de 44 px, letra de 16 px, campo enfocado visible con teclado,
  deslizar tareas, tirar para actualizar, esqueleto de carga en negocios. Test `npm run test:mobile`.
- **Favoritos de TikTok**: pegar uno o varios enlaces (botón «Pegar», también desde la captura rápida), análisis con descripción, hashtags, autor, portada
  (como imagen) y tu nota; «No disponible» si es privado/borrado; «Subir el vídeo» para el análisis completo con coste estimado; reintento con un toque.
- **Correo de Outlook**: solo lectura con Microsoft Graph, varias cuentas por negocio, bandeja unificada con filtros, lector seguro, adjuntos bajo demanda,
  Crear tarea / Guardar como nota / Responder en Outlook, aviso de correo nuevo (apagado), IA opcional. **Falta conectar** (registro en Microsoft).
- **Instagram**: estadísticas diarias, ranking, mejores días y horas, comparación, programación (foto/carrusel/reel) con reintentos, calendario de
  contenido con arrastrar, «Usar como idea», widgets. **Falta conectar** (app de Meta en modo desarrollo).
- **TikTok de negocio**: estadísticas diarias y programación en tres niveles (directa si se audita, borrador en TikTok, asistida con aviso). **Falta conectar**.
- Extras: `/privacidad` y `/terminos`; los avisos ya se ven encima de las hojas abiertas.
- **Sin probar con servicios reales** (no hay internet ni claves en el entorno): Microsoft, Meta, TikTok, subida a Storage. Todo lo demás, con pruebas
  unitarias, de base de datos (permisos) y de extremo a extremo en local (`scripts/e2e/{orders,stock,gestures,tiktok,mail,social,tiktok-business}.mjs`).

### Decisiones y diferencias respecto a PROFITY
- Beneficio = ingresos (pedidos no cancelados + ingresos sueltos) − gastos, igual que PROFITY. El coste unitario de
  los pedidos es informativo (no se resta otra vez para no contar dos veces).
- `price` de un pedido en PROFITY es el total. Si no es divisible entre la cantidad, se importa como 1 línea de
  cantidad 1 con el total exacto (los totales mandan) y se avisa.
- Los apuntes de Vinted (categoría/fuente «Vinted») se importan a un negocio aparte si se desea.
- **Pendiente (Fase 2b, a decidir):** stock de camisetas y DTF, reglas de color DTF, bolsa de imprenta, facturas
  (enlaces) y el endpoint de Antola de PROFITY. Mientras tanto, PROFITY debe seguir funcionando.
- **Pendiente:** asistente de importación de Excel/CSV dentro de la app (alternativa al script).

## Pendiente de ti (Fase 1)
Seguir los pasos de la Fase 1 (resumen en README): crear Supabase, aplicar migración, crear tu usuario,
subir a Vercel, probar en ordenador e iPhone.

## Notas para la Fase 2
- El esquema real de PROFITY (Postgres + Prisma, **no SQLite**) es más rico que el del
  encargo: `Expense`, `Income`, `Order` (una línea por pedido: modelo, color, talla,
  precio), `VintedItem`, `TshirtStock`, `DtfStock`, `Invoice`, `ShirtDtfRule`,
  `DesignDtfRule`, `PrintBagCheck`. Hay que decidir cómo se conserva todo.
- `npm audit` marca 5 avisos en la cadena de `eslint-config-next` (solo herramientas de
  desarrollo, no llegan a producción).
