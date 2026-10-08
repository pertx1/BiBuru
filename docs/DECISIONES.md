# Decisiones tomadas sin preguntar (trabajo nocturno)

Cada línea: qué decidí y por qué. Si quieres cambiar alguna, dímelo y lo cambio.

## General
- La rama `noche-mejoras` sale de `claude/brave-shannon-gew4x3` (la rama que despliega producción) y el pull request va contra ella: es la que hace de «main» en este proyecto.
- Las vistas previas de Vercel usan la misma base de datos que producción, pero las migraciones solo se aplican en el despliegue de producción. Por eso en la vista previa lo nuevo puede salir vacío o con «Falta conectar»; al fusionar se aplican solas. Las partes nuevas fallan «en silencio» (la lista de pedidos sigue funcionando aunque falten las tablas de cobros).

## 1. Pedidos
- No hay código ni importación del PROFITY antiguo en el repositorio: los filtros siguen la lista del encargo (buscador, estado, pago, fechas, cliente, producto, canal).
- Pedidos ya existentes = «Sin revisar»: la columna `payment_reviewed` se crea con `false` para las filas que ya hay y luego su valor por defecto pasa a `true` para los nuevos. No se toca ninguna fila.
- «Pendiente» es una columna calculada por Postgres (`due_cents`), nunca se guarda a mano: total − cobrado, y 0 si está sin revisar o cancelado.
- Registrar un cobro marca el pedido como revisado (si apuntas un cobro, ya lo has mirado).
- «Marcar como pagado» registra un cobro por lo que falte, con fecha de hoy, método «Otro» y la nota «Marcado como pagado», para que el histórico de cobros cuadre.
- Revisión en bloque «Todos están cobrados»: registra un cobro por lo que faltara con la fecha del pedido y la nota «Regularización»; así las gráficas de cobrado no se disparan hoy.
- Colores: cobrado en azul y pendiente en rojo (los mismos que ingresos/gastos). El verde/ámbar no pasaba la prueba de daltonismo.
- «Quién me debe» agrupa por nombre de cliente sin distinguir mayúsculas ni espacios (no hay ficha de clientes).
- La tarea para reclamar se crea para hoy, en el negocio, con el importe y el número de pedidos en las notas.
- Borrar un pedido borra sus cobros; «Deshacer» recupera el pedido pero no sus cobros (habría que apuntarlos otra vez).
- El último filtro se recuerda en el propio móvil/ordenador (almacenamiento local), no en la cuenta.
- El borrador del pedido nuevo se guarda en el propio dispositivo y solo cuando has escrito algo.

## 2. Stock
- Ya existía inventario de prendas (modelo + talla) y DTF (diseño + variante) en Producción, con la reserva de los pedidos pendientes. No lo dupliqué: le añadí el **stock mínimo** y lo uso tal cual. Para todo lo demás (materiales, productos terminados, negocios sin Producción) añadí «Materiales y productos» (`stock_items`).
- Reservan stock los pedidos «Sin hacer» y «Sin llegar», igual que ya hacía Producción.
- El vínculo de un artículo con los pedidos es opcional: por producto del catálogo o por nombre igual (sin mayúsculas ni acentos), y si quieres solo un color o una talla. Los pedidos no cambian.
- Falta = lo que haga falta para cubrir los pedidos y quedar en el mínimo: `max(0, mínimo − (tienes − reservado))`. Un artículo a 0 sin pedidos ni mínimo no genera tarea.
- No hay sistema de etiquetas en Tareas: la «etiqueta Stock» es una marca en la tarea (`tasks.stock_key`) que se ve como «Stock» en la lista.
- Los pedidos no tienen fecha de entrega: la fecha límite es la del pedido más antiguo que espera el artículo + 3 días (nunca antes de hoy). Si solo está bajo el mínimo, una semana. Si mueves tú la fecha más tarde, se respeta salvo que entre un pedido más urgente.
- Prioridad media en las tareas automáticas.
- Las tareas se recalculan al guardar/cambiar/borrar pedidos, al tocar el stock y al abrir la pantalla Stock (sin cron nuevo, para no gastar invocaciones).
- Completar a mano pregunta las unidades; «Completar sin registrar nada» también existe, pero si sigue faltando se abre otra tarea (una sola abierta por artículo).
- Completar desde la notificación del móvil («Hecho») no pregunta unidades.

## 3. Móvil
- Revisión con Chromium emulando iPhone porque WebKit no se puede descargar aquí. El test `npm run test:mobile` necesita la app local levantada (no va en CI).
- Tamaños de 44 px solo en móvil (`md:` mantiene el tamaño de escritorio) para no cambiar la composición en el ordenador.
- Deslizar: derecha = hecha, izquierda = mañana (la opción de posponer más usada). Solo en Tareas.

## 4. Favoritos de TikTok
- Ya existía guardar enlaces de TikTok (con oEmbed y enlaces cortos): lo he mejorado en lugar de duplicarlo.
- Datos del vídeo solo por el **oEmbed oficial** de TikTok (descripción, autor y portada). Nunca se descarga el vídeo de TikTok.
- «No disponible» = TikTok responde 400/404 al oEmbed (privado o borrado). Un 403/429 (bloqueo temporal) no lo marca.
- La portada se descarga solo de los servidores de imágenes de TikTok (`*.tiktokcdn.com`…) y como mucho 3 MB, para pasársela al modelo como imagen.
- Tu nota se envía al modelo junto al texto. Si la escribes después, hay un botón «Volver a analizar con mi nota».
- «Subir el vídeo»: el archivo va directo del móvil a Supabase Storage con una URL firmada de un solo uso (Vercel no deja pasar más de 4,5 MB por el servidor). Máx. 50 MB (límite del plan gratuito de Supabase). Hasta 14 MB va dentro de la petición a Gemini; más grande, por la Files API de Gemini, que se borra justo después. El archivo de Storage se borra al terminar (bien o mal).
- El coste se estima con la duración que lee el propio móvil antes de subir (300 tokens/s, el mismo cálculo que YouTube) y no deja subir si no cabe en lo que queda del presupuesto del mes.
- En la captura rápida, si lo que pegas es (casi solo) un enlace de vídeo, va directo a Favoritos; el texto que lo acompañe se guarda como tu nota.
- Hasta 20 enlaces por pegada.

## 5. Correo de Outlook
- Microsoft Graph con el punto `common` (sirven cuentas personales y de empresa) y solo `offline_access User.Read Mail.Read`. Con `Mail.Read` BiBuru no puede enviar, borrar ni marcar como leído: «leído» refleja lo que hagas en Outlook.
- Las cuentas son personales (como la de Google): solo las ve quien las conecta, aunque se asignen a un negocio. El token va cifrado (AES-GCM con `TOKEN_ENCRYPTION_KEY`) y la app no puede leerlo ni el enlace de sincronización.
- Primera sincronización: últimos 30 días de la Bandeja de entrada (no todo el buzón), en páginas de 50 y como mucho 250 por pasada; después solo cambios (delta) cada 10 min.
- Se guarda remitente, asunto, fecha, vista previa (300 caracteres), leído y si tiene adjuntos. El cuerpo y los adjuntos se piden al abrir y no se guardan.
- El HTML se limpia en el servidor y se muestra en un iframe aislado sin scripts; las imágenes remotas van bloqueadas hasta pulsar «Mostrar imágenes» (para que no sepan que lo has abierto).
- «Responder en Outlook» abre el mensaje en Outlook (el enlace que da Microsoft).
- La IA solo ve un correo si activas «Usar la IA con mis correos» y pulsas «Resumir con IA» en ese correo (nunca automáticamente).
- Aviso de correo nuevo apagado por defecto y por cuenta; respeta tus horas de silencio; si llegan más de 3 a la vez, uno agrupado.

## 6. Instagram
- «Instagram API con inicio de sesión de Instagram» (graph.instagram.com), no la de Facebook: no hace falta página de Facebook. Sirve para cuentas de **empresa o creador**. En modo desarrollo funciona para las cuentas que añadas como «Instagram tester» de tu app (acceso estándar, sin revisión de Meta).
- Permisos: `instagram_business_basic`, `instagram_business_content_publish`, `instagram_business_manage_insights`. No se piden mensajes ni comentarios.
- Token de 60 días, cifrado; se renueva solo cuando le quedan menos de 10 días. Aviso en Redes desde 7 días antes de caducar.
- Las cuentas y sus estadísticas son del espacio (las ve quien comparta el espacio contigo); el token nadie lo puede leer desde la app.
- Métricas: `views` en lugar de `impressions` (Meta la retiró en 2025). Seguidores diarios: Instagram solo los da con 100+ seguidores; por eso además guardo el total de seguidores en la foto diaria.
- Foto diaria de «ayer» (hora de Madrid) por el cron; 2 cuentas por pasada. Ranking con las últimas 30 publicaciones; métricas por publicación solo de las de los últimos 45 días (ahorra llamadas).
- Mejores días/horas: media de interacciones por publicación, con al menos 2 publicaciones en ese grupo para dar una recomendación.
- Gráficos de una sola serie en el azul del Resumen financiero (el rojo se reserva para «malo»).
- Programación: los archivos se suben a Storage (bucket privado, carpeta del espacio) y se pasan a Instagram con URLs firmadas de 3 h. Reintentos a los 2, 10 y 30 min; después «Error» con «Reintentar». Errores de formato no se reintentan.
- Límite de archivos: 50 MB cada uno y 500 MB en total (el plan gratuito de Supabase da 1 GB para todo). Se borran 3 días después de publicar.
- Arrastrar en el Calendario cambia solo el día (la hora se mantiene). En el móvil: mantener pulsado el asa ⋮⋮ en la vista Semana o Agenda.
- «Usar como idea» crea un borrador con el resumen, las ideas y tus notas del vídeo.
- Arreglo general: los avisos (toasts) quedaban ocultos detrás de las hojas abiertas; ahora salen encima.

## 7. TikTok de negocio
- APIs oficiales: Login Kit (token de acceso de 24 h + renovación de 365 días, ambos cifrados), Display API (perfil y vídeos) y Content Posting API.
- **Sin auditoría** TikTok obliga a que lo publicado por API sea privado (SELF_ONLY). Por eso, por defecto, BiBuru **no pide** `video.publish` y usa el mejor modo que sí sale público:
  1. **Directa**: solo si pones `TIKTOK_DIRECT_POST_AUDITED=1` en Vercel cuando TikTok apruebe la auditoría (y vuelves a conectar la cuenta).
  2. **Borrador**: con `video.upload` el vídeo llega a tu bandeja de TikTok y lo publicas tú desde la app (sale público).
  3. **Asistida**: si no hay permiso de subida, a la hora te llega un aviso; al tocarlo ves el vídeo para compartir/guardar y el texto para copiar.
- El estado general de una publicación dice «Hecha» (no «publicada») y cada red dice exactamente qué pasó: «Publicada», «Enviada a TikTok (borrador)» o «Aviso enviado».
- TikTok no da estadísticas por día: guardo cada día los acumulados de sus vídeos (visualizaciones e interacciones) y el dato del día es la diferencia con la foto anterior. El primer día no hay diferencia (sale «—»). TikTok no da «alcance».
- Subida de archivo en un solo trozo (archivos de 50 MB como mucho): no hace falta verificar un dominio en TikTok (sí haría falta para «PULL_FROM_URL»).
- El aviso de publicación asistida no respeta las horas de silencio: lo has programado tú a esa hora.
- Un fallo con una cuenta (token roto…) ya no para el cron de las demás.

## Cambios pedidos después (7/10)
- **Pagado ↔ no pagado**: el estado de pago de la lista es un selector. «Pagado» apunta un cobro por lo que falte; «Pendiente» quita los cobros del pedido
  (con «Deshacer», que los vuelve a poner). En el detalle hay «Marcar como no pagado».
- **Tareas de Stock como en BATU (Antola + Profity)**: se crea «Pedir <artículo>» cuando lo disponible está **a 0 o por debajo** (lo mismo que «Pedir ya»
  en Producción) o bajo el mínimo si le pones uno; **para hoy y prioridad alta**; la cantidad va en la nota y se actualiza sola. Si la tachas y sigue
  faltando, **no vuelve a salir**; cuando hay stock, se suelta y, si estaba pendiente, se completa sola. Tachar ya no pregunta nada (el toast ofrece
  «Apuntar unidades» si quieres). Se ponen al día también al abrir Tareas y Producción (BATU lo hacía cada hora).
- **Tareas como en Antola**: el apartado Tareas se ha rehecho siguiendo Antola, con el estilo de BiBuru.
  - **Proyectos = negocios**. Hay un chip por negocio (color e icono), y en el formulario aparece «Proyecto».
  - **Se mantiene el alta rápida** en lenguaje natural encima de la lista. El **«+» redondo** abre el formulario completo (`/tareas/nueva`).
  - **La «API» de Antola son Server Actions internas.** Hacen las mismas operaciones y siguen las mismas reglas: una tarea de otro espacio responde «No se encontró la tarea».
  - **Prioridad**: alta, media o baja (3, 2 o 1). Las que antes no tenían prioridad pasan a **media**.
  - **Repetición**: no se repite, cada día, días concretos, cada semana o cada mes. Cada tarea repetida pertenece a una serie.
    - Al completarla se crea la siguiente ocurrencia. Es única por tarea: un doble toque no la duplica.
    - Deshacer el completado borra esa siguiente ocurrencia si sigue pendiente.
    - Una repetitiva sin hacer se mueve sola a la ocurrencia de hoy, al abrir Tareas o Inicio y cada hora con el cron de avisos.
    - Repeticiones antiguas sin equivalente (cada año, cada N días o semanas, «hasta…») se aproximan y se deja una nota en la tarea para que la revises.
  - **Avisos por tarea**, como en Antola: «A una hora» o «Antes» (a la hora, 5, 10, 15 o 30 min, 1 h, 2 h o 1 día). Sin hora, «antes» se cuenta desde las 9:00.
    - **Ya no hay antelación global.** En Ajustes queda un interruptor, «Avisos de tareas».
    - A las tareas abiertas que ya tenían hora se les ha puesto «Antes» con la antelación que tenías configurada.
    - El alta rápida con hora avisa a esa hora.
  - **El cron envía cuando llega el `remind_at` de la tarea.** Respeta las horas de silencio y, si el aviso lleva más de 2 h de retraso, no lo envía.
    - El aviso muestra el título de la tarea y debajo cuándo es («Hoy a las 10:00»). Al tocarlo se abre `/tareas/<id>`.
    - Después de enviarlo, `remind_at` se borra solo si nadie lo ha cambiado mientras (compare-and-set).
  - **Posponer** (15 min o 1 h) mueve solo el aviso, no la fecha. **«Mañana»** pasa la tarea a mañana con la misma hora y el mismo aviso.
  - **Subtareas en su propia tabla** (`subtasks`), como máximo 50. Las tareas hijas que había antes se han copiado como subtareas.
  - **Clave externa `origen:clave`**, única por espacio. La usan las tareas de Stock (`stock:<negocio>:<artículo>`) y se suelta cuando ya no hace falta.
  - **Las fechas y horas «de pared» siguen en `due_date`/`due_time`.** Además se guardan los instantes UTC (`due_at`, `reminder_at`, `remind_at`), que son los que usa el cron.

## Diseño estilo Apple (7/10)
- **Más simple y limpio, según las guías de Apple (HIG).** Fondo gris agrupado de iOS, tarjetas blancas **sin borde**, controles con **relleno gris translúcido** (como los campos de búsqueda de iOS), botones en **cápsula** y un solo color de acento para lo que se pulsa.
- **Se aplica a toda la app desde `globals.css`** con unas pocas reglas globales, sin tocar cada pantalla:
  - Las tarjetas (`rounded-xl/2xl` + `bg-surface` + borde) pierden el borde.
  - Chips, campos y botones (`rounded-full/lg`) pasan a relleno gris.
  - Con «Aumentar contraste» del sistema vuelven los bordes.
- **Barra inferior flotante de cristal**, como la de iOS 26. Es la única pieza con material translúcido (la capa de navegación, nunca el contenido) y queda opaca con «Reducir transparencia».
- **Claro u oscuro según el sistema** (antes empezaba siempre en oscuro). Apple pide seguir el ajuste del iPhone. El selector de Ajustes sigue ahí por si quieres fijar uno.
- **Colores recalculados para contraste** (WCAG AA, mínimo 4,5:1 en texto pequeño):

  | Color | Claro | Oscuro |
  |---|---|---|
  | Acento | #5e50dd (5,7:1 con texto blanco) | relleno #5f52e4 (5,5:1); como texto #9d8fff (6,3:1) |
  | Rojo | #d70015 (5,4:1) | #ff6961 (6,0:1) |
  | Verde | #1f7a35 (5,4:1) | #30d158 |
  | Texto secundario | #6c6c72 (5,2:1) | #98989f (5,9:1) |

- **Listas como en Ajustes de iOS**: el separador empieza después del icono o del círculo. «Vencidas» ya no es una caja roja: solo el título en rojo, como en Recordatorios.
- **Estados de pedido**: cápsulas teñidas sin borde. El texto se mezcla con el color del tema para que se lea en claro y en oscuro.
- Se quita el subtítulo de relleno de Tareas («Lo que tienes que hacer…»).

## Trabajo autónomo «mejoras-todo» (7/10)
- **Puntos 1–5 ya estaban hechos** (pull requests anteriores): los he comprobado y no los he rehecho.
- **Tareas de Stock como en BATU** (a 0 o por debajo del mínimo, «Pedir …» para hoy): se mantiene lo que ya pediste en vez de preguntar otra vez.
- **Redes por negocio**: misma pantalla para «Todas las redes» (con filtro por negocio) y para la pestaña Redes de cada negocio (`RedesView`), así no hay dos versiones que mantener.
- **TikTok no tiene API pública de comentarios ni de mensajes** para una app propia (Login Kit no ofrece esos permisos). Su adaptador declara las capacidades a `false` y la app ofrece «Abrir mensajes en TikTok» con la explicación.
- **Permisos de mensajes de Instagram opcionales** (`/api/instagram/connect?mensajes=1`, botón «Activar mensajes»): pedirlos siempre rompería las conexiones actuales con «Invalid scopes» mientras Meta no los apruebe.
- **Webhooks + sincronización horaria**: Meta solo envía webhooks a apps en modo **Live**, y los de comentarios exigen **acceso avanzado**. Por eso, además de los webhooks (firma `X-Hub-Signature-256` comprobada), la bandeja se rellena sola cada hora, al abrir Redes (si los datos tienen más de 15 min) y con «Actualizar todo». Así funciona aunque la app siga en desarrollo.
- **Suscripción de la cuenta a webhooks** solo con `messages,comments` (modo Instagram) o `messages,feed` (modo Facebook): un campo que Meta no admita haría fallar la suscripción entera.
- **La primera sincronización de la bandeja no avisa** (si no, al conectar llegarían decenas de avisos de mensajes antiguos).
- **Nada se envía solo**: ni las respuestas guardadas ni la sugerencia de IA; siempre hay que pulsar «Enviar». Las respuestas pasan por «enviando → enviado / error» con «Reintentar».
- **IA de respuestas con la función `chat`** de `ai_usage` (cuenta en el presupuesto) para no cambiar la restricción de la tabla (migración solo aditiva). Apagada por defecto en Ajustes › Redes y mensajes.
- **Ventana de 24 h de Instagram** calculada desde el último mensaje recibido (`last_inbound_at`); pasada, se ofrece «Abrir en Instagram».
- **Mensajes borrados**: si Meta avisa de que un mensaje se borró, se borra también en BiBuru (lo pide su política).
- **«Crear pedido» desde un mensaje** abre el alta con `?crear=1&para=<nombre>&via=<red>`: los nombres `para`/`via` evitan chocar con los filtros de Pedidos (`cliente`, `canal`).
- **Sincronización dentro del cron de Redes** (cada 5 min, máx. 3 cuentas que lleven >1 h sin actualizar) en vez de un cron nuevo: Vercel Hobby limita los crons y así cada pasada es corta.
- **Límites de las redes**: si Instagram o TikTok responden «demasiadas peticiones», esa cuenta descansa 1 h (`rate_limited_until`) y se ve en su tarjeta. «Actualizar todo» funciona como mucho una vez por minuto.
- **Alertas de redes** (cifra redonda de seguidores, publicación ≥2× la media, caída brusca ≥ 2 %): apagadas por defecto; un aviso por hecho (`notification_log`) y respetan las horas de silencio.
- **Contador de mensajes** en la barra lateral y en la inferior (punto en «Redes» o en «Más»): cuenta hilos «sin responder» del espacio.

## Negocios, stock, revisiones y tareas sin fecha (8/10)
- **El stock guardado pasa a ser «lo que tienes ya descontados los pedidos nuevos».** Cada línea vinculada guarda su efecto (`order_items.stock_effects`) y `apply_order_stock` compara lo que debe haber descontado el pedido con lo que ya descontó (sus movimientos) y aplica solo la diferencia, en una transacción con `for update` sobre el pedido. Así editar ajusta la diferencia, cancelar/borrar devuelve, y repetirlo no descuenta dos veces.
- **Las líneas sin vincular (pedidos anteriores o texto libre) siguen «reservando» como antes** (columna Reservado, «Pedir ya»). Las vinculadas no reservan: ya están restadas. Antola recibe solo las sin vincular como pendientes.
- **Una línea se vincula sola** si encaja (en Producción: diseño + color + talla → prenda y DTF; si no, un artículo de Stock por producto o nombre) o eligiendo el artículo en la lista. Si no, «sin vincular al stock» y no descuenta.
- **Stock insuficiente: el pedido se guarda** y queda en negativo; aviso al guardar y la tarea «Pedir …» de siempre (la petición decía «Reponer…»: es la misma tarea, que en BiBuru se llama «Pedir …» como en BATU).
- **Editar un pedido anterior no lo hace restar**, salvo las líneas en las que eliges un artículo a mano. «Recalcular desde pedidos» (vista previa + aplicar, una vez por pedido) es la forma de hacerlo.
- **Pedidos creados con la IA** (tras confirmarlos) también descuentan; los importados de PROFITY no (son históricos).
- **Pestaña Stock = la tabla de Producción** (Pedir ya, prendas por modelo y talla, DTF) **+ Materiales y productos** debajo, para no perder los artículos genéricos. Las acciones Sumar/Restar/Fijar/Mínimo y el historial por artículo.
- **Pestañas:** se mantiene **Productos** (al final) aunque no estaba en la lista: es el catálogo con precios que usan los pedidos. **Bolsa imprenta, Facturas y Reglas Antola** solo con el módulo de producción, como antes. Las direcciones antiguas redirigen (307, no permanente, por si se vuelve atrás).
- **Ingresos** se mueve al final de Estadísticas («Ingresos sueltos»), para poder seguir añadiéndolos.
- **Pedidos por estado como en PROFITY:** no hay acceso a sus pantallas; fila de botones con el número de cada estado, que ya cuenta con el resto de filtros.
- **Resumen del negocio con el sistema de widgets de Inicio**, guardado por persona en `user_ui_prefs.business_widgets` (objeto por negocio): son preferencias personales, como Inicio. Dentro del negocio el ajuste «Negocio» no se muestra y todos los widgets usan ese negocio. El botón se llama «Editar resumen» (ya había un «Editar» del negocio).
- **Widgets de acceso** «Tareas del negocio» y «Objetivos activos» abren las secciones filtradas por el negocio. **Resumen de stock**: el valor a coste solo de artículos vinculados a un producto con coste (prendas y DTF no tienen coste guardado).
- **Mensajes del negocio:** el correo no tiene «respondido» en Outlook con permisos de lectura: se guarda en BiBuru (`mail_messages.triage`). Un correo cuenta como «sin responder» si no está leído ni marcado; leído sin marcar solo sale en «Todos».
- **Revisión:** tabla `reviews` (una por tipo y periodo y persona). La actual se calcula al momento y su foto se actualiza hasta pulsar «Revisado»; el cron (cada minuto) la genera a su hora aunque no haya avisos activados y avisa una vez (`notification_log`), fuera de horas de silencio. El stock que falta se toma de las tareas «Pedir …» abiertas (sirve igual en el cron).
- **Semanal:** de viernes a domingo revisa esa semana; de lunes a jueves, la anterior. Por defecto domingo 18:00. Sustituye el aviso antiguo de objetivos si está activa. Las 3 prioridades se crean como tareas de prioridad alta para el lunes siguiente (u hoy si ya pasó). **Mensual:** el día 1 (o el 2-3 si no se pudo) revisa el mes anterior.
- **IA en la Revisión:** solo un párrafo a petición, con las cifras (feature `review` en `ai_usage`).
- **«Sin fecha» y «Revisión de hoy» en Inicio:** en la disposición por defecto y, en un Inicio ya personalizado, se añaden una vez (`user_ui_prefs.seeded_widgets`); si los quitas no vuelven. Las tareas sin fecha también salen en el resumen de la mañana («N sin fecha esperando») y en la revisión diaria.
- **Rama `negocios-revision` sobre `mejoras-todo`** (PR #6 sin fusionar): el PR va a la rama principal y ya lleva dentro el #6.

## Sin mensajes de Instagram y TikTok (8/10)
- **Quitados a petición**: Bandeja de Redes, hilos, respuestas, webhook de Meta (`/api/webhooks/meta`), permisos de mensajes («Activar mensajes»),
  aviso de mensajes nuevos e IA de respuestas. Las tablas y columnas (`social_threads`, `social_messages`, `social_saved_replies`, `profiles.inbox_*`,
  `social_accounts.webhook_subscribed`/`inbox_synced_at`) se quedan sin usar: las migraciones son solo aditivas.
- La pestaña **Mensajes** de cada negocio y el widget «Mensajes sin responder» son solo **correo**. La Revisión cuenta solo correos.
- Los enlaces antiguos a `/redes/mensajes/<id>` llevan a Redes; Redes abre en «Contenido».
- Si en Meta quedó configurado el webhook, ahora recibirá un 404: se puede borrar en la app de Meta (no hace falta).

## Análisis de varios vídeos de YouTube (arreglo)
- Causa: al guardar varios enlaces a la vez, cada vídeo lanzaba su análisis en paralelo. Un vídeo de YouTube gasta muchos tokens y el plan
  gratuito de Gemini tiene tope por minuto: el segundo vídeo recibía **429 RESOURCE_EXHAUSTED**. `runAi` reintentaba a 1 s y 2 s (más cupo
  gastado), contaba como intento fallido y, tras 4, el vídeo quedaba en «Error» con el texto técnico en inglés.
- Ahora los vídeos se analizan **de uno en uno por espacio**: se reclama el vídeo con un `update … where analysis_status <> 'analyzing'` y, si
  hay otro analizándose (actualizado hace < 6 min), vuelve a la cola sin espera. Quien está analizando sigue con el resto de la cola
  (`analyzeAndDrain`, máx. 150 s); varios `analyzeSoon` de una misma petición van en fila. El cron también va de uno en uno y para a los 35 s.
- Un 429 no gasta intento: vuelve a la cola con la espera que pide Gemini (`retryDelay`, mín. 1 min; 3 h si el tope es diario) y un mensaje en
  español (`src/lib/ai/errors.ts`). `runAi` solo reintenta un 429 si Gemini pide ≤ 15 s.
- Vídeo con `mediaResolution: low` (~100 tokens/s en vez de ~300): 3 veces menos tokens y coste, de sobra para un resumen.
- `maxOutputTokens` 1500 → 8192: en los modelos que «piensan», el pensamiento cuenta en ese tope y podía cortar el JSON («La IA no devolvió
  un análisis válido»). Solo se paga lo que se usa.
- Los vídeos que ya estaban en «Error» por esto (429, cuota, saturado o análisis no válido) vuelven solos a la cola en la siguiente pasada del cron.
- Prueba: `scripts/e2e/videos-queue.mjs` (Gemini falso que da 429 si recibe dos vídeos a la vez).
