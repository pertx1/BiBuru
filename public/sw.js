/* BiBuru · service worker (Fase 1).
 * - Estáticos inmutables de Next (/_next/static) e iconos: caché primero.
 * - Navegaciones: red primero; si no hay red, página /offline.
 * - Nunca se cachean respuestas de la API ni datos de usuario.
 * Subir VERSION invalida las cachés antiguas. */
const VERSION = "v2";
const STATIC_CACHE = `biburu-static-${VERSION}`;
const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((c) => c.add(OFFLINE_URL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== STATIC_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match(OFFLINE_URL)));
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
