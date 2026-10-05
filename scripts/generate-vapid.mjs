// Genera las claves VAPID para los avisos push. Uso: npm run vapid
import webpush from "web-push";
const k = webpush.generateVAPIDKeys();
console.log(`
Copia estas tres líneas en Vercel → Settings → Environment Variables (y en .env.local):

NEXT_PUBLIC_VAPID_PUBLIC_KEY=${k.publicKey}
VAPID_PRIVATE_KEY=${k.privateKey}
VAPID_SUBJECT=mailto:TU_CORREO@ejemplo.com

La clave PRIVADA es secreta: no la compartas ni la subas al repositorio.
`);
