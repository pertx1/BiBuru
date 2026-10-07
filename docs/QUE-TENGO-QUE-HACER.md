# Qué tengo que hacer yo (guía de la noche)

Hola. Esta noche he trabajado en BiBuru mientras dormías. Aquí tienes **todo lo que tienes que hacer tú**, paso a paso y con palabras sencillas.

**Cómo leer esta guía:**

- Ve **en orden**. Lo primero es lo más importante.
- Cada bloque dice si es **OBLIGATORIO** u **OPCIONAL**, cuánto tarda y si cuesta dinero.
- Cada paso es **un solo gesto**. Haz uno, mira que ha salido bien y pasa al siguiente.
- Las palabras en **negrita** son los botones o textos exactos que verás en la pantalla.
- Tu app está en **https://bi-buru.vercel.app**. Si alguna vez pone otra dirección, usa la tuya.

> Una palabra que verás mucho: **variable** (un nombre y un valor secreto que se guardan en Vercel para que la app funcione; por ejemplo, la «llave» para hablar con Microsoft).

---

## 1. Resumen de la noche

| Función | Estado | En una frase |
|---|---|---|
| 1. Pedidos: cobros, «Me deben», filtros y botón «Nuevo pedido» | **Hecha** | Cada pedido tiene estado de pago, puedes apuntar cobros, ver quién te debe y filtrar como quieras. |
| 2. Stock que falta, en Tareas | **Hecha** | Si algo se queda a 0 (o falta para tus pedidos), aparece sola una tarea «Pedir …» para hoy, como en BATU. |
| 3. Que la app vaya mejor en el móvil | **Hecha** | Botones más grandes, sin zoom al escribir, deslizar tareas y tirar hacia abajo para actualizar. |
| 4. Favoritos de TikTok pegando el enlace | **Hecha** | Pegas uno o varios enlaces y se analizan solos con la descripción y la portada; puedes subir el vídeo para un análisis completo. |
| 5. Correo de Outlook | **Hecha a medias** | Todo está construido, pero **falta conectar**: tienes que registrar la app en Microsoft (bloque D). |
| 6. Instagram de negocio | **Hecha a medias** | Estadísticas, ranking y programación hechas; **falta conectar** la app de Meta (bloque E). |
| 7. TikTok de negocio | **Hecha a medias** | Estadísticas y programación (borrador o aviso) hechas; **falta conectar** la app de TikTok (bloque F). |
| Tareas como en Antola | **Hecha** | Filtros (Hoy, 7 días, Bandeja…), «+» con formulario completo, repetir, avisos por tarea y pantalla de detalle. La base de datos se actualiza sola al publicar. |
| Extra: Política de privacidad | **Hecha** | Ya existen **https://bi-buru.vercel.app/privacidad** y **/terminos** (Meta y TikTok los piden). |
| Extra: avisos encima de las hojas | **Hecha** | Los mensajes («Guardado ✔», errores…) ya no quedan escondidos detrás de las ventanas abiertas. |

«Hecha a medias» significa: **el código está terminado y probado**, pero necesita que tú crees una cuenta de desarrollador y pegues unas llaves. Sin eso, la app muestra **«Falta conectar»** y todo lo demás funciona igual.

**Importante:** nada de esto está todavía en tu app de verdad. Está en un **pull request** (una propuesta de cambios que puedes revisar antes de aceptarla). No he tocado tu app ni tus datos reales. El primer paso (bloque A) es aceptarlo.

---

## 2. Bloques ordenados de más importante a menos

| Bloque | Qué | Obligatorio | Tiempo | Coste |
|---|---|---|---|---|
| A | Revisar y fusionar el pull request | **OBLIGATORIO** | 10 min | Gratis |
| B | Revisar los pedidos «Sin revisar» | **OBLIGATORIO** | 5 min | Gratis |
| C | Poner el stock inicial y los mínimos | Recomendado | 15–30 min | Gratis |
| D | Conectar Outlook (Microsoft) | Opcional | 20 min | Gratis |
| E | Conectar Instagram (Meta) | Opcional | 30 min | Gratis |
| F | Conectar TikTok | Opcional | 30 min (+ días de espera si pides auditoría) | Gratis |
| G | Guardar un vídeo de TikTok para el análisis completo | Opcional | 2 min | Gratis (gasta un poco de tu presupuesto de IA) |
| H | Correo de contacto de la política de privacidad | Opcional | 3 min | Gratis |

---

### Bloque A · Revisar y fusionar el pull request · OBLIGATORIO · 10 min · gratis

Fusionar (en inglés *merge*) = aceptar los cambios para que pasen a tu app de verdad.

**Antes de empezar:** la **vista previa** (una copia de prueba de la app que hace Vercel para cada pull request) usa tu base de datos real, pero **sin** las tablas nuevas. Por eso, en la vista previa, Pedidos, Stock, Correo y Redes pueden salir vacíos o con algún aviso. Es normal. Al fusionar, las tablas nuevas se crean solas.

1. Abre el enlace del pull request que te he dejado en el chat (empieza por **https://github.com/pertx1/biburu/pull/**).
2. Baja hasta el cuadro donde **vercel** ha dejado un comentario.
3. Pulsa **Visit Preview** (o **Preview**) para ver la vista previa.
4. Entra con tu cuenta como siempre.
5. Mira por encima: el menú tiene **Correo** y **Redes**, y en un negocio hay una pestaña **Stock**. Con eso basta.
6. Vuelve a la página del pull request en GitHub.
7. Baja hasta el final y pulsa el botón verde **Merge pull request**.
8. Pulsa **Confirm merge**.
9. Espera unos 3 minutos.
10. Entra en **https://vercel.com**, abre tu proyecto **bi-buru** y pulsa **Deployments**.

**Sabrás que ha salido bien cuando…** el despliegue de arriba ponga **Ready** en verde y, al abrir **https://bi-buru.vercel.app**, en **Negocios → (un negocio) → Pedidos** veas el cuadro **Me deben**.

**Si te sale este error, haz esto…**

- **«This branch has conflicts»** (hay cambios que chocan): no pulses nada más y escríbeme «el pull request tiene conflictos».
- El despliegue pone **Error** o **Failed**: pulsa en él, copia las últimas líneas del registro y pégamelas en el chat.
- En la app sale **«falta aplicar la actualización de la base de datos»**: espera 5 minutos y recarga. Si sigue, dímelo.

---

### Bloque B · Revisar los pedidos «Sin revisar» · OBLIGATORIO · 5 min · gratis

Tus pedidos de antes no tenían cobros apuntados. Para no inventarme deudas, los he dejado como **Sin revisar** (no cuentan como deuda).

1. Abre la app y entra en **Negocios**.
2. Pulsa tu negocio (por ejemplo **Akerra**).
3. Pulsa la pestaña **Pedidos**.
4. Verás un aviso amarillo: **X pedidos sin revisar**. Pulsa **Revisar**.
5. Elige una opción:
   - Si casi todos ya te los pagaron: pulsa **Todos están cobrados**. Se apunta un cobro con la fecha de cada pedido.
   - Si casi ninguno te lo han pagado: pulsa **Todos están sin cobrar**. Pasan a contar como deuda.
   - Si es mitad y mitad: pulsa **Ver cuáles son** y revísalos uno a uno con **Marcar como pagado** o **Añadir cobro**.
6. Confirma con **Aceptar**.

**Sabrás que ha salido bien cuando…** el aviso amarillo desaparezca y el cuadro **Me deben** muestre lo que de verdad te deben.

**Si te sale este error, haz esto…** «No se pudieron registrar todos los cobros»: pulsa otra vez el mismo botón. No se duplica nada.

---

### Bloque C · Poner el stock inicial y los mínimos · Recomendado · 15–30 min · gratis

Así la app sabe qué te falta y crea las tareas **Reponer** solas.

**Si tu negocio usa Producción (camisetas y DTF):**

1. Entra en **Negocios → Akerra → Stock**.
2. Pulsa una fila, por ejemplo **Camiseta negra M**.
3. Escribe cuántas tienes en **Unidades** y pulsa **Fijar**.
4. En **Stock mínimo** escribe cuántas quieres tener siempre (por ejemplo **3**) y pulsa **Guardar mínimo**.
5. Repite con cada talla y color. (Si una prenda no está, créala en **Catálogo en Producción**.)

**Para todo lo demás (bolsas, etiquetas, productos terminados…):**

1. En la misma pantalla **Stock**, pulsa **Añadir artículo**.
2. Escribe el **Nombre** igual que lo escribes en los pedidos (por ejemplo **Sudadera gris**).
3. Si quieres, pon **Variante** (por ejemplo **M**), **Tienes ahora** y **Mínimo**.
4. Pulsa **Guardar**.

**Sabrás que ha salido bien cuando…** arriba ponga **No falta nada** o, si falta algo, en **Tareas → Hoy** aparezca **Pedir …** con la etiqueta **Stock**.

**Si te sale este error, haz esto…** «Ya existe un artículo con ese nombre y variante»: búscalo en la lista y edítalo en vez de crear otro.

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
- No llega el borrador: en **Redes → Publicaciones**, abre la publicación; si pone **Error**, pulsa **Reintentar**. Si TikTok no deja subir en tu cuenta, la app pasará a **avisarte** (publicación asistida).

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

### Bloque H · Correo de contacto en la política de privacidad · OPCIONAL · 3 min

1. En **Vercel → Settings → Environment Variables** añade **PRIVACY_CONTACT_EMAIL** con el correo donde quieras recibir dudas de privacidad.
2. **Redeploy**.

**Sabrás que ha salido bien cuando…** en **https://bi-buru.vercel.app/privacidad** salga tu correo al final.

---

## 3. Todas las variables nuevas de Vercel (nombre exacto)

| Variable | Para qué | ¿Obligatoria? |
|---|---|---|
| **MICROSOFT_CLIENT_ID** | Outlook | Solo si usas Correo |
| **MICROSOFT_CLIENT_SECRET** | Outlook | Solo si usas Correo |
| **INSTAGRAM_APP_ID** | Instagram | Solo si usas Instagram |
| **INSTAGRAM_APP_SECRET** | Instagram | Solo si usas Instagram |
| **INSTAGRAM_LOGIN** | Instagram | Solo si tu app de Meta es la de «inicio de sesión con Facebook»: valor **facebook** |
| **INSTAGRAM_FB_CONFIG_ID** | Instagram | Solo con **INSTAGRAM_LOGIN=facebook** y si Meta te pidió crear una «Configuración» |
| **TIKTOK_CLIENT_KEY** | TikTok | Solo si usas TikTok |
| **TIKTOK_CLIENT_SECRET** | TikTok | Solo si usas TikTok |
| **TIKTOK_DIRECT_POST_AUDITED** | Poner **1** cuando TikTok apruebe la auditoría | No |
| **PRIVACY_CONTACT_EMAIL** | Correo en la política de privacidad | No |
| **TOKEN_ENCRYPTION_KEY** | Cifrar las llaves de las cuentas (ya existía) | Sí, si conectas algo |

No pegues nunca estas llaves en el chat. Solo en Vercel.

---

## 4. Decisiones que necesito de ti

Cada una tiene opciones, lo que te recomiendo y qué pasa si no haces nada.

1. **¿Dejo que la IA lea tus correos?** (Ajustes → Correo → **Usar la IA con mis correos**)
   - Opciones: Sí (aparece **Resumir con IA** en cada correo) / No.
   - Recomiendo: **No**, salvo que te ahorre mucho tiempo. Al usarlo, el texto de ese correo va a Google.
   - Si no haces nada: queda apagado y ningún correo sale de Microsoft y BiBuru.
2. **¿Avisos de correo nuevo?** (Ajustes → Correo → **Avisarme de correo nuevo**, por cuenta)
   - Recomiendo: activarlo solo en la cuenta del negocio.
   - Si no haces nada: no hay avisos de correo.
3. **Pedidos «Sin revisar»** (bloque B): ¿cobrados o sin cobrar?
   - Recomiendo: **Todos están cobrados** si son antiguos y luego marcar a mano los pocos que te deban.
   - Si no haces nada: no cuentan como deuda y «Me deben» sale más bajo de lo real.
4. **¿Pido la auditoría de TikTok?** (bloque F4)
   - Recomiendo: **No por ahora**. El borrador ya te deja publicar en público con un toque.
   - Si no haces nada: se sigue usando borrador o aviso.
5. **Tareas de Stock**: salen para hoy cuando algo está a 0 o falta (como en BATU).
   - Si prefieres que solo salgan al bajar de un mínimo, ponle mínimo a cada artículo o dímelo y lo cambio.
6. **Espacio para archivos de Redes**: límite de **500 MB** y borrado **3 días** después de publicar.
   - Si no haces nada: así se queda (cabe en el plan gratuito de Supabase).

---

## 5. Lo que no he podido hacer y por qué

- **Probar con Microsoft, Meta y TikTok de verdad.** No tengo tus cuentas ni acceso a internet desde donde trabajo. Lo he probado con datos de ejemplo y pruebas automáticas. **Alternativa:** cuando conectes cada cuenta (bloques D–F), si algo falla, la app lo dice en pantalla; cópiame el mensaje.
- **Probar con Safari (WebKit) de verdad.** No se podía instalar aquí. He probado con Chrome haciéndose pasar por un iPhone. **Alternativa:** sección 6 (pruebas en tu iPhone).
- **Replicar los filtros del PROFITY antiguo.** En el repositorio solo está la importación de datos, no sus pantallas. He hecho los filtros que pediste.
- **Publicar en TikTok en público directamente.** TikTok no lo permite sin auditoría. **Alternativa:** borrador o aviso (ya hecho).
- **Alcance diario en TikTok.** TikTok no lo da. Muestro seguidores, visualizaciones e interacciones (calculadas cada día).
- **Marcar correos como leídos.** Con permiso de solo lectura no se puede. «Leído» se cambia en Outlook.
- **Arrastrar publicaciones en la vista Mes del móvil.** En el móvil la vista Mes solo muestra puntos. **Alternativa:** usa la vista **Semana** o **Agenda** y mantén pulsada el asa **⋮⋮**.
- **Subir el vídeo completo, de punta a punta.** El almacenamiento de archivos no se puede simular aquí; está probado por partes. Pruébalo con el bloque G.

---

## 6. Cómo probar cada cosa nueva en el iPhone

Abre BiBuru desde el icono de tu pantalla de inicio.

**Pedidos**

1. **Negocios → Akerra → Pedidos**.
2. Pulsa el botón morado **Nuevo pedido** (abajo a la derecha).
3. Escribe un cliente, cierra con la **X** y vuelve a pulsar **Nuevo pedido**: debe poner **Borrador recuperado**.
4. Añade un producto y precio y pulsa **Guardar pedido**: el pedido sale destacado en la lista.
5. Pulsa **Añadir cobro**, pon la mitad y guarda: sale **Pago parcial**.
6. Pulsa **Marcar como pagado**: sale **Pagado**.
7. En el selector de pago elige **Pendiente**: vuelve a no pagado (con **Deshacer**).
8. Pulsa **Filtros**, elige **Este mes** y **Aplicar**: salen las etiquetas y los totales.
9. Pulsa el cuadro **Me deben** → **Quién me debe**: ves la lista y los gráficos.

**Stock**

1. **Negocios → Akerra → Stock** → **Añadir artículo** con **Tienes ahora 0**.
2. En **Tareas → Hoy** aparece **Pedir …** (en la nota: «Se ha quedado a 0»).
3. Táchala: se completa como cualquier tarea y no vuelve a salir mientras siga a 0. Si quieres, pulsa **Apuntar unidades** en el aviso.

**Tareas (como Antola)**

1. Pulsa el **+** redondo de **Tareas**, escribe algo, elige **Hoy**, una hora y **Recordatorio → Antes → 15 min antes**. Pulsa **Crear tarea**: sale **Tarea creada**.
2. Toca el **círculo** de la tarea: sale **¡Hecho! ✓** con **Deshacer** durante 5 segundos.
3. Crea otra con **Repetir → Días concretos** (por ejemplo, **L** y **X**). Al completarla aparece la siguiente.
4. Cuando llegue el aviso, tócalo: se abre la tarea con **Hecho**, **Mañana**, **Posponer 15 min** y **Posponer 1 h**.
5. Lo que crees con **+** sin fecha ni proyecto aparece en el chip **Bandeja** (con su número).
6. **Ajustes → Qué avisos quieres → Avisos de tareas** los apaga todos de golpe.

**Móvil**

1. En **Tareas**, desliza una tarea a la **derecha**: se completa. A la **izquierda**: pasa a mañana.
2. En cualquier pantalla, arriba del todo, **tira hacia abajo**: se actualiza.
3. Toca un campo de texto: la pantalla **no** debe hacer zoom.

**Favoritos de TikTok**

1. En TikTok, **Compartir → Copiar enlace**.
2. En **Favoritos**, pulsa **Pegar** (acepta el permiso del portapapeles).
3. Al rato la tarjeta dice **Listo · texto y portada**.

**Correo** (después del bloque D): **Correo** → toca un correo → prueba **Crear tarea**, **Guardar como nota** y **Responder en Outlook**.

**Redes** (después de E o F): **Redes → Publicaciones → Nueva publicación** → añade una foto o vídeo, marca la cuenta, pon fecha y hora y pulsa **Programar**. Mira el día en **Calendario**.

---

## 7. Decisiones que tomé por mi cuenta

Están todas, con su porqué, en **docs/DECISIONES.md**. Las más importantes:

- Los pedidos antiguos quedan **Sin revisar** (no cuentan como deuda) hasta que los revises.
- **Marcar como pagado** apunta un cobro por lo que falte, con fecha de hoy y método **Otro**.
- Colores: **cobrado en azul** y **pendiente en rojo** (el verde/ámbar no se distingue bien con daltonismo).
- El stock de Producción ya existía: lo he reutilizado y le he añadido **mínimo**; para lo demás hay **Materiales y productos**.
- Las tareas de Stock funcionan como en BATU: «Pedir …», para hoy, prioridad alta, no se repiten si las tachas y se completan solas cuando hay stock.
- El correo guarda solo remitente, asunto, fecha y un extracto; el cuerpo se pide al abrirlo. Las imágenes van bloqueadas hasta que pulses **Mostrar imágenes**.
- Las cuentas de Instagram y TikTok son del espacio (las ve quien lo comparta contigo); las llaves no las puede leer nadie desde la app.
- Sin auditoría de TikTok uso **borrador** o **aviso**, nunca algo que quedaría privado sin decírtelo.
- Los avisos de la app ahora salen **encima** de las hojas abiertas.
- He creado **/privacidad** y **/terminos** porque Meta y TikTok los piden.

Si quieres cambiar cualquiera, dímelo y lo cambio.
