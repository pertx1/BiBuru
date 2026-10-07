# Qué tengo que hacer yo

Hola. He hecho de una vez todas las mejoras del panel. Aquí tienes **todo lo que te toca a ti**, paso a paso y con palabras sencillas, como si te lo explicara un amigo.

**Cómo leer esta guía:**

- Ve **en orden**. Lo primero es lo más importante.
- Cada bloque dice si es **OBLIGATORIO** u **OPCIONAL**, cuánto tarda y si cuesta dinero (todo es **gratis**).
- Cada paso es **un solo gesto**. Haz uno, mira que ha salido bien y pasa al siguiente.
- Las palabras en **negrita** son los botones o textos exactos que verás en la pantalla.
- Cada bloque termina con **«Sabrás que ha salido bien cuando…»** y **«Si te sale este error, haz esto…»**.
- Tu app está en **https://bi-buru.vercel.app**. Si alguna vez pone otra dirección, usa la tuya.

> Dos palabras que verás mucho:
> - **Variable**: un nombre y un valor secreto que se guardan en Vercel para que la app funcione (por ejemplo, la «llave» para hablar con Instagram).
> - **Webhook**: un «timbre». Cuando alguien te escribe en Instagram, Meta toca el timbre de BiBuru y el mensaje aparece al momento.

---

## 1. Resumen: cómo está cada cosa

| # | Función | Estado | En una frase |
|---|---|---|---|
| 1 | Pedidos: cobros, «Me deben», filtros, «Nuevo pedido» | **Hecha** (ya estaba) | La he comprobado y no la he rehecho. |
| 2 | Stock que falta, en Tareas | **Hecha** (ya estaba) | «Pedir …» para hoy cuando algo se acaba, como en BATU. |
| 3 | Que vaya bien en el móvil | **Hecha** (ya estaba) | Botones grandes, sin zoom, deslizar y tirar para actualizar. |
| 4 | Favoritos de TikTok pegando el enlace | **Hecha** (ya estaba) | Pegas el enlace y se analiza solo. |
| 5 | Correo de Outlook | **Hecha · falta conectar** | Falta registrar la app en Microsoft (bloque D). |
| 6 | Redes por negocio | **Hecha · falta conectar** | Pestaña **Redes** en cada negocio y vista **Todas las redes**, con Bandeja, Contenido y Estadísticas. |
| 7 | Bandeja de mensajes | **Hecha · falta conectar** | Mensajes, comentarios y menciones de Instagram en una lista, con respuestas, etiquetas y avisos. Falta dar permisos en Meta (bloque H). TikTok no deja leer mensajes: botón **Abrir mensajes en TikTok**. |
| 8 | Actualización automática | **Hecha** | Cada hora sola, al abrir si tiene más de 15 min, botón **Actualizar todo** y tirar hacia abajo. |
| 9 | Esta guía | **Hecha** | También en PDF: **docs/QUE-TENGO-QUE-HACER.pdf**. |

**«Falta conectar»** significa: **el código está terminado y probado**, pero necesita que tú crees una cuenta de desarrollador o des un permiso. Mientras, la app lo dice en pantalla y todo lo demás funciona igual.

**Importante:** nada de esto está todavía en tu app de verdad. Está en un **pull request** (una propuesta de cambios que revisas antes de aceptarla). No he tocado tu app ni tus datos. El primer paso (bloque A) es aceptarlo.

---

## 2. Bloques ordenados de más importante a menos

| Bloque | Qué | Obligatorio | Tiempo | Coste |
|---|---|---|---|---|
| A | Ver la vista previa y fusionar el pull request | **OBLIGATORIO** | 10 min | Gratis |
| B | Revisar los pedidos «Sin revisar» | **OBLIGATORIO** (si no lo hiciste ya) | 5 min | Gratis |
| C | Poner el stock inicial y los mínimos | Recomendado | 15–30 min | Gratis |
| D | Conectar Outlook (Microsoft) | Opcional | 20 min | Gratis |
| E | Conectar Instagram (Meta) | Opcional | 30 min | Gratis |
| F | Conectar TikTok | Opcional | 30 min | Gratis |
| G | Guardar un vídeo de TikTok para el análisis completo | Opcional | 2 min | Gratis (gasta un poco de IA) |
| H | Activar los mensajes de Instagram (Bandeja) | Opcional | 20 min (+ días si pides acceso avanzado) | Gratis |
| I | Elegir tus ajustes de Redes y mensajes | Recomendado | 2 min | Gratis |
| J | Correo de contacto en la política de privacidad | Opcional | 3 min | Gratis |

---

### Bloque A · Ver la vista previa y fusionar el pull request · OBLIGATORIO · 10 min · gratis

Fusionar (en inglés *merge*) = aceptar los cambios para que pasen a tu app de verdad.

**Antes de empezar:** la **vista previa** (una copia de prueba que hace Vercel para cada pull request) usa tu base de datos real **sin** las tablas nuevas. Por eso, en la vista previa, la **Bandeja** de Redes sale vacía y no hay contador de mensajes. Es normal: al fusionar, las tablas se crean solas.

1. Abre el enlace del pull request que te he dejado en el chat (empieza por **https://github.com/pertx1/biburu/pull/**).
2. Baja hasta el comentario de **vercel**.
3. Pulsa **Visit Preview** (o **Preview**).
4. Entra con tu cuenta como siempre.
5. Mira por encima: en **Negocios → (un negocio)** hay una pestaña **Redes**, y en **Redes** arriba pone **Todas las redes** con **Bandeja**, **Contenido** y **Estadísticas**.
6. Vuelve a la página del pull request en GitHub.
7. Baja hasta el final y pulsa el botón verde **Merge pull request**.
8. Pulsa **Confirm merge**.
9. Espera unos 3 minutos.
10. Entra en **https://vercel.com** → proyecto **bi-buru** → **Deployments**.

**Sabrás que ha salido bien cuando…** el despliegue de arriba ponga **Ready** en verde y, en **https://bi-buru.vercel.app/redes**, veas la pestaña **Bandeja** (aunque esté vacía).

**Si te sale este error, haz esto…**

- **«This branch has conflicts»**: no pulses nada más y escríbeme «el pull request tiene conflictos».
- El despliegue pone **Error** o **Failed**: pulsa en él, copia las últimas líneas del registro y pégamelas en el chat.
- En la app sale **«falta aplicar la actualización de la base de datos»**: espera 5 minutos y recarga. Si sigue, dímelo.

---

### Bloque B · Revisar los pedidos «Sin revisar» · OBLIGATORIO · 5 min · gratis

Si ya lo hiciste la otra vez, sáltalo. Tus pedidos antiguos no tenían cobros apuntados; para no inventarme deudas, están como **Sin revisar** (no cuentan como deuda).

1. Abre la app y entra en **Negocios**.
2. Pulsa tu negocio (por ejemplo **Akerra**).
3. Pulsa la pestaña **Pedidos**.
4. Si ves el aviso **X pedidos sin revisar**, pulsa **Revisar**.
5. Elige una opción:
   - Si casi todos ya te los pagaron: **Todos están cobrados**.
   - Si casi ninguno te lo han pagado: **Todos están sin cobrar**.
   - Si es mitad y mitad: **Ver cuáles son** y revísalos uno a uno.
6. Confirma con **Aceptar**.

**Sabrás que ha salido bien cuando…** el aviso desaparezca y el cuadro **Me deben** muestre lo que de verdad te deben.

**Si te sale este error, haz esto…** «No se pudieron registrar todos los cobros»: pulsa otra vez el mismo botón. No se duplica nada.

---

### Bloque C · Poner el stock inicial y los mínimos · Recomendado · 15–30 min · gratis

Así la app sabe qué te falta y crea las tareas **Pedir …** solas.

**Si tu negocio usa Producción (camisetas y DTF):**

1. Entra en **Negocios → Akerra → Stock**.
2. Pulsa una fila, por ejemplo **Camiseta negra M**.
3. Escribe cuántas tienes en **Unidades** y pulsa **Fijar**.
4. En **Stock mínimo** escribe cuántas quieres tener siempre (por ejemplo **3**) y pulsa **Guardar mínimo**.
5. Repite con cada talla y color.

**Para todo lo demás (bolsas, etiquetas, productos…):**

1. En **Stock**, pulsa **Añadir artículo**.
2. Escribe el **Nombre** igual que en los pedidos (por ejemplo **Sudadera gris**).
3. Si quieres, pon **Variante**, **Tienes ahora** y **Mínimo**.
4. Pulsa **Guardar**.

**Sabrás que ha salido bien cuando…** arriba ponga **No falta nada** o, si falta algo, en **Tareas → Hoy** aparezca **Pedir …**.

**Si te sale este error, haz esto…** «Ya existe un artículo con ese nombre y variante»: búscalo en la lista y edítalo.

---

### Bloque D · Conectar Outlook · OPCIONAL · 20 min · gratis

Para ver tus correos en **Correo**. BiBuru **solo lee**: no puede enviar ni borrar.

**D1. Registrar la app en Microsoft**

1. Entra en **https://entra.microsoft.com** con tu cuenta de Microsoft (la de Outlook/Hotmail sirve).
2. En el menú de la izquierda pulsa **Aplicaciones** (o **Applications**) y luego **Registros de aplicaciones** (**App registrations**).
3. Pulsa **Nuevo registro** (**New registration**).
4. En **Nombre** escribe **BiBuru**.
5. En **Tipos de cuenta compatibles** elige **Cuentas en cualquier directorio organizativo y cuentas personales de Microsoft** (*Accounts in any organizational directory and personal Microsoft accounts*).
6. En **URI de redirección** elige **Web** y pega: **https://bi-buru.vercel.app/api/outlook/callback**
7. Pulsa **Registrar** (**Register**).
8. En la página que se abre, copia el **Id. de aplicación (cliente)** (*Application (client) ID*) y guárdalo en una nota.
9. En el menú de la izquierda pulsa **Certificados y secretos** (**Certificates & secrets**).
10. Pulsa **Nuevo secreto de cliente** (**New client secret**), escribe **BiBuru**, elige **24 meses** y pulsa **Agregar** (**Add**).
11. Copia lo que pone en la columna **Valor** (**Value**). **Solo se ve una vez.**
12. En el menú de la izquierda pulsa **Permisos de API** (**API permissions**) → **Agregar un permiso** → **Microsoft Graph** → **Permisos delegados**.
13. Marca **Mail.Read**, **User.Read** y **offline_access** y pulsa **Agregar permisos**.

**D2. Pegar las llaves en Vercel**

1. Entra en **https://vercel.com** → tu proyecto **bi-buru** → **Settings** → **Environment Variables**.
2. Pulsa **Add New**. En **Key** escribe exactamente **MICROSOFT_CLIENT_ID** y en **Value** pega el Id. del paso D1.8. Marca **Production** y pulsa **Save**.
3. Pulsa **Add New**. En **Key** escribe **MICROSOFT_CLIENT_SECRET** y en **Value** pega el valor del paso D1.11. Marca **Production** y pulsa **Save**.
4. Comprueba que existe **TOKEN_ENCRYPTION_KEY** (la pusiste con YouTube). Si no está, créala: en tu ordenador abre una terminal y ejecuta `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`, copia lo que salga y guárdalo como **TOKEN_ENCRYPTION_KEY**. No la cambies nunca después.
5. Ve a **Deployments**, pulsa los tres puntos **⋯** del primero y **Redeploy** → **Redeploy**.

**D3. Conectar tu cuenta**

1. En la app, entra en **Ajustes** y baja a **Correo de Outlook**.
2. Pulsa **Conectar Outlook**.
3. Elige tu cuenta y pulsa **Aceptar** (**Accept**).
4. Si tienes más cuentas (por ejemplo la de empresa), pulsa **Conectar otra cuenta**.
5. En cada cuenta, elige su **Negocio**.

**Sabrás que ha salido bien cuando…** veas **Cuenta conectada ✔** y, a los pocos minutos, tus correos en **Correo**.

**Si te sale este error, haz esto…**

- **«Falta conectar»**: falta alguna variable o no has hecho **Redeploy**. Repite D2.
- Microsoft dice **AADSTS50011** (la dirección de vuelta no coincide): revisa que en D1.6 pegaste exactamente **https://bi-buru.vercel.app/api/outlook/callback**.
- En una cuenta de empresa pone **Se necesita la aprobación del administrador**: pide a quien lleva la informática de la empresa que apruebe la app **BiBuru**, o usa solo tu cuenta personal.
- En 24 meses el secreto caduca: crea otro (D1.10) y cambia **MICROSOFT_CLIENT_SECRET**.

---

### Bloque E · Conectar Instagram · OPCIONAL · 30 min · gratis

Necesitas que tu Instagram sea **profesional** (empresa o creador). Funciona en **modo desarrollo**: no hace falta que Meta revise nada, porque es para tus propias cuentas.

**E1. Pasar tu Instagram a cuenta profesional (si no lo es ya)**

1. Abre la app de Instagram y ve a tu perfil.
2. Pulsa **☰** (arriba a la derecha) → **Configuración y actividad**.
3. Pulsa **Tipo de cuenta y herramientas** → **Cambiar a cuenta profesional**.
4. Elige **Empresa** (o **Creador**) y sigue los pasos.

**E2. Crear la app en Meta**

1. Entra en **https://developers.facebook.com** e inicia sesión con tu Facebook.
2. Si te lo pide, pulsa **Empezar** para registrarte como desarrollador (gratis).
3. Pulsa **Mis apps** → **Crear app**.
4. Escribe el nombre **BiBuru** y tu correo. Pulsa **Siguiente**.
5. En **Casos de uso**, elige **Administrar mensajes y contenido en Instagram** (o el que diga **Instagram API**). Pulsa **Siguiente** y luego **Crear app**.
6. Dentro de la app, ve a **Instagram** → **Configuración de la API con inicio de sesión de Instagram** (*API setup with Instagram login*).
7. Copia el **Identificador de la app de Instagram** (*Instagram app ID*) y el **Clave secreta de la app de Instagram** (*Instagram app secret*, pulsa **Mostrar**). **Ojo:** no son los de Facebook; son los que dicen **Instagram**.
8. En **Configurar el inicio de sesión empresarial de Instagram** pulsa **Configurar** (**Set up**).
9. En **URI de redireccionamiento de OAuth** pega **https://bi-buru.vercel.app/api/instagram/callback** y pulsa **Guardar**.
10. Si te pide **URL de devolución de llamada para desautorizar** y **URL de solicitud de eliminación de datos**, pega en las dos **https://bi-buru.vercel.app/privacidad**.
11. Ve a **Roles de la app** → **Roles** → **Añadir personas** → **Evaluador de Instagram** (*Instagram Tester*) y escribe tu usuario de Instagram. Pulsa **Añadir**.
12. Abre Instagram (en la web: **https://www.instagram.com/accounts/manage_access/**), pestaña **Invitaciones de evaluador** y pulsa **Aceptar**.

**E2-bis. Si Meta solo te deja «inicio de sesión con Facebook»** (la página dice «Configuración de la API con inicio de sesión con Facebook»)

BiBuru también funciona así. Cambia esto:

1. **Vincula tu Instagram a una página de Facebook**: en Facebook, entra en tu página → **Configuración** → **Cuentas vinculadas** → **Instagram** → **Conectar cuenta**. Si no tienes página, crea una (gratis).
2. En la app de Meta, en **Configuración de la API con el inicio de sesión con Facebook**, pulsa **Go to permissions and features** y **Añade** estos permisos: **instagram_basic**, **instagram_content_publish**, **instagram_manage_insights**, **pages_show_list**, **pages_read_engagement** y **business_management**.
3. Dentro de **Configura el inicio de sesión con Facebook para empresas** → **Configuración**, en **URI de redireccionamiento de OAuth válidos** pega **https://bi-buru.vercel.app/api/instagram/callback** y guarda.
4. Si ahí te pide crear una **Configuración** (*Configurations*), créala con los mismos permisos y copia su **ID de configuración**.
5. Las llaves son las de la app de Facebook: **Configuración de la app → Básica** → **Identificador de la app** y **Clave secreta de la app** (**Mostrar**).
6. En Vercel (E3), además de **INSTAGRAM_APP_ID** e **INSTAGRAM_APP_SECRET** con esas llaves, añade **INSTAGRAM_LOGIN** con el valor **facebook**. Si tienes ID de configuración del paso 4, añade también **INSTAGRAM_FB_CONFIG_ID** con ese número.
7. Al conectar en BiBuru se abre **Facebook**: marca tu **página** y tu **Instagram** y pulsa **Guardar** / **Continuar**.

**E3. Pegar las llaves en Vercel**

1. En **Vercel → bi-buru → Settings → Environment Variables**, añade **INSTAGRAM_APP_ID** con el identificador de E2.7 (marca **Production**, **Save**).
2. Añade **INSTAGRAM_APP_SECRET** con la clave de E2.7 (marca **Production**, **Save**).
3. Comprueba que existe **TOKEN_ENCRYPTION_KEY** (mira D2.4).
4. **Deployments** → **⋯** → **Redeploy**.

**E4. Conectar**

1. En la app, entra en **Redes** (está en **Más** si no lo tienes en la barra).
2. Pulsa **+ Conectar Instagram**, entra con tu Instagram y pulsa **Permitir**.
3. En la tarjeta de la cuenta, elige el **Negocio**.

**Para ver y responder mensajes y comentarios** sigue después con el **bloque H**.

**Sabrás que ha salido bien cuando…** veas tu **@usuario** en Redes y, al día siguiente, números en **Estadísticas**. (Instagram solo da seguidores diarios a cuentas con 100 seguidores o más.)

**Si te sale este error, haz esto…**

- **«Tu Instagram profesional no está vinculado a una página de Facebook»** (variante Facebook): haz E2-bis.1 y, al conectar, marca la página y el Instagram.
- **«Insufficient developer role»** o **«Invalid platform app»**: tu Instagram no aceptó la invitación de evaluador (E2.11–E2.12) o copiaste el ID de Facebook en vez del de Instagram.
- **«Invalid redirect_uri»**: revisa E2.9 letra a letra.
- **«La conexión caduca en N días»**: no hagas nada; se renueva sola. Si llega a **caducada**, pulsa **Reconectar**.

---

### Bloque F · Conectar TikTok · OPCIONAL · 30 min · gratis

Sin la **auditoría** (una revisión que hace TikTok a la app), todo lo que una app publica en TikTok **queda privado**. Por eso BiBuru, por ahora, **envía el vídeo a tu TikTok como borrador** (tú lo terminas y lo publicas, y sale público) o **te avisa a la hora** con el vídeo y el texto listos.

**F1. Crear la app en TikTok**

1. Entra en **https://developers.tiktok.com** y pulsa **Log in** con tu TikTok.
2. Pulsa tu foto → **Manage apps** → **Connect an app** (o **Create app**).
3. Rellena: nombre **BiBuru**, un icono (puedes usar el del cerebro), categoría **Business**, descripción corta.
4. En **Terms of Service URL** pega **https://bi-buru.vercel.app/terminos**.
5. En **Privacy Policy URL** pega **https://bi-buru.vercel.app/privacidad**.
6. En **Platforms** marca **Web** y pon **https://bi-buru.vercel.app**.
7. Pulsa **Add products** y añade **Login Kit** y **Content Posting API**.
8. En **Login Kit** → **Redirect URI**, pega **https://bi-buru.vercel.app/api/tiktok/callback**.
9. En **Scopes** marca **user.info.basic**, **user.info.profile**, **user.info.stats**, **video.list** y **video.upload**.
10. Arriba cambia a **Sandbox** y pulsa **Create Sandbox**. (El *sandbox* es un modo de prueba que funciona sin revisión para hasta 10 cuentas.)
11. En **Target users** pulsa **Add account** y añade tu TikTok.
12. Copia el **Client key** y el **Client secret** **del Sandbox**.

**F2. Pegar las llaves en Vercel**

1. Añade **TIKTOK_CLIENT_KEY** con el Client key (marca **Production**, **Save**).
2. Añade **TIKTOK_CLIENT_SECRET** con el Client secret (marca **Production**, **Save**).
3. Comprueba **TOKEN_ENCRYPTION_KEY** (mira D2.4).
4. **Deployments** → **⋯** → **Redeploy**.

**F3. Conectar**

1. En la app, entra en **Redes** y pulsa **+ Conectar TikTok**.
   (Los **mensajes y comentarios de TikTok** no se pueden leer desde una app propia: TikTok no lo permite. En la Bandeja verás **Abrir mensajes en TikTok**.)
2. Entra con tu TikTok y pulsa **Autorizar**.
3. Elige el **Negocio** de la cuenta.

**F4. (Más adelante, opcional) Pedir la auditoría para publicar directamente en público**

1. En **developers.tiktok.com**, en tu app, pulsa **Submit for review** con todo lo anterior y, en **Content Posting API**, activa **Direct Post** y pide la auditoría.
2. Cuando TikTok te diga que está aprobada (puede tardar días o semanas), en Vercel añade **TIKTOK_DIRECT_POST_AUDITED** con valor **1** y haz **Redeploy**.
3. En **Redes**, pulsa **Reconectar** en tu cuenta de TikTok (para dar el permiso nuevo).

**Sabrás que ha salido bien cuando…** tu **@usuario** de TikTok salga en Redes con el texto **App sin auditar…** y, al programar un vídeo, a su hora te llegue a TikTok como **borrador** (en la app: **Bandeja de entrada** → notificación del borrador).

**Si te sale este error, haz esto…**

- **«client_key»** o **«redirect_uri»** no válidos: comprueba que copiaste las llaves **del Sandbox** y la dirección de F1.8.
- **«Falta conectar»**: falta una variable o el **Redeploy**.
- No llega el borrador: en **Redes → Contenido**, abre la publicación; si pone **Error**, pulsa **Reintentar**. Si TikTok no deja subir en tu cuenta, la app pasará a **avisarte** (publicación asistida).

---

### Bloque G · Guardar un vídeo de TikTok para el análisis completo · OPCIONAL · 2 min

El análisis normal usa la descripción, los hashtags, el autor y la portada. Si quieres que la IA vea y escuche el vídeo:

1. En TikTok, abre el vídeo y pulsa la flecha **Compartir**.
2. Pulsa **Guardar vídeo**. (Si no aparece, el creador no lo permite: entonces no se puede.)
3. En BiBuru, entra en **Favoritos** y abre ese vídeo.
4. Pulsa **Subir el vídeo** y elige el vídeo de tu galería.
5. Mira el **Coste estimado** y pulsa **Subir y analizar**.

**Sabrás que ha salido bien cuando…** al rato la ficha diga **Análisis basado en: vídeo completo**.

**Si te sale este error, haz esto…** **«pasa de 50 MB»**: recórtalo o guárdalo con menos calidad. **«No queda presupuesto»**: sube el límite en **Ajustes → Inteligencia artificial** o espera al mes siguiente.

---

### Bloque H · Activar los mensajes de Instagram (Bandeja) · OPCIONAL · 20 min · gratis

Primero haz el **bloque E** (Instagram conectado). Esto añade dos permisos y el «timbre» (webhook) para que los mensajes lleguen solos.

**H1. Añadir los permisos de mensajes en la app de Meta**

1. Entra en **https://developers.facebook.com** → **Mis apps** → **BiBuru**.
2. Ve a **Casos de uso** → **Personalizar** el de Instagram (o **Permisos y funciones**).
3. Pulsa **Añadir** en estos dos permisos:
   - Si tu app es la de **inicio de sesión de Instagram** (la normal): **instagram_business_manage_messages** y **instagram_business_manage_comments**.
   - Si tu app es la de **inicio de sesión con Facebook** (pusiste **INSTAGRAM_LOGIN=facebook**): **instagram_manage_messages**, **instagram_manage_comments** y **pages_manage_metadata**. Si creaste una **Configuración** (E2-bis.4), añádelos también ahí.

**H2. Inventar el código del timbre y guardarlo en Vercel**

1. Inventa un código de **al menos 16 letras y números**, sin espacios (por ejemplo, junta dos palabras y unos números: **NaranjaTijera83Bici51**). No uses ese ejemplo: inventa el tuyo.
2. En **Vercel → bi-buru → Settings → Environment Variables** pulsa **Add New**.
3. En **Key** escribe exactamente **META_WEBHOOK_VERIFY_TOKEN** y en **Value** pega tu código. Marca **Production** y pulsa **Save**.
4. **Deployments** → **⋯** del primero → **Redeploy** → **Redeploy**. Espera a que ponga **Ready**.

**H3. Poner el timbre en Meta**

1. En tu app de Meta:
   - App normal: **Instagram** → **Configuración de la API con inicio de sesión de Instagram** → apartado **Configurar webhooks**.
   - App de Facebook: menú **Webhooks** → en el desplegable elige **Instagram**.
2. En **URL de devolución de llamada** (*Callback URL*) pega exactamente: **https://bi-buru.vercel.app/api/webhooks/meta**
3. En **Token de verificación** (*Verify token*) pega el **mismo código** de H2.1.
4. Pulsa **Verificar y guardar** (*Verify and save*).
5. En la lista de campos, pulsa **Suscribirse** (*Subscribe*) en **messages** y **comments** (y **mentions** si aparece).
6. En **Generar tokens de acceso**, si junto a tu cuenta hay un interruptor **Suscripción a webhooks**, actívalo. (BiBuru también lo intenta solo al conectar.)

**H4. Dar los permisos nuevos a BiBuru**

1. En la app, entra en **Redes** → pestaña **Bandeja**.
2. Verás el aviso **Activar mensajes**. Pulsa ese botón.
3. Entra con tu Instagram y pulsa **Permitir** en los permisos nuevos.

**H5. Que Meta mande los avisos al momento (modo «Activo»)**

Meta **solo toca el timbre** si la app está en modo **Activo** (*Live*), y los **comentarios** necesitan además **acceso avanzado**. **Mientras tanto, BiBuru lee los mensajes solo cada hora** (y al abrir Redes o pulsar **Actualizar todo**), así que la Bandeja funciona igual, solo que no al segundo.

1. En la app de Meta, arriba, cambia **Modo de la app** de **Desarrollo** a **Activo** (o pulsa **Publicar**). Te pedirá icono, categoría y la política de privacidad: **https://bi-buru.vercel.app/privacidad**.
2. Para el **acceso avanzado**: **Revisión de la app** → **Permisos y funciones** → junto a cada permiso de H1 pulsa **Solicitar acceso avanzado**. Meta puede pedir **verificar tu empresa** y un **vídeo** enseñando cómo se usa.
3. Texto para pegar en la solicitud (uno por permiso, cambia lo que haga falta):

> BiBuru es un panel privado que uso solo yo para gestionar mi propio negocio. Conecto mi cuenta profesional de Instagram para ver en una bandeja los mensajes directos y comentarios que recibo y responderlos a mano. Ningún mensaje se envía automáticamente: siempre lo escribo y pulso «Enviar». Los mensajes solo se guardan en mi base de datos privada, nadie más tiene acceso y se borran si la persona los borra. Uso: (1) leer conversaciones y comentarios de mis publicaciones, (2) responder dentro de la ventana de 24 horas, (3) ocultar comentarios ofensivos y responder en privado a un comentario.

4. Para el **vídeo**: graba la pantalla del móvil: abres **Redes → Bandeja**, entras en un mensaje, escribes una respuesta, pulsas **Enviar** y se ve en Instagram. Después ocultas un comentario.

**Sabrás que ha salido bien cuando…** en **Redes → Bandeja** desaparezca el aviso **Activar mensajes** y, después de escribirte tú mismo desde otra cuenta, el mensaje aparezca (al momento si la app está **Activa**, o en menos de una hora / al pulsar **Actualizar todo** si no).

**Si te sale este error, haz esto…**

- Meta dice **«No se pudo validar la URL de devolución de llamada o el token de verificación»**: el código de H3.3 no es igual al de Vercel, o no hiciste **Redeploy** después de H2. Revisa letra a letra (mayúsculas incluidas).
- Al pulsar **Activar mensajes** sale **«Invalid Scopes»**: falta H1 (los permisos no están añadidos en la app de Meta).
- Al responder sale **«Pasaron 24 h: responde desde Instagram»**: Instagram solo deja responder por API 24 h después del último mensaje de la persona. Pulsa **Abrir en Instagram**.
- Una respuesta queda en **Error**: pulsa **Reintentar**. Si sigue, copia el texto del error y pégamelo.
- No llegan comentarios pero sí mensajes: falta el **acceso avanzado** de comentarios (H5.2). Mientras, se leen cada hora.

---

### Bloque I · Elegir tus ajustes de Redes y mensajes · Recomendado · 2 min · gratis

1. En la app entra en **Ajustes** y baja a **Redes y mensajes**.
2. **Avisarme de mensajes nuevos**: viene **encendido**. Déjalo así si quieres un aviso cuando alguien te escriba.
3. **Alertas de redes**: viene **apagado**. Enciéndelo si quieres saber cuándo llegas a una cifra redonda de seguidores, cuándo una publicación va muy bien o si pierdes muchos seguidores de golpe.
4. **«Sugerir respuesta» con IA**: viene **apagado**. Si lo enciendes, al pulsar el botón en un mensaje, ese texto se envía a Google para proponerte una respuesta (gasta un poco de tu presupuesto de IA). Nunca se envía nada solo.

**Sabrás que ha salido bien cuando…** al recargar Ajustes las casillas sigan como las dejaste.

**Si te sale este error, haz esto…** «No se pudo guardar»: recarga la página y vuelve a probar. Si sigue, dímelo.

---

### Bloque J · Correo de contacto en la política de privacidad · OPCIONAL · 3 min · gratis

1. En **Vercel → Settings → Environment Variables** añade **PRIVACY_CONTACT_EMAIL** con el correo donde quieras recibir dudas de privacidad.
2. **Redeploy**.

**Sabrás que ha salido bien cuando…** en **https://bi-buru.vercel.app/privacidad** salga tu correo al final.

**Si te sale este error, haz esto…** si no sale, comprueba que marcaste **Production** y que hiciste **Redeploy**.

---

## 3. Todas las variables de Vercel (nombre exacto)

| Variable | Para qué | ¿Obligatoria? |
|---|---|---|
| **MICROSOFT_CLIENT_ID** | Outlook | Solo si usas Correo |
| **MICROSOFT_CLIENT_SECRET** | Outlook | Solo si usas Correo |
| **INSTAGRAM_APP_ID** | Instagram | Solo si usas Instagram |
| **INSTAGRAM_APP_SECRET** | Instagram (y comprobar que los avisos de Meta son de verdad) | Solo si usas Instagram |
| **INSTAGRAM_LOGIN** | Instagram | Solo si tu app de Meta es la de «inicio de sesión con Facebook»: valor **facebook** |
| **INSTAGRAM_FB_CONFIG_ID** | Instagram | Solo con **INSTAGRAM_LOGIN=facebook** y si Meta te pidió una «Configuración» |
| **META_WEBHOOK_VERIFY_TOKEN** | **Nueva.** El código del timbre de mensajes (bloque H) | Solo si usas la Bandeja |
| **TIKTOK_CLIENT_KEY** | TikTok | Solo si usas TikTok |
| **TIKTOK_CLIENT_SECRET** | TikTok | Solo si usas TikTok |
| **TIKTOK_DIRECT_POST_AUDITED** | Poner **1** cuando TikTok apruebe la auditoría | No |
| **PRIVACY_CONTACT_EMAIL** | Correo en la política de privacidad | No |
| **TOKEN_ENCRYPTION_KEY** | Cifrar las llaves de las cuentas (ya existía) | Sí, si conectas algo |
| **SUPABASE_SERVICE_ROLE_KEY** | Avisos, cron y «Actualizar todo» (ya existía) | Sí |

No pegues nunca estas llaves en el chat. Solo en Vercel.

---

## 4. Decisiones que necesito de ti

Cada una tiene opciones, lo que te recomiendo y qué pasa si no haces nada.

1. **¿Pido el acceso avanzado de Meta?** (bloque H5)
   - Opciones: Sí (mensajes y comentarios al instante) / No (se leen cada hora).
   - Recomiendo: **primero pasa la app a Activo** y prueba unos días. Pide el acceso avanzado solo si te importa ver los comentarios al segundo.
   - Si no haces nada: la Bandeja se actualiza cada hora, al abrir Redes y con **Actualizar todo**.
2. **¿Pido la auditoría de TikTok?** (bloque F4)
   - Recomiendo: **No por ahora**. El borrador ya te deja publicar en público con un toque. La auditoría **no** da mensajes ni comentarios.
   - Texto si un día la pides: «BiBuru es una herramienta interna que uso solo yo para programar los vídeos de mi propio negocio. Subo el vídeo, elijo la hora y la app lo publica con Content Posting API en mi cuenta. Solo publica contenido mío, con mi autorización expresa en cada publicación, mostrando el nombre de la cuenta, la privacidad elegida y la vista previa antes de enviar.»
   - Si no haces nada: se sigue usando borrador o aviso.
3. **¿IA para sugerir respuestas?** (bloque I)
   - Recomiendo: **No**, salvo que recibas muchos mensajes parecidos. Usa mejor las **respuestas guardadas** (gratis y sin enviar nada a Google).
   - Si no haces nada: queda apagada.
4. **¿Alertas de redes?** (bloque I)
   - Recomiendo: **Sí** si quieres celebrar hitos; son pocas y respetan tus horas de silencio.
   - Si no haces nada: apagadas.
5. **¿Dejo que la IA lea tus correos?** (Ajustes → Correo)
   - Recomiendo: **No**, salvo que te ahorre mucho tiempo.
   - Si no haces nada: queda apagado.
6. **Pedidos «Sin revisar»** (bloque B): recomiendo **Todos están cobrados** si son antiguos y luego marcar a mano los pocos que te deban.

---

## 5. Lo que no he podido hacer y por qué

- **Mensajes y comentarios de TikTok.** TikTok no ofrece API para leerlos ni responderlos desde una app propia. **Alternativa:** en la Bandeja, **Abrir mensajes en TikTok**.
- **Probar con Meta, TikTok y Microsoft de verdad.** No tengo tus cuentas. Todo está probado con datos de ejemplo y pruebas automáticas (incluida la firma de los avisos de Meta). **Alternativa:** si al conectar algo falla, la app lo dice en pantalla; cópiame el mensaje.
- **Avisos de Meta al instante sin modo Activo.** Lo decide Meta (bloque H5). **Alternativa:** lectura cada hora, al abrir y con **Actualizar todo**.
- **Responder pasadas 24 h.** Instagram no lo permite por API. **Alternativa:** botón **Abrir en Instagram**.
- **Probar con Safari de verdad.** Lo he probado con Chrome haciéndose pasar por un iPhone. **Alternativa:** sección 6.
- **Alcance diario en TikTok.** TikTok no lo da. Muestro seguidores, visualizaciones e interacciones.
- **Marcar correos como leídos.** Con permiso de solo lectura no se puede.

---

## 6. Cómo probar en el iPhone

Abre BiBuru desde el icono de tu pantalla de inicio.

**Redes por negocio**

1. **Negocios → Akerra → Redes**: ves solo las cuentas de ese negocio, con seguidores, **+N hoy**, **+N esta semana**, **N sin responder** y **Actualizado hace X min**.
2. Menú **Redes**: arriba, **Todas las redes** y un botón por negocio para filtrar.
3. Pestaña **Estadísticas**: **Todas · suma** suma todas las cuentas; pulsa una cuenta para ver solo la suya.
4. Pulsa **Actualizar todo**: sale **Actualizado: …**. También puedes **tirar hacia abajo**.

**Bandeja** (después del bloque H)

1. Desde otra cuenta de Instagram, escríbete un mensaje y comenta una publicación tuya.
2. En **Redes → Bandeja** aparecen los dos con el icono de Instagram, la persona, el texto y la hora. En la barra de abajo sale un **punto** en **Redes** (o en **Más**).
3. Entra en el mensaje: arriba pone cuánto queda de las **24 h**. Escribe y pulsa **Enviar**: pasa de **Enviando** a **Enviado**.
4. Entra en el comentario: arriba ves la publicación. Prueba **Pública** / **Privada** y **Ocultar**.
5. Prueba **Crear pedido** (se abre con el cliente puesto), **Crear tarea**, **Guardar nota**, **Etiquetas** y **Archivar**.
6. Guarda una **respuesta guardada** y úsala en otro mensaje.
7. En **Inicio → Editar**, añade el widget **Mensajes sin responder**.

**Lo de antes** (Pedidos, Stock, Tareas, Favoritos, Correo) se prueba igual que en la guía anterior: **Nuevo pedido**, **Añadir cobro**, **Stock → Añadir artículo con 0**, deslizar tareas y **Favoritos → Pegar**.

---

## 7. Decisiones que tomé por mi cuenta

Están todas, con su porqué, en **docs/DECISIONES.md**. Las más importantes:

- Los puntos 1–5 ya estaban hechos: los he comprobado y no los he rehecho.
- Una sola pantalla de Redes para **Todas las redes** y para cada negocio.
- Los permisos de mensajes se piden **aparte** (botón **Activar mensajes**) para no romper la conexión de Instagram que ya tienes.
- Además de los avisos de Meta, la Bandeja se lee **cada hora**: así funciona aunque la app de Meta siga en desarrollo.
- **Nada se envía solo**: ni respuestas guardadas ni la IA.
- La primera lectura de la Bandeja **no te avisa** (si no, al conectar te llegarían decenas de avisos de mensajes viejos).
- Si una red dice «demasiadas peticiones», esa cuenta descansa una hora y lo verás en su tarjeta.
- Si Meta avisa de que alguien borró un mensaje, también se borra en BiBuru.
- Las alertas de redes y la IA de respuestas vienen **apagadas**; los avisos de mensajes nuevos, **encendidos**.

Si quieres cambiar cualquiera, dímelo y lo cambio.
