# Móvil: qué se ha revisado y arreglado

Revisión de las 28 pantallas principales a **375, 390 y 430 px** de ancho con `scripts/e2e/mobile-audit.mjs`
(capturas a 390 px: `antes/` y `despues/`). Se ejecuta con `npm run test:mobile` (con la app local levantada):
**falla si alguna pantalla tiene desplazamiento horizontal** y además lista zonas táctiles < 44 px y campos con letra < 16 px.

> WebKit (Safari) no se puede instalar en el entorno donde trabajé (sin descargas). La revisión emula un iPhone con
> Chromium: agente de usuario de iPhone, pantalla táctil y densidad 2×. Conviene repasar en el iPhone real (guía, punto 6).

## Resultado
| | Antes | Después |
|---|---|---|
| Pantallas con scroll horizontal | 0 | 0 |
| Zonas táctiles < 44 px (por pantalla, a 390 px) | 1–12 en 25 de 28 | 0 |
| Campos con letra < 16 px (zoom al enfocar en iOS) | 5 pantallas | 0 (*) |

(*) Queda el selector de archivo de «Importar PROFITY», que está oculto (se usa su botón): falso positivo.

## Arreglado
- **Zonas táctiles**: pastillas de periodo, vistas de Tareas/Calendario/Objetivos/Notas/Favoritos/Noticias, sugerencias del chat,
  tema claro/oscuro, botones de Producción, enlaces «← Negocios», «← Notas», «Ver todos», «Ver archivados», botones de subir/bajar
  y comprobar/quitar en Ajustes de Noticias, «Añadir tarea», flecha de los widgets… Todos a 44 px en móvil (en escritorio igual que antes).
- **Letra de 16 px** en móvil en: fechas del selector de periodo (Negocios, Estadísticas), estado del pedido en la lista.
- **Campos tapados por el teclado**: en todas las hojas (formularios), el campo que se enfoca se centra en pantalla.
- **Formularios largos**: el pedido se abre a pantalla completa con la barra «Guardar» fija; los filtros de Gastos se pliegan
  tras «Buscar y filtrar» (los de Pedidos van en una hoja «Filtros»).
- **Navegación instantánea dentro de un negocio**: esqueleto de carga propio (las pestañas no desaparecen al cambiar).
- **Gestos**: en Tareas, deslizar a la derecha = hecha; a la izquierda = mañana (con «Deshacer»). **Tirar hacia abajo** para actualizar
  en cualquier pantalla (la app instalada del iPhone no lo trae).
- Botón «Nuevo pedido» flotante, siempre a mano encima de la barra inferior.

## Ya estaba bien (comprobado)
- Áreas seguras del iPhone (`pt-safe`, barra inferior con `safe-area-inset-bottom`).
- Gráficos de Inicio y Estadísticas cargados en diferido; miniaturas con `loading="lazy"`.
- Listas largas paginadas («Ver más pedidos», «Ver más gastos»).

## Pendiente / ideas
- Probar en Safari real (WebKit) del iPhone: gestos, teclado y notificaciones.
- La tabla de prendas de Producción se queda como tabla (son 5 tallas, cabe a 375 px y es más clara que tarjetas).
- Virtualizar listas solo si alguna pasa de ~500 elementos visibles (hoy se pagina de 100 en 100).
- Imágenes de noticias y vídeos son de sitios externos: no se pueden optimizar con `next/image` sin abrir dominios; se dejan con carga diferida.
