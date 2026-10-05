"use client";

import { Bell, BellOff, Share, SquarePlus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { removePushSubscription, savePushSubscription, sendTestPush } from "@/app/(app)/ajustes/actions";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/dates";

type Device = { id: string; endpoint: string; user_agent: string | null; created_at: string; last_success_at: string | null };
type Status = "loading" | "unsupported" | "ios-install" | "denied" | "off" | "on";

function urlBase64ToUint8Array(b64: string) {
  const padding = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

const deviceName = (ua: string | null) => (!ua ? "Dispositivo" : /iPhone|iPad/.test(ua) ? "iPhone / iPad" : /Android/.test(ua) ? "Android" : /Mac/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : "Dispositivo");

/**
 * Alta guiada de avisos. iOS exige (1) la app instalada en la pantalla de inicio y (2) un gesto del
 * usuario para pedir permiso, por eso el permiso se pide al pulsar el botón, nunca al cargar.
 */
export function PushSetup({ vapidPublicKey, devices }: { vapidPublicKey: string | null; devices: Device[] }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("loading");
  const [here, setHere] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    let alive = true;
    (async () => {
      const ua = navigator.userAgent;
      const isIos = /iPad|iPhone|iPod/.test(ua) || (ua.includes("Mac") && navigator.maxTouchPoints > 1);
      const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
      const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
      let s: Status;
      let endpoint: string | null = null;
      if (!supported) s = isIos && !standalone ? "ios-install" : "unsupported";
      else if (Notification.permission === "denied") s = "denied";
      else {
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = await reg?.pushManager.getSubscription();
        endpoint = sub?.endpoint ?? null;
        s = sub && Notification.permission === "granted" ? "on" : "off";
      }
      if (alive) { setStatus(s); setHere(endpoint); }
    })();
    return () => { alive = false; };
  }, []);

  function enable() {
    start(async () => {
      setMsg(null);
      try {
        if (!vapidPublicKey) throw new Error("El servidor no tiene configuradas las claves de avisos (VAPID). Mira el README.");
        const permission = await Notification.requestPermission(); // gesto del usuario: el botón
        if (permission !== "granted") { setStatus(permission === "denied" ? "denied" : "off"); return; }
        const reg = await navigator.serviceWorker.ready;
        const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) }));
        const json = sub.toJSON();
        const r = await savePushSubscription({ endpoint: sub.endpoint, keys: { p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "" }, userAgent: navigator.userAgent.slice(0, 300) });
        if (!r.ok) throw new Error(r.error);
        setHere(sub.endpoint);
        setStatus("on");
        router.refresh();
      } catch (e) {
        setMsg(e instanceof Error ? e.message : "No se pudieron activar los avisos");
      }
    });
  }

  function disable() {
    start(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) { await removePushSubscription(sub.endpoint); await sub.unsubscribe(); }
      setHere(null); setStatus("off"); router.refresh();
    });
  }

  if (status === "loading") return <div className="skeleton h-20" />;

  return (
    <div className="flex flex-col gap-3">
      {status === "ios-install" && (
        <div className="flex flex-col gap-2 text-sm">
          <p>En iPhone los avisos solo funcionan con la app <strong>instalada en la pantalla de inicio</strong> (iOS 16.4 o superior):</p>
          <ol className="list-decimal space-y-1.5 pl-5">
            <li>Abre BiBuru en <strong>Safari</strong>.</li>
            <li>Pulsa Compartir <Share className="inline size-4 align-text-bottom" aria-label="Compartir" />.</li>
            <li>Elige <strong>«Añadir a pantalla de inicio»</strong> <SquarePlus className="inline size-4 align-text-bottom" aria-hidden />.</li>
            <li>Abre BiBuru desde su icono nuevo y vuelve aquí para activar los avisos.</li>
          </ol>
        </div>
      )}
      {status === "unsupported" && <p className="text-sm text-muted">Este navegador no admite avisos. Prueba con Chrome, Edge o Safari (iPhone con la app instalada).</p>}
      {status === "denied" && <p className="text-sm text-muted">Has bloqueado los avisos para BiBuru. Actívalos en los ajustes del navegador o del iPhone (Ajustes → Notificaciones → BiBuru) y vuelve a esta pantalla.</p>}
      {status === "off" && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted">Recibe recordatorios de tareas y eventos, el resumen de cada mañana y la revisión semanal, aunque la app esté cerrada.</p>
          <div><Button onClick={enable} disabled={pending}><Bell className="size-4" aria-hidden /> {pending ? "Activando…" : "Activar avisos en este dispositivo"}</Button></div>
        </div>
      )}
      {status === "on" && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-sm text-emerald-700 dark:text-emerald-400"><Bell className="size-4" aria-hidden /> Avisos activados en este dispositivo</span>
          <Button variant="secondary" disabled={pending} onClick={() => start(async () => { const r = await sendTestPush(); setMsg(r.ok ? `Aviso de prueba enviado a ${r.sent} ${r.sent === 1 ? "dispositivo" : "dispositivos"}` : r.error); })}>Enviar aviso de prueba</Button>
          <Button variant="ghost" disabled={pending} onClick={disable}><BellOff className="size-4" aria-hidden /> Desactivar aquí</Button>
        </div>
      )}
      {msg && <p role="status" className="text-sm text-muted">{msg}</p>}

      {devices.length > 0 && (
        <div>
          <h3 className="mb-1 text-xs font-medium text-muted">Dispositivos con avisos</h3>
          <ul className="divide-y divide-border rounded-lg border border-border">
            {devices.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                <span>{deviceName(d.user_agent)}{d.endpoint === here && <span className="ml-2 text-xs text-accent">(este)</span>}<span className="block text-xs text-muted">desde {formatDate(d.created_at.slice(0, 10))}{d.last_success_at ? ` · último aviso ${formatDate(d.last_success_at.slice(0, 10))}` : ""}</span></span>
                <button type="button" aria-label="Quitar dispositivo" disabled={pending} onClick={() => start(async () => { await removePushSubscription(d.endpoint); router.refresh(); })} className="flex size-10 items-center justify-center text-muted hover:text-danger"><Trash2 className="size-4" aria-hidden /></button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
