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
