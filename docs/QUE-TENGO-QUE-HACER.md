# Qué tengo que hacer yo

Hola. He hecho de una vez los cambios en **Negocios, stock, revisiones y tareas sin fecha**. Aquí tienes qué ha cambiado, dónde está ahora cada cosa y **lo que te toca a ti**, paso a paso, como si te lo explicara a un niño de 10 años.

**Cómo leer esta guía:**

- Ve **en orden**. Lo primero es lo más importante.
- Cada bloque dice si es **OBLIGATORIO** u **OPCIONAL**, cuánto tarda y si cuesta dinero (todo es **gratis**).
- Cada paso es **un solo gesto**. Haz uno, mira que ha salido bien y pasa al siguiente.
- Las palabras en **negrita** son los botones o textos exactos que verás en la pantalla.
- Cada bloque termina con **«Sabrás que ha salido bien cuando…»** y **«Si te sale este error, haz esto…»**.
- Tu app está en **https://bi-buru.vercel.app**.

> Tres palabras que verás mucho:
> - **Stock**: lo que tienes guardado (camisetas, DTF, bolsas…).
> - **Vincular**: decirle a la app «esta línea del pedido es este artículo del stock», para que lo reste sola.
> - **Widget**: una tarjeta del Resumen o de Inicio (por ejemplo «Pedidos por estado»). Puedes ponerlas, quitarlas y moverlas.

---

## 1. Resumen: qué hay de nuevo

| # | Cambio | Estado | En una frase |
|---|---|---|---|
| 1 | Cada pedido resta del stock | **Hecho** | Al crear un pedido, sus líneas restan del stock; si lo editas, solo la diferencia; si lo cancelas o lo borras, vuelve. |
| 2 | Revisión diaria, semanal y mensual | **Hecho** | Una sección nueva, **Revisión**, que se prepara sola cada mañana, cada domingo por la tarde y cada día 1, te avisa y se guarda. |
| 3 | Tareas sin fecha en Inicio | **Hecho** | Un bloque fijo **Sin fecha** en Inicio, todos los días, hasta que las hagas. |
| 4 | Negocios reorganizados | **Hecho** | Pestañas nuevas, el **Resumen** con widgets que puedes cambiar y botones por estado en **Pedidos**. |
| 5 | Redes y Mensajes en cada negocio | **Hecho · falta asignar cuentas** | Pestaña **Mensajes** con el **correo** de ese negocio (los mensajes de Instagram y TikTok los quitamos a petición tuya). Tienes que decir qué cuenta es de qué negocio (bloque D). |
| 6 | Esta guía | **Hecha** | También en PDF: **docs/QUE-TENGO-QUE-HACER.pdf**. |

**Importante:** nada de esto está todavía en tu app de verdad. Está en un **pull request** (una propuesta de cambios que revisas antes de aceptarla). No he tocado tu app ni tus datos. **Los pedidos que ya tienes no restan nada del stock** hasta que tú lo decidas (bloque C).

---

## 2. Qué ha cambiado de sitio

Nada se ha borrado: solo ha cambiado de sitio. Si entras por una dirección antigua, la app te lleva sola a la nueva.

| Antes estaba en… | Ahora está en… |
|---|---|
| Negocio → **Producción** → Stock | Negocio → **Stock** (la misma tabla de Producción, ahora la única) |
| Negocio → **Producción** → Bolsa imprenta | Negocio → **Bolsa imprenta** |
| Negocio → **Producción** → Facturas | Negocio → **Facturas** |
| Negocio → **Producción** → Reglas y Antola | Negocio → **Reglas Antola** |
| Negocio → **Ingresos** | Negocio → **Estadísticas**, al final, en **Ingresos sueltos** (y siguen sumando en el Resumen) |
| Negocio → **Tareas** | Menú **Tareas**, con el chip del negocio marcado |
| Negocio → **Objetivos** | Menú **Objetivos**, con el botón del negocio marcado |

**Orden de las pestañas de cada negocio:** Resumen, Pedidos, Gastos, Stock, Bolsa imprenta, Facturas, Reglas Antola, Redes, Mensajes, Estadísticas y Productos. En el móvil, desliza la fila de pestañas con el dedo hacia la izquierda para ver las del final. Bolsa imprenta, Facturas y Reglas Antola solo salen si el negocio tiene el **Módulo de producción**.

---

## 3. Bloques ordenados de más importante a menos

| Bloque | Qué | Obligatorio | Tiempo | Coste |
|---|---|---|---|---|
| A | Ver la vista previa y fusionar el pull request | **OBLIGATORIO** | 10 min | Gratis |
| B | Vincular los artículos del stock (para que los pedidos resten) | **OBLIGATORIO** si usas stock | 10–20 min | Gratis |
| C | Decidir si los pedidos antiguos restan del stock | Recomendado | 5 min | Gratis |
| D | Asignar cada cuenta de correo y de redes a su negocio | Recomendado | 3 min | Gratis |
| E | Elegir la hora de las revisiones | Recomendado | 2 min | Gratis |
| F | Ordenar el Resumen de cada negocio a tu gusto | Opcional | 5 min | Gratis |

---

### Bloque A · Ver la vista previa y fusionar el pull request · OBLIGATORIO · 10 min · gratis

Fusionar (en inglés *merge*) = aceptar los cambios para que pasen a tu app de verdad.

**Antes de empezar:**
- Este pull request **ya lleva dentro** el anterior (el **#6**, de Redes y Bandeja). Si fusionas este, entra todo. Si ya fusionaste el #6, no pasa nada.
- La **vista previa** usa tu base de datos real **sin** las tablas nuevas. Por eso, ahí, la Revisión, el Resumen con widgets y los Mensajes pueden salir con avisos o vacíos. Es normal: al fusionar, las tablas se crean solas.

1. Abre el enlace del pull request que te he dejado en el chat.
2. Baja hasta el comentario de **vercel** y pulsa **Visit Preview**.
3. Entra con tu cuenta y mira por encima: el menú tiene **Revisión** y en un negocio las pestañas tienen el orden nuevo.
4. Vuelve al pull request en GitHub.
5. Baja hasta el final y pulsa el botón verde **Merge pull request**.
6. Pulsa **Confirm merge**.
7. Espera unos 3 minutos y entra en **https://vercel.com** → **bi-buru** → **Deployments**.

**Sabrás que ha salido bien cuando…** el despliegue de arriba ponga **Ready** en verde y en **https://bi-buru.vercel.app/revision** veas la revisión de hoy.

**Si te sale este error, haz esto…**
- **«This branch has conflicts»**: no pulses nada más y escríbeme «el pull request tiene conflictos».
- El despliegue pone **Error**: pulsa en él, copia las últimas líneas y pégamelas en el chat.
- Sale **«falta aplicar la actualización de la base de datos»**: espera 5 minutos y recarga.

---

### Bloque B · Vincular los artículos del stock · OBLIGATORIO si usas stock · 10–20 min · gratis

Para que un pedido reste del stock, la app tiene que saber **qué artículo** es cada línea. Muchas veces lo adivina sola; esto es para que acierte siempre.

**Si tu negocio usa Producción (camisetas y DTF):** no tienes que hacer nada especial. Si en el pedido escribes el **diseño** (por ejemplo **Ola**), el **color** (**Negra**) y la **talla** (**M**), la app resta sola una camiseta negra M y un DTF del color que toca.

**Para el resto (sudaderas, bolsas, productos…):**

1. Entra en **Negocios → (tu negocio) → Stock**.
2. Si un artículo no está, pulsa **Añadir artículo**, escribe el **Nombre** igual que lo escribes en los pedidos y pulsa **Guardar**.
3. Si lo vendes como producto del catálogo, ábrelo, pulsa **Editar artículo** y en **Producto del catálogo** elige el producto. Pulsa **Guardar**.

**En cada pedido nuevo:**

1. Pulsa **Nuevo pedido**.
2. En cada línea, debajo de los precios, verás:
   - **Descuenta: 1 × Camiseta negra M…** → está vinculada.
   - **Sin vincular al stock** (en naranja) → no restará nada.
3. Si sale **Sin vincular**, elige el artículo en la lista de arriba de la línea (**Artículo del stock…**).
4. Pulsa **Guardar pedido**. Si algo se queda en negativo, sale el aviso **Falta stock…** y la tarea **Pedir …** aparece sola en Tareas.

**Sabrás que ha salido bien cuando…** al guardar un pedido, en **Stock** el número de ese artículo baje, y al tocarlo, en **Historial** salga el pedido con **Ver pedido**.

**Si te sale este error, haz esto…**
- La línea dice **Sin vincular** aunque el artículo existe: elige el artículo a mano en la lista de la línea.
- Has restado de más: edita el pedido (se ajusta solo la diferencia) o cancélalo (vuelve todo).

---

### Bloque C · ¿Los pedidos antiguos restan del stock? · Recomendado · 5 min · gratis

Los pedidos que ya tenías **no restan** (así no se descuadra el stock que ya contaste a mano). Si quieres que los pendientes sí resten:

1. Entra en **Negocios → (tu negocio) → Stock**.
2. Pulsa **Recalcular desde pedidos**.
3. Elige **Solo los pendientes («Sin hacer» y «Sin llegar»)** (lo recomendado) o **Todos los no cancelados desde una fecha**.
4. Pulsa **Ver vista previa**: verás cuánto bajaría cada artículo.
5. Si te cuadra, pulsa **Aplicar** y **Aceptar**.

**Sabrás que ha salido bien cuando…** salga **Hecho: N pedidos descontados** y en el **Historial** de cada artículo aparezcan esos pedidos.

**Si te sale este error, haz esto…** **«No se pudo terminar»**: pulsa **Aplicar** otra vez. Lo que ya se descontó no se descuenta dos veces.

---

### Bloque D · Asignar cada cuenta a su negocio · Recomendado · 3 min · gratis

La pestaña **Mensajes** de un negocio muestra el **correo** de las cuentas de Outlook de ese negocio. Las cuentas de Instagram y TikTok también se asignan aquí, para que sus estadísticas salgan en la pestaña **Redes** del negocio.

1. Entra en **Ajustes**.
2. Arriba verás **Cuentas sin negocio** (si no sale, es que todas están ya asignadas).
3. En cada cuenta, elige su negocio en **Elige negocio…**.

**Sabrás que ha salido bien cuando…** la cuenta desaparezca de la lista y, en **Negocios → (tu negocio) → Mensajes**, salgan sus correos y mensajes.

**Si te sale este error, haz esto…** si en **Mensajes** pone **Ninguna cuenta de correo asignada a este negocio**, conecta Outlook (Ajustes → Correo de Outlook) y vuelve a este bloque.

> **Cómo funciona Mensajes:** arriba eliges el **estado** (Sin responder, Respondido, Archivado o Todos) y puedes buscar. Pulsa **⋯** en un correo para **Responder en Outlook**, **Crear pedido**, **Crear tarea**, **Guardar como nota**, **Respondido** o **Archivar**. Un correo cuenta como **Sin responder** mientras no lo hayas leído ni marcado.

---

### Bloque E · Elegir la hora de las revisiones · Recomendado · 2 min · gratis

1. Entra en **Ajustes** y baja a **Revisiones (diaria, semanal y mensual)**.
2. **Diaria**: viene a las **08:30**. Cambia la hora si quieres.
3. **Semanal**: viene el **Domingo** a las **18:00**. Elige día y hora.
4. **Mensual**: el **día 1** a las **09:00**.
5. Pulsa **Guardar**.

> **Cómo funciona Revisión:** a esa hora se prepara sola con tus datos reales y te llega un aviso (si tienes los avisos activados y no es hora de silencio). En **Revisión** puedes completar o posponer tareas, marcar un pedido como **Cobrado** o abrir un correo sin salir. Arriba eliges **Todos juntos** o un negocio. Al final pulsa **Revisado**: si no la cierras, sigue en Inicio, en **Revisión de hoy**. En la semanal, escribe tus **3 prioridades** y pulsa **Crear como tareas**. El botón **Resumen con IA** es opcional y gasta un poco de tu presupuesto de IA.

**Sabrás que ha salido bien cuando…** a la hora elegida te llegue el aviso **Revisión diaria lista** y en **Revisión → Histórico** aparezca la de hoy.

**Si te sale este error, haz esto…** si no llega el aviso, mira **Ajustes → Avisos en este dispositivo** (tiene que estar activado) y que no sea hora de silencio. La revisión se prepara igual aunque no haya aviso.

---

### Bloque F · Ordenar el Resumen de cada negocio · Opcional · 5 min · gratis

1. Entra en **Negocios → (tu negocio) → Resumen**.
2. Pulsa **Editar resumen**.
3. Arrastra desde **⠿** para mover, pulsa el icono de tamaño para hacerla más grande, el de ajustes para cambiar opciones y la **X** para quitar.
4. **Añadir widget** abre la lista: Resumen financiero, Beneficio y margen, Ventas por mes, Gastos por categoría, Pedidos, Pedidos por estado, Pendiente de cobro, Más vendidos, Stock que falta, Resumen de stock, Bolsa imprenta, Últimas facturas, Reglas Antola, Seguidores, Mensajes sin responder, Tareas del negocio y Objetivos activos.
5. Pulsa **Listo**. Si quieres volver a la de antes, **Editar resumen → Restablecer**.

Estos widgets también están en **Inicio → Editar → Añadir widget**: en sus ajustes eliges el negocio.

**Sabrás que ha salido bien cuando…** al recargar, el Resumen siga como lo dejaste (cada negocio guarda el suyo).

**Si te sale este error, haz esto…** **«No se pudo guardar»**: recarga y repite.

---

## 4. Decisiones que necesito de ti

1. **¿Los pedidos antiguos restan?** (bloque C)
   - Recomiendo: **Solo los pendientes**, después de contar tu stock real.
   - Si no haces nada: no restan; siguen «reservando» stock como antes (salen en la columna **Reservado**).
2. **¿Quieres la pestaña Productos al final?** No la pediste, pero no la he quitado porque ahí está tu catálogo con precios. Si sobra, dímelo.
3. **¿Facturas para todos los negocios?** Ahora solo salen con el **Módulo de producción** (como antes). Si quieres Facturas en todos, dímelo.

---

## 5. Lo que no he podido hacer y por qué

- **Copiar los filtros de PROFITY tal cual.** No tengo acceso a cómo eran. He puesto una fila de botones por estado con su número, que se combinan con los demás filtros.
- **Mensajes y comentarios de Instagram y TikTok.** Los quitamos a petición tuya: BiBuru ya no los lee. Respóndelos desde las apps de Instagram y TikTok.
- **Marcar correos como respondidos en Outlook.** Con permiso de solo lectura no se puede: «Respondido» y «Archivado» se guardan solo en BiBuru.
- **Valor del stock de camisetas y DTF.** No tienen coste guardado; el widget **Resumen de stock** da el valor de los artículos vinculados a un producto con coste.
- **Probar con tus datos reales.** Lo he probado en un ordenador con datos de ejemplo (pedidos, stock, revisiones, Inicio y móvil) y con pruebas automáticas.

---

## 6. Cómo probar en el iPhone

1. **Pedido que resta:** Negocio → **Stock**, mira un número (por ejemplo **Camiseta negra M**). Crea un pedido con **Ola · Negra · M · 2**. Vuelve a **Stock**: ha bajado 2. Cancela el pedido: vuelve.
2. **Historial:** toca ese número en Stock: abajo, **Historial** con **Ver pedido**.
3. **Botones de estado:** en **Pedidos**, toca **Sin hacer**: solo salen esos. Tócalo otra vez para quitarlo.
4. **Resumen:** **Editar resumen**, quita un widget, **Listo** y recarga: sigue quitado.
5. **Sin fecha:** en Inicio, en **Sin fecha**, toca el calendario de una tarea y elige **Mañana**: desaparece del bloque.
6. **Revisión:** menú **Revisión** (o **Más → Revisión**): completa una tarea tocando el círculo y pulsa **Revisado**.
7. **Mensajes:** Negocio → **Mensajes**: toca **Respondido** en un correo y cambia entre **Sin responder** y **Respondido**.

---

## 7. Decisiones que tomé por mi cuenta

Están todas, con su porqué, en **docs/DECISIONES.md**. Las más importantes:

- **El stock que ves es «lo que tienes»**: los pedidos nuevos ya están restados. Los antiguos sin vincular siguen reservando como antes, para no contarlos dos veces.
- Si no hay stock suficiente, el pedido **se guarda igual**, avisa y crea la tarea **Pedir …** (la de siempre).
- Si editas un pedido antiguo, **sigue sin restar**, salvo las líneas en las que elijas un artículo a mano.
- La pestaña **Stock** usa la tabla de Producción y añade **Materiales y productos** debajo, para no perder nada.
- La **Revisión semanal** de viernes a domingo revisa esa semana; de lunes a jueves, la anterior. Sustituye al aviso antiguo de «Revisión semanal de objetivos» (que ya incluye).
- Las prioridades de la semana se crean como tareas de **prioridad alta** para el lunes siguiente (o para hoy, si ese lunes ya pasó).
- En Inicio, **Sin fecha** y **Revisión de hoy** se añaden **una sola vez**; si los quitas, no vuelven.
- La disposición del **Resumen** es tuya (por persona y negocio), igual que la de Inicio.

Si quieres cambiar cualquiera, dímelo y lo cambio.

---

## 8. Anexo: pasos de la guía anterior (si aún no los hiciste)

Estos son los pasos para conectar Outlook, Instagram y TikTok (para estadísticas y publicaciones). No han cambiado.

### Anexo D · Conectar Outlook · OPCIONAL · 20 min · gratis

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

### Anexo E · Conectar Instagram · OPCIONAL · 30 min · gratis

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
3. Comprueba que existe **TOKEN_ENCRYPTION_KEY** (mira Anexo D2.4).
4. **Deployments** → **⋯** → **Redeploy**.

**E4. Conectar**

1. En la app, entra en **Redes** (está en **Más** si no lo tienes en la barra).
2. Pulsa **+ Conectar Instagram**, entra con tu Instagram y pulsa **Permitir**.
3. En la tarjeta de la cuenta, elige el **Negocio**.

**Sabrás que ha salido bien cuando…** veas tu **@usuario** en Redes y, al día siguiente, números en **Estadísticas**. (Instagram solo da seguidores diarios a cuentas con 100 seguidores o más.)

**Si te sale este error, haz esto…**

- **«Tu Instagram profesional no está vinculado a una página de Facebook»** (variante Facebook): haz Anexo E2-bis.1 y, al conectar, marca la página y el Instagram.
- **«Insufficient developer role»** o **«Invalid platform app»**: tu Instagram no aceptó la invitación de evaluador (E2.11–E2.12) o copiaste el ID de Facebook en vez del de Instagram.
- **«Invalid redirect_uri»**: revisa E2.9 letra a letra.
- **«La conexión caduca en N días»**: no hagas nada; se renueva sola. Si llega a **caducada**, pulsa **Reconectar**.

---

### Anexo F · Conectar TikTok · OPCIONAL · 30 min · gratis

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
3. Comprueba **TOKEN_ENCRYPTION_KEY** (mira Anexo D2.4).
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
- No llega el borrador: en **Redes → Contenido**, abre la publicación; si pone **Error**, pulsa **Reintentar**. Si TikTok no deja subir en tu cuenta, la app pasará a **avisarte** (publicación asistida).

---

### Anexo G · Guardar un vídeo de TikTok para el análisis completo · OPCIONAL · 2 min

El análisis normal usa la descripción, los hashtags, el autor y la portada. Si quieres que la IA vea y escuche el vídeo:

1. En TikTok, abre el vídeo y pulsa la flecha **Compartir**.
2. Pulsa **Guardar vídeo**. (Si no aparece, el creador no lo permite: entonces no se puede.)
3. En BiBuru, entra en **Favoritos** y abre ese vídeo.
4. Pulsa **Subir el vídeo** y elige el vídeo de tu galería.
5. Mira el **Coste estimado** y pulsa **Subir y analizar**.

**Sabrás que ha salido bien cuando…** al rato la ficha diga **Análisis basado en: vídeo completo**.

**Si te sale este error, haz esto…** **«pasa de 50 MB»**: recórtalo o guárdalo con menos calidad. **«No queda presupuesto»**: sube el límite en **Ajustes → Inteligencia artificial** o espera al mes siguiente.

---

### Anexo H · Ajuste de Redes · Opcional · 1 min · gratis

1. En **Ajustes**, baja a **Redes**.
2. **Alertas de redes** viene **apagado**. Enciéndelo si quieres saber cuándo llegas a una cifra redonda de seguidores, cuándo una publicación va muy bien o si pierdes muchos seguidores de golpe.

**Sabrás que ha salido bien cuando…** al recargar Ajustes la casilla siga como la dejaste.

**Si te sale este error, haz esto…** «No se pudo guardar»: recarga y vuelve a probar.

---

### Anexo J · Correo de contacto en la política de privacidad · OPCIONAL · 3 min · gratis

1. En **Vercel → Settings → Environment Variables** añade **PRIVACY_CONTACT_EMAIL** con el correo donde quieras recibir dudas de privacidad.
2. **Redeploy**.

**Sabrás que ha salido bien cuando…** en **https://bi-buru.vercel.app/privacidad** salga tu correo al final.

**Si te sale este error, haz esto…** si no sale, comprueba que marcaste **Production** y que hiciste **Redeploy**.

---


## 9. Todas las variables de Vercel (nombre exacto)

| Variable | Para qué | ¿Obligatoria? |
|---|---|---|
| **MICROSOFT_CLIENT_ID** | Outlook | Solo si usas Correo |
| **MICROSOFT_CLIENT_SECRET** | Outlook | Solo si usas Correo |
| **INSTAGRAM_APP_ID** | Instagram | Solo si usas Instagram |
| **INSTAGRAM_APP_SECRET** | Instagram | Solo si usas Instagram |
| **INSTAGRAM_LOGIN** | Instagram | Solo si tu app de Meta es la de «inicio de sesión con Facebook»: valor **facebook** |
| **INSTAGRAM_FB_CONFIG_ID** | Instagram | Solo con **INSTAGRAM_LOGIN=facebook** y si Meta te pidió una «Configuración» |
| **TIKTOK_CLIENT_KEY** | TikTok | Solo si usas TikTok |
| **TIKTOK_CLIENT_SECRET** | TikTok | Solo si usas TikTok |
| **TIKTOK_DIRECT_POST_AUDITED** | Poner **1** cuando TikTok apruebe la auditoría | No |
| **PRIVACY_CONTACT_EMAIL** | Correo en la política de privacidad | No |
| **TOKEN_ENCRYPTION_KEY** | Cifrar las llaves de las cuentas (ya existía) | Sí, si conectas algo |
| **SUPABASE_SERVICE_ROLE_KEY** | Avisos, cron y «Actualizar todo» (ya existía) | Sí |

No pegues nunca estas llaves en el chat. Solo en Vercel.

---

