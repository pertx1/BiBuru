# Progreso

| Fase | Estado |
|---|---|
| 1 · Base (repo, Supabase, Vercel, login, navegación, PWA) | **Hecha en código, pendiente de tu verificación** |
| 2 · Negocios, pedidos, gastos, estadísticas, importación PROFITY | Pendiente |
| 3 · Tareas, calendario, objetivos | Pendiente |
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

## Pendiente de ti (Fase 1)
Seguir `docs/Fase-1-Guia.pdf`: crear Supabase, aplicar migración, crear tu usuario,
subir a Vercel, probar en ordenador e iPhone.

## Notas para la Fase 2
- El esquema real de PROFITY (Postgres + Prisma, **no SQLite**) es más rico que el del
  encargo: `Expense`, `Income`, `Order` (una línea por pedido: modelo, color, talla,
  precio), `VintedItem`, `TshirtStock`, `DtfStock`, `Invoice`, `ShirtDtfRule`,
  `DesignDtfRule`, `PrintBagCheck`. Hay que decidir cómo se conserva todo.
- `npm audit` marca 5 avisos en la cadena de `eslint-config-next` (solo herramientas de
  desarrollo, no llegan a producción).
