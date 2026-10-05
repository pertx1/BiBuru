import "server-only";
import webpush from "web-push";
import { getVapidEnv } from "@/lib/env";

export type PushSub = { id: string; endpoint: string; p256dh: string; auth: string };
export type PushPayload = { title: string; body: string; url: string; tag?: string; kind: string; refId?: string };
export type SendResult = { ok: true } | { ok: false; gone: boolean; status?: number };
export type Sender = (sub: PushSub, payload: PushPayload) => Promise<SendResult>;

/** Envío real por Web Push estándar (VAPID). 404/410 = la suscripción caducó y hay que borrarla. */
export function webPushSender(): Sender {
  const env = getVapidEnv();
  webpush.setVapidDetails(env.VAPID_SUBJECT, env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
  return async (sub, payload) => {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload), { TTL: 3600, urgency: "high", timeout: 10_000 });
      return { ok: true };
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      return { ok: false, gone: status === 404 || status === 410, status };
    }
  };
}
