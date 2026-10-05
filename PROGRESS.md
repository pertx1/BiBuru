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
