/** «Recuérdame que…», «recordatorio: …», «recordar …» al principio de una captura. */
export const REMINDER_PREFIX = /^\s*(?:recu[eé]rdame|recordatorio|recordar)(?:\s*[:,-])?\s+(?:que\s+)?/i;
export const isReminderText = (t: string) => REMINDER_PREFIX.test(t) && t.replace(REMINDER_PREFIX, "").trim().length > 0;
