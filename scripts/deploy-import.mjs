// Importación de PROFITY desde el despliegue de Vercel (una sola vez): solo si PROFITY_IMPORT=1 y hay PROFITY_DATABASE_URL.
// No bloquea el despliegue si falla (la importación es repetible sin duplicar). El resultado sale en el registro de compilación.
import { spawnSync } from "node:child_process";

if (process.env.VERCEL_ENV !== "production" || process.env.PROFITY_IMPORT !== "1") process.exit(0);
if (!process.env.PROFITY_DATABASE_URL) {
  console.log("[import] PROFITY_IMPORT=1 pero falta PROFITY_DATABASE_URL: no se importa nada.");
  process.exit(0);
}
const email = process.env.PROFITY_IMPORT_EMAIL || "auto";
console.log(`[import] Importando PROFITY → BiBuru (cuenta: ${email})…`);
const r = spawnSync("npx", ["tsx", "scripts/import-profity.ts", "--email", email, "--yes"], { stdio: "inherit", env: process.env });
console.log(r.status === 0 ? "[import] Terminado." : `[import] La importación falló (código ${r.status}). El despliegue sigue; revisa el mensaje de arriba.`);
