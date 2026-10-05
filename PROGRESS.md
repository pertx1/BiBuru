# Progreso

| Fase | Estado |
|---|---|
| 1 · Base (repo, Supabase, Vercel, login, navegación, PWA) | **Hecha en código, pendiente de tu verificación** |
| 2 · Negocios, pedidos, gastos, estadísticas, importación PROFITY | **Hecha en código, pendiente de tu verificación** |
| 2B · Módulo de producción (stock, DTF, bolsa imprenta, facturas, Antola) | **Hecha en código, pendiente de tu verificación** |
| 3 · Tareas, calendario, objetivos | **Hecha en código, pendiente de tu verificación** |
| 4 · Captura, bandeja, notas, carpetas, búsqueda | Pendiente |
| 5 · Notificaciones push y tareas programadas | Pendiente |
| 6 · IA (clasificación, chat, voz, control de gasto) | Pendiente |
| 7 · Favoritos (vídeos) | Pendiente |
| 8 · Pulido | Pendiente |

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
