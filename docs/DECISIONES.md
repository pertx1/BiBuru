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
