# BiBuru

Tu segundo cerebro: tareas, negocios, notas y objetivos en un solo panel (PWA).

## Puesta en marcha desde cero
La guía PDF detallada se entrega al terminar todas las fases. Resumen:

1. **Supabase** (gratis): crea un proyecto → copia *Project URL* y la clave *publishable*.
2. **Migraciones**: pega el contenido de cada archivo de `supabase/migrations` (en orden)
   en Supabase → SQL Editor → Run. (Alternativa con CLI: `npx supabase link` y `npx supabase db push`.)
3. **Auth**: desactiva "Allow new users to sign up", crea tu usuario a mano, pega la plantilla
   `supabase/templates/magic-link.html` y en *URL Configuration* pon tu URL de Vercel.
4. **Vercel** (Hobby): importa el repo y define `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `ALLOWED_EMAILS`.
5. Abre la URL, entra con tu correo e instala la app (iPhone: Safari → Compartir → Añadir a pantalla de inicio).

## Desarrollo local
```bash
cp .env.example .env.local   # rellena los valores
npm install
npm run dev                  # http://localhost:3000
npm run lint && npm run typecheck && npm test
npm run test:db              # tests de permisos; necesita un Postgres local
```

## Avisos y cron (Fase 5)
1. `npm run vapid` genera las claves de avisos. En Vercel añade `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`,
   `CRON_SECRET` (cadena larga aleatoria) y `SUPABASE_SERVICE_ROLE_KEY` (clave secreta de Supabase). Redespliega.
2. En Supabase → SQL Editor ejecuta (una vez): `select public.configure_cron('https://TU-APP.vercel.app', 'TU_CRON_SECRET');`
   (Supabase → Database → Extensions: activa `pg_cron` y `pg_net` si no lo están.)
3. En el iPhone: instala la app (Safari → Compartir → Añadir a pantalla de inicio), abre Ajustes → «Activar avisos» y pulsa «Enviar aviso de prueba».
Si Supabase Cron no estuviera disponible: cron-job.org → URL `https://TU-APP.vercel.app/api/cron/reminders`, cada minuto, cabecera `Authorization: Bearer TU_CRON_SECRET`.

## IA (Fase 6)
1. Crea una clave en https://aistudio.google.com → *Get API key* y ponla en Vercel como `GEMINI_API_KEY` (opcional: `GEMINI_MODEL_FAST`, `GEMINI_MODEL_VIDEO`, `AI_MAX_RPM`).
2. Aplica la migración `20261011000001_ai.sql` y `20261011000002_ai_cron.sql`, y vuelve a ejecutar una vez
   `select public.configure_cron('https://TU-APP.vercel.app', 'TU_CRON_SECRET');` (programa también la cola de IA).
3. En **Ajustes → Inteligencia artificial** fija el presupuesto mensual (10 € por defecto) y revisa los precios por modelo.

## YouTube y Favoritos (Fase 7)
1. Aplica `20261012000001_favorites.sql` y vuelve a ejecutar `select public.configure_cron(...)` (programa también vídeos y YouTube).
2. En https://console.cloud.google.com crea un proyecto → *APIs y servicios* → habilita **YouTube Data API v3** → *Pantalla de consentimiento OAuth* (externa, en pruebas, añade tu correo como usuario de prueba) → *Credenciales* → *ID de cliente OAuth* tipo **Aplicación web** con URI de redirección `https://TU-APP.vercel.app/api/google/callback`.
3. En Vercel: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` y `TOKEN_ENCRYPTION_KEY` (comando en `.env.example`). Redespliega.
4. Ajustes → *YouTube y vídeos* → **Conectar con Google**. Es gratis (sin tarjeta); en modo «pruebas» Google pide reconectar cada 7 días: publica la app (*Pasar a producción*) para evitarlo.

## Importar PROFITY
```bash
# En .env.local: PROFITY_DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
npm run import:profity:dry                       # simula: cuántos registros y qué totales
npm run import:profity -- --email tu@correo.com  # importa (repetible sin duplicar) y concilia
```

## Variables
Todas están comentadas en `.env.example`. Los secretos nunca se suben al repositorio.

## Documentación
`docs/src/` (borrador de la guía PDF final; se genera con `node scripts/build-guides.mjs`) ·
`CLAUDE.md` (arquitectura y convenciones, incluido cómo compartir espacios) ·
`PROGRESS.md` (estado de cada fase).
