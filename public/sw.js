/* BiBuru · service worker.
 * - Estáticos inmutables de Next (/_next/static) e iconos: caché primero.
 * - Navegaciones a las secciones de la app: red primero; la última página cargada se guarda (máx. 30) para poder
 *   LEERLA sin conexión. Si no hay copia, página /offline. Las copias se borran al abrir /login (cerrar sesión o borrar cuenta).
 * - Nunca se cachean respuestas de la API ni acciones: escribir sin conexión solo se hace en la captura rápida (cola local).
 * Subir VERSION invalida las cachés antiguas. */
const VERSION = "v4";
const STATIC_CACHE = `biburu-static-${VERSION}`;
const PAGES_CACHE = `biburu-pages-${VERSION}`;
const MAX_PAGES = 30;
const CACHEABLE = /^\/($|(tareas|calendario|notas|negocios|objetivos|favoritos|bandeja|chat|mas|ajustes)(\/|$))/;
const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((c) => c.add(OFFLINE_URL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== STATIC_CACHE && k !== PAGES_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    if (url.pathname.startsWith("/login")) event.waitUntil(caches.delete(PAGES_CACHE)); // sesión cerrada: fuera copias de datos
    event.respondWith(
      fetch(req).then((res) => {
        if (res.ok && !res.redirected && CACHEABLE.test(url.pathname) && (res.headers.get("content-type") || "").includes("text/html")) {
          const copy = res.clone();
          event.waitUntil(caches.open(PAGES_CACHE).then(async (c) => {
            await c.put(url.pathname + url.search, copy);
            const keys = await c.keys();
            await Promise.all(keys.slice(0, Math.max(0, keys.length - MAX_PAGES)).map((k) => c.delete(k)));
          }));
        }
        return res;
      }).catch(async () => (await caches.open(PAGES_CACHE).then((c) => c.match(url.pathname + url.search))) || (await caches.match(OFFLINE_URL))),
    );
    return;
  }

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      }),
    );
  }
});

/* ---------------------------------------------------------------- avisos push (Fase 5) */
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: "BiBuru", body: event.data ? event.data.text() : "" }; }
  const actionable = data.kind === "task" || data.kind === "reminder";
  // iOS exige mostrar siempre una notificación por cada push (userVisibleOnly).
  event.waitUntil(
    self.registration.showNotification(data.title || "BiBuru", {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: data.tag || undefined,
      data: { url: data.url || "/", kind: data.kind, refId: data.refId },
      actions: actionable ? [{ action: "done", title: "Hecho" }, { action: "snooze", title: "Posponer 1 h" }] : [],
    }),
  );
});

async function openUrl(url) {
  const target = new URL(url || "/", self.location.origin).href;
  const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const w of wins) {
    if (new URL(w.url).origin === self.location.origin && "focus" in w) {
      await w.focus();
      if ("navigate" in w) { try { await w.navigate(target); } catch { /* ignora */ } }
      return;
    }
  }
  await self.clients.openWindow(target);
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const { url, kind, refId } = event.notification.data || {};
  if ((event.action === "done" || event.action === "snooze") && refId && (kind === "task" || kind === "reminder")) {
    event.waitUntil(
      fetch("/api/push/action", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, refId, action: event.action }) })
        .then((r) => { if (!r.ok) return openUrl(url); })
        .catch(() => openUrl(url)),
    );
    return;
  }
  event.waitUntil(openUrl(url));
});
