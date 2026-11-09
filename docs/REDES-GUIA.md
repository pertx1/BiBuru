# Redes sociales en BiBuru · guía paso a paso

Para programar Reels, fotos y carruseles en Instagram y vídeos en TikTok, separados por negocio. Todo es gratis:
APIs oficiales de Meta y TikTok, Supabase (plan gratis) y Vercel (plan Hobby).

Tu app está en **https://bi-buru.vercel.app**. Si usas otro dominio, cámbialo en todas las direcciones de esta guía.

---

## 1. Cómo funciona (en corto)

| Pieza | Qué hace |
|---|---|
| **Negocio → pestaña Redes** | Cuentas conectadas del negocio, publicaciones (con filtros por estado) y estadísticas. |
| **Redes** (menú) | Lo mismo para todos los negocios, con filtro por negocio. |
| **Calendario** | Las publicaciones salen con el color de su negocio; se pueden arrastrar a otro día. |
| **Programador** | Supabase **pg_cron + pg_net** llama cada 5 min a `/api/cron/social` (protegida con `CRON_SECRET`). |
| **Instagram** | Publicación automática completa: contenedor → espera a FINISHED → `media_publish`. |
| **TikTok** | Modo **borrador**: el vídeo llega a la bandeja de TikTok y tú lo publicas con un toque. |

**¿Por qué pg_cron y no otra cosa?**
- Va dentro de tu Supabase gratis, es puntual (cada 5 min) y ya está configurado: se programa solo al desplegar.
- El cron gratis de Vercel solo se ejecuta una vez al día.
- GitHub Actions se retrasa entre 10 y 60 min y se apaga solo si el repositorio pasa 60 días sin cambios.

**Seguridad**
- Los tokens se guardan **cifrados** (AES-256, clave `TOKEN_ENCRYPTION_KEY`).
- Nunca llegan al navegador; la app no puede ni leerlos.
- Todo va filtrado por espacio y negocio con RLS.

**Que nada salga dos veces.** Antes de cada paso, el destino se «reclama» en la base de datos con una sola orden. Si coinciden dos pasadas del programador, o «Publicar ahora» y el programador, solo una lo envía.

**Reintentos**
- Hasta 3, esperando 5, 15 y 45 minutos.
- Si sigue fallando, queda en **Error** con el motivo en español y un botón **Reintentar**.
- Lo que no tiene arreglo reintentando, como un formato no válido, va directo a Error.

**Límite diario de Instagram (50 en 24 h).** Antes de publicar se consulta `content_publishing_limit`. Si no queda cupo, espera 1 hora sin gastar intentos.

**Espacio**
- Los archivos van al almacenamiento de Supabase y se **borran en cuanto la publicación sale bien en todas las cuentas**.
- Arriba de la lista ves cuánto llevas usado y cuánto te queda; BiBuru se pone un tope de 500 MB del 1 GB del plan gratis.
- Cada archivo puede pesar como mucho **50 MB**, que es el límite del plan gratis de Supabase.

---

## 2. Instagram: crear la app en Meta for Developers (20–30 min)

Necesitas una cuenta de Instagram **profesional** (empresa o creador). Para cambiarla: Instagram → Configuración → Tipo de cuenta y herramientas → Cambiar a cuenta profesional.

1. Entra en **https://developers.facebook.com** con tu Facebook → **Mis apps** → **Crear app**.
2. Caso de uso: **«Administrar mensajes y contenido en Instagram»** (*Manage messaging & content on Instagram*) → Siguiente.
3. Ponle de nombre **BiBuru** y tu correo → **Crear app**.
4. En el menú de la app: **Casos de uso → Instagram → Personalizar → «Configuración de la API con inicio de sesión de Instagram»** (*API setup with Instagram login*).
5. En **«3. Configurar el inicio de sesión para empresas de Instagram»** pulsa **Configuración**:
   - **URL de redireccionamiento OAuth**: `https://bi-buru.vercel.app/api/instagram/callback` → **Guardar**.
6. En esa misma página copia el **«ID de la app de Instagram»** y la **«Clave secreta de la app de Instagram»**.
   - **Ojo:** son los de Instagram, no el ID de la app de Facebook que sale arriba del todo.
7. **Permisos.** En **Casos de uso → Instagram → Permisos** comprueba que están estos:
   - `instagram_business_basic`
   - `instagram_business_content_publish`
   - `instagram_business_manage_insights`
8. **Añadir tus cuentas como testers** (la app se queda en modo desarrollo y así no hace falta la revisión de Meta):
   1. **Roles de la app → Roles → Añadir personas → «Tester de Instagram»** → escribe tu @usuario.
   2. Acepta la invitación en **https://www.instagram.com/accounts/manage_access/** → pestaña **Invitaciones de tester**.
   3. Repite con cada cuenta de cada negocio.
9. En **Configuración de la app → Básica** pon:
   - Política de privacidad: `https://bi-buru.vercel.app/privacidad`
   - Condiciones: `https://bi-buru.vercel.app/terminos`
10. En **Vercel** (proyecto **bi-buru** → Settings → Environment Variables) añade:
    - `INSTAGRAM_APP_ID` = el ID de la app de Instagram del paso 6.
    - `INSTAGRAM_APP_SECRET` = la clave secreta del paso 6.
11. **Redespliega** (Deployments → ⋯ → Redeploy).
12. En BiBuru: **Negocios → tu negocio → Redes → Conectar Instagram** → entra con la cuenta → acepta los permisos.

**Sabrás que ha salido bien cuando** veas la tarjeta con tu @usuario y «Conexión activa».
- La conexión dura 60 días y BiBuru la renueva sola antes de que caduque.
- Si alguna vez pone **«Reconectar»**, pulsa **Conectar Instagram** otra vez.

**Si sale «Invalid redirect_uri»:** la dirección del paso 5 tiene que ser exactamente la de arriba, con `https` y sin barra al final.

---

## 3. TikTok: crear la app en TikTok for Developers (20–30 min)

1. Entra en **https://developers.tiktok.com** → **Manage apps** → **Connect an app**. Si te lo pide, crea una organización con tu nombre.
2. Rellena **App details**:
   - **Icon**: el logo de BiBuru, 1024×1024.
   - **App name**: BiBuru. **Category**: Business. **Description**: «Programar publicaciones de mis negocios».
   - **Terms of Service URL**: `https://bi-buru.vercel.app/terminos`
   - **Privacy Policy URL**: `https://bi-buru.vercel.app/privacidad`
   - **Platforms**: marca **Web** → **Website URL**: `https://bi-buru.vercel.app`
3. **Verificar el dominio.** Si TikTok te pide verificar la web en **URL properties**:
   1. Elige el método de archivo y descarga el `.txt` que te da.
   2. Mándamelo y lo pongo en la raíz de la web, o súbelo tú a la carpeta `public/`.
   3. Pulsa **Verify**.
   - La subida del vídeo es un **archivo directo** (`FILE_UPLOAD`), no un enlace, así que no hace falta verificar el dominio para subir vídeos.
4. **Add products**:
   - **Login Kit** → **Redirect URI** (Web): `https://bi-buru.vercel.app/api/tiktok/callback`.
   - **Content Posting API** → **deja apagado «Direct Post»** (sin la auditoría de TikTok, lo publicado directamente sale privado).
5. **Scopes**: `user.info.basic`, `user.info.profile`, `user.info.stats`, `video.list`, `video.upload`. **No** pidas `video.publish`.
6. Copia **Client key** y **Client secret** de la página de la app.
7. **Probar sin revisión (Sandbox).** Arriba, cambia a **Sandbox** → **Target users** → añade tus cuentas de TikTok.
   - Así funciona ya con tus cuentas.
   - Para cuentas de otras personas tendrías que pulsar **Submit for review** con la app en Production.
8. En **Vercel** añade `TIKTOK_CLIENT_KEY` y `TIKTOK_CLIENT_SECRET`. Si usas el Sandbox, pon los del Sandbox. Luego **redespliega**.
9. En BiBuru: **Negocios → tu negocio → Redes → Conectar TikTok** → entra y acepta.

**Cómo queda cada vídeo de TikTok**
1. A la hora programada, BiBuru lo sube como **borrador**.
2. Queda como **«Enviado a TikTok – pendiente de publicar en la app»** y te llega un aviso al móvil.
3. En la app de TikTok: **Bandeja de entrada → notificación de borrador** → edita si quieres → **Publicar**.
4. TikTok no deja mandar el texto con un borrador. En BiBuru tienes el botón **«Copiar texto para TikTok»** para pegarlo.

**El día que TikTok apruebe la auditoría de «Direct Post»**
1. Activa Direct Post y el scope `video.publish` en la app.
2. Pon `TIKTOK_DIRECT_POST_AUDITED=1` en Vercel.
3. Reconecta la cuenta. Desde entonces se publica directo y en público.

La conexión de TikTok caduca cada 24 h. BiBuru la renueva sola con el token de refresco, que dura 365 días.

---

## 4. Variables de entorno (Vercel → Settings → Environment Variables)

| Variable | Para qué | Dónde se saca |
|---|---|---|
| `INSTAGRAM_APP_ID` | Instagram | Meta → tu app → Instagram → API setup with Instagram login |
| `INSTAGRAM_APP_SECRET` | Instagram | El mismo sitio, «clave secreta de la app de Instagram» |
| `TIKTOK_CLIENT_KEY` | TikTok | developers.tiktok.com → tu app (o su Sandbox) |
| `TIKTOK_CLIENT_SECRET` | TikTok | El mismo sitio |
| `TOKEN_ENCRYPTION_KEY` | Cifrar los tokens (ya la tienes) | `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`: no la cambies nunca |
| `CRON_SECRET` | Proteger el programador (ya la tienes) | Cualquier texto aleatorio de 20+ caracteres |
| `SUPABASE_SERVICE_ROLE_KEY` | El programador publica sin sesión (ya la tienes) | Supabase → Project Settings → API Keys → secret |
| `TIKTOK_DIRECT_POST_AUDITED` | Opcional: `1` solo cuando TikTok audite la app | — |

Las llaves solo van en Vercel: nunca en el chat ni en el código. La plantilla completa está en `.env.example`.

---

## 5. Probar la primera publicación (5 min)

1. **Negocios → tu negocio → Redes → Nueva publicación**.
2. **Añadir** → elige un vídeo vertical corto de la galería (MP4/MOV, máx. 50 MB).
   - Antes de subirlo, BiBuru comprueba el formato, la duración (3 s a 15 min) y si es 9:16.
3. Tipo **Reel / vídeo**. Escribe el texto y los hashtags (máx. 2.200 caracteres y 30 hashtags).
   - Si quieres, marca **Texto distinto para Instagram y TikTok**.
4. Marca tu cuenta de Instagram (y la de TikTok si quieres).
5. Pulsa **Publicar ahora**.
6. Espera 1–5 min (Instagram procesa el vídeo) y recarga. Verás:
   - Instagram: **Publicada** y el enlace **Ver**.
   - TikTok: **Enviado a TikTok – pendiente de publicar en la app**.
7. Si sale **Error**, el motivo viene en español; corrige lo que diga y pulsa **Reintentar**.

**Para programar**, elige fecha y hora (hora de Madrid) y pulsa **Programar**. Sale en los 5 minutos siguientes a esa hora.

**Estadísticas**
- La pestaña **Estadísticas** guarda una foto diaria: seguidores, alcance, visualizaciones e interacciones.
- En cada publicación hecha con BiBuru ves visualizaciones, me gusta, comentarios, compartidos y guardados.
- Los datos se actualizan al día siguiente, porque las APIs gratis los dan con retraso.
