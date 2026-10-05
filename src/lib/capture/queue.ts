/**
 * Cola de capturas en el dispositivo: una captura se guarda aquí al instante (IndexedDB, o
 * localStorage si no está disponible) y se envía al servidor en cuanto hay red. Si la app se
 * cierra o no hay conexión, no se pierde. El envío es idempotente (client_id), así que reenviar
 * tras un corte no duplica.
 */
export type QueuedCapture = { clientId: string; text: string; capturedAt: string; source: "text" | "voice"; attempts: number };

const DB_NAME = "biburu-capture";
const STORE = "queue";
const LS_KEY = "biburu-capture-queue";

function hasIDB(): boolean {
  try {
    return typeof indexedDB !== "undefined" && indexedDB !== null;
  } catch {
    return false;
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "clientId" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = run(t.objectStore(STORE));
        t.oncomplete = () => { db.close(); resolve(req.result); };
        t.onerror = () => { db.close(); reject(t.error); };
        t.onabort = () => { db.close(); reject(t.error); };
      }),
  );
}

// --- localStorage de reserva ---
function lsRead(): QueuedCapture[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as QueuedCapture[]) : [];
  } catch {
    return [];
  }
}
function lsWrite(items: QueuedCapture[]) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(items)); } catch { /* sin almacenamiento: nada que hacer */ }
}

export async function enqueue(item: Omit<QueuedCapture, "attempts">): Promise<void> {
  const full: QueuedCapture = { ...item, attempts: 0 };
  if (hasIDB()) {
    try { await tx("readwrite", (s) => s.put(full)); return; } catch { /* cae a localStorage */ }
  }
  const items = lsRead().filter((i) => i.clientId !== full.clientId);
  lsWrite([...items, full]);
}

export async function listQueue(): Promise<QueuedCapture[]> {
  let items: QueuedCapture[] = [];
  if (hasIDB()) {
    try { items = await tx("readonly", (s) => s.getAll() as IDBRequest<QueuedCapture[]>); } catch { items = []; }
  }
  const ls = lsRead();
  const seen = new Set(items.map((i) => i.clientId));
  return [...items, ...ls.filter((i) => !seen.has(i.clientId))].sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
}

async function removeItem(clientId: string): Promise<void> {
  if (hasIDB()) { try { await tx("readwrite", (s) => s.delete(clientId)); } catch { /* ignora */ } }
  const ls = lsRead();
  if (ls.some((i) => i.clientId === clientId)) lsWrite(ls.filter((i) => i.clientId !== clientId));
}

async function bump(item: QueuedCapture): Promise<void> {
  const next = { ...item, attempts: item.attempts + 1 };
  if (hasIDB()) { try { await tx("readwrite", (s) => s.put(next)); return; } catch { /* ignora */ } }
  lsWrite(lsRead().map((i) => (i.clientId === item.clientId ? next : i)));
}

/** 'ok' = enviado (se borra) · 'retry' = sin red o error temporal (se conserva) · 'drop' = inválido (se descarta). */
export type SendResult = "ok" | "retry" | "drop";
let flushing: Promise<{ sent: number; remaining: number }> | null = null;

/** Envía lo pendiente en orden. Se detiene en el primer fallo temporal. Nunca lanza. */
export function flushQueue(send: (c: QueuedCapture) => Promise<SendResult>): Promise<{ sent: number; remaining: number }> {
  if (flushing) return flushing;
  flushing = (async () => {
    let sent = 0;
    const items = await listQueue();
    for (let i = 0; i < items.length; i++) {
      let result: SendResult;
      try { result = await send(items[i]); } catch { result = "retry"; }
      if (result === "retry") {
        await bump(items[i]);
        return { sent, remaining: items.length - i };
      }
      await removeItem(items[i].clientId);
      if (result === "ok") sent++;
    }
    return { sent, remaining: 0 };
  })().finally(() => { flushing = null; });
  return flushing;
}

export async function queueSize(): Promise<number> {
  return (await listQueue()).length;
}
