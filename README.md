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

## Variables
Todas están comentadas en `.env.example`. Los secretos nunca se suben al repositorio.

## Documentación
`docs/src/` (borrador de la guía PDF final; se genera con `node scripts/build-guides.mjs`) ·
`CLAUDE.md` (arquitectura y convenciones, incluido cómo compartir espacios) ·
`PROGRESS.md` (estado de cada fase).
