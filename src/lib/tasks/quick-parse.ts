/**
 * Alta de tareas en una línea: entiende fechas, horas, prioridad y recurrencia en español.
 *   "llamar a la imprenta mañana a las 10"     -> título + mañana 10:00
 *   "pagar la luz el 15 !!"                    -> día 15, prioridad alta
 *   "revisar stock cada lunes #akerra"         -> recurrente, negocio "akerra"
 * Determinista y sin dependencias (chrono-node falla con "pasado mañana" o "5 de la tarde").
 */
import { addDays, addMonths, endOfMonth, isValidISO, startOfWeek } from "@/lib/dates";
import { dow, type Recurrence } from "./recurrence";

export type QuickTask = {
  title: string;
  date: string | null;
  time: string | null;        // "HH:MM"
  priority: number;           // 0-3
  recurrence: Recurrence | null;
  businessHint: string | null; // texto tras "#"
};

const DAY_RE = "(?:lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)";
const DAY_INDEX: Record<string, number> = { lunes: 0, martes: 1, miercoles: 2, jueves: 3, viernes: 4, sabado: 5, domingo: 6 };
const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const MONTH_RE = "(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre|ene|feb|mar|abr|may|jun|jul|ago|sep|sept|oct|nov|dic)";

const plain = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const dayIdx = (s: string) => DAY_INDEX[plain(s)];
function monthIdx(s: string): number {
  const p = plain(s).replace("setiembre", "septiembre");
  const i = MONTHS.findIndex((m) => m === p || m.startsWith(p));
  return i;
}
const pad = (n: number) => String(n).padStart(2, "0");
const hhmm = (h: number, m: number) => `${pad(h)}:${pad(m)}`;

type Cut = { re: RegExp; text: string };
/** Quita de `s` la primera coincidencia de `re` y la devuelve. */
function take(state: { s: string }, re: RegExp): RegExpExecArray | null {
  const m = re.exec(state.s);
  if (!m) return null;
  state.s = (state.s.slice(0, m.index) + " " + state.s.slice(m.index + m[0].length)).replace(/\s+/g, " ");
  return m;
}
void ({} as Cut);

function parseTime(st: { s: string }): string | null {
  let m: RegExpExecArray | null;
  // "a las 5 de la tarde", "a las 9 de la mañana", "a las 10 de la noche"
  if ((m = take(st, /\b(?:a\s+)?las?\s+(\d{1,2})(?:[:.h](\d{2}))?\s*(?:h\b)?\s*(?:de\s+la\s+(ma[ñn]ana|tarde|noche|madrugada))/i))) {
    let h = +m[1]; const min = m[2] ? +m[2] : 0;
    const part = plain(m[3]);
    if ((part === "tarde" || part === "noche") && h < 12) h += 12;
    if (part === "noche" && h === 12) h = 0;
    return h < 24 && min < 60 ? hhmm(h, min) : null;
  }
  // "a las 10 y media", "a las 10 y cuarto", "a las 10 menos cuarto"
  if ((m = take(st, /\b(?:a\s+)?las?\s+(\d{1,2})\s+(y\s+media|y\s+cuarto|menos\s+cuarto)\b/i))) {
    let h = +m[1]; let min = 0;
    if (/media/i.test(m[2])) min = 30; else if (/y\s+cuarto/i.test(m[2])) min = 15; else { h -= 1; min = 45; }
    return h >= 0 && h < 24 ? hhmm(h, min) : null;
  }
  // "a las 10", "a las 10:30", "a las 18.30", "a las 10h", "a la 1"
  if ((m = take(st, /\b(?:a\s+)?las?\s+(\d{1,2})(?:[:.h](\d{2}))?\s*h?\b(?!\s*(?:\/|-)\d)/i))) {
    const h = +m[1]; const min = m[2] ? +m[2] : 0;
    return h < 24 && min < 60 ? hhmm(h, min) : null;
  }
  // "10:30" suelto
  if ((m = take(st, /\b(\d{1,2}):(\d{2})\b/))) {
    const h = +m[1]; const min = +m[2];
    return h < 24 && min < 60 ? hhmm(h, min) : null;
  }
  if (take(st, /\b(?:al\s+)?mediod[ií]a\b/i)) return "12:00";
  if (take(st, /\bpor\s+la\s+ma[ñn]ana\b/i)) return "09:00";
  if (take(st, /\bpor\s+la\s+tarde\b|\besta\s+tarde\b/i)) return "17:00";
  if (take(st, /\bpor\s+la\s+noche\b|\besta\s+noche\b/i)) return "21:00";
  return null;
}

function nextWeekday(today: string, target: number, strictlyAfter: boolean): string {
  const cur = dow(today);
  let diff = (target - cur + 7) % 7;
  if (diff === 0 && strictlyAfter) diff = 7;
  return addDays(today, diff);
}

function parseRecurrenceText(st: { s: string }): Recurrence | null {
  let m: RegExpExecArray | null;
  if (take(st, /\b(?:todos\s+los\s+d[ií]as|cada\s+d[ií]a|diariamente)\b/i)) return { freq: "daily", interval: 1 };
  if ((m = take(st, /\bcada\s+(\d{1,3})\s+(d[ií]as|semanas|meses|a[ñn]os)\b/i))) {
    const n = +m[1]; const u = plain(m[2]);
    return { freq: u.startsWith("dia") ? "daily" : u.startsWith("sem") ? "weekly" : u.startsWith("mes") ? "monthly" : "yearly", interval: n };
  }
  // "cada lunes", "cada lunes y jueves", "todos los lunes"
  if ((m = take(st, new RegExp(`\\b(?:cada|todos\\s+los|todas\\s+las)\\s+(${DAY_RE}(?:\\s*(?:,|y|e)\\s*${DAY_RE})*)`, "i")))) {
    const days = [...m[1].matchAll(new RegExp(DAY_RE, "gi"))].map((x) => dayIdx(x[0]));
    return { freq: "weekly", interval: 1, byweekday: [...new Set(days)].sort() };
  }
  if (take(st, /\b(?:cada\s+semana|todas\s+las\s+semanas|semanalmente)\b/i)) return { freq: "weekly", interval: 1 };
  if (take(st, /\b(?:cada\s+mes|todos\s+los\s+meses|mensualmente)\b/i)) return { freq: "monthly", interval: 1 };
  if (take(st, /\b(?:cada\s+a[ñn]o|todos\s+los\s+a[ñn]os|anualmente)\b/i)) return { freq: "yearly", interval: 1 };
  return null;
}

function parseDate(st: { s: string }, today: string): string | null {
  let m: RegExpExecArray | null;
  if (take(st, /\bpasado\s+ma[ñn]ana\b/i)) return addDays(today, 2);
  if ((m = take(st, /\b(?:dentro\s+de|en)\s+(\d{1,3}|un|una)\s+(d[ií]as?|semanas?|meses|mes)\b/i))) {
    const n = /^\d/.test(m[1]) ? +m[1] : 1; const u = plain(m[2]);
    return u.startsWith("dia") ? addDays(today, n) : u.startsWith("sem") ? addDays(today, 7 * n) : addMonths(today, n);
  }
  if (take(st, /\b(?:la\s+semana\s+(?:que\s+viene|pr[oó]xima)|la\s+pr[oó]xima\s+semana|(?:la\s+)?semana\s+que\s+viene)\b/i)) return addDays(startOfWeek(today), 7);
  if (take(st, /\b(?:el\s+mes\s+(?:que\s+viene|pr[oó]ximo)|el\s+pr[oó]ximo\s+mes)\b/i)) return addMonths(today, 1);
  if (take(st, /\bfin\s+de\s+mes\b/i)) return endOfMonth(today);
  if (take(st, /\bhoy\b/i)) return today;
  if (take(st, /\bma[ñn]ana\b/i)) return addDays(today, 1);
  // "15/10/2026", "15/10", "15-10"
  if ((m = take(st, /\b(?:el\s+)?(\d{1,2})[/\-.](\d{1,2})(?:[/\-.](\d{2,4}))?\b/i))) {
    const d = +m[1]; const mo = +m[2];
    let y = m[3] ? +m[3] : +today.slice(0, 4);
    if (y < 100) y += 2000;
    let iso = `${y}-${pad(mo)}-${pad(d)}`;
    if (!isValidISO(iso)) return null;
    if (!m[3] && iso < today) { iso = `${y + 1}-${pad(mo)}-${pad(d)}`; if (!isValidISO(iso)) return null; }
    return iso;
  }
  // "el 3 de noviembre", "3 nov", "3 de noviembre de 2027"
  if ((m = take(st, new RegExp(`\\b(?:el\\s+)?(\\d{1,2})\\s+(?:de\\s+)?(${MONTH_RE})(?:\\s+(?:de\\s+)?(\\d{4}))?\\b`, "i")))) {
    const d = +m[1]; const mo = monthIdx(m[2]) + 1;
    let y = m[3] ? +m[3] : +today.slice(0, 4);
    let iso = `${y}-${pad(mo)}-${pad(d)}`;
    if (!isValidISO(iso)) return null;
    if (!m[3] && iso < today) { y += 1; iso = `${y}-${pad(mo)}-${pad(d)}`; if (!isValidISO(iso)) return null; }
    return iso;
  }
  // "el lunes", "este viernes", "el próximo martes", "viernes"
  if ((m = take(st, new RegExp(`\\b(?:(el\\s+)?pr[oó]xim[oa]\\s+|(?:este|el)\\s+)?(${DAY_RE})\\b(?:\\s+(?:que\\s+viene|pr[oó]ximo))?`, "i")))) {
    const idx = dayIdx(m[2]);
    const explicitNext = /pr[oó]xim/i.test(m[0]) || /que\s+viene/i.test(m[0]);
    return nextWeekday(today, idx, explicitNext || dow(today) === idx);
  }
  // "el 15" (día del mes)
  if ((m = take(st, /\bel\s+(\d{1,2})\b(?!\s*[:h])/i))) {
    const d = +m[1];
    if (d < 1 || d > 31) return null;
    const mk = (base: string) => `${base.slice(0, 7)}-${pad(d)}`;
    let iso = mk(today);
    if (!isValidISO(iso) || iso < today) iso = mk(addMonths(today.slice(0, 7) + "-01", 1));
    return isValidISO(iso) ? iso : null;
  }
  return null;
}

/**
 * @param text   lo escrito por la persona
 * @param today  "hoy" en su zona (ISO)
 * @param nowHHMM hora actual "HH:MM" (para "en 2 horas")
 */
export function parseQuickTask(text: string, today: string, nowHHMM = "09:00"): QuickTask {
  const st = { s: ` ${text.trim()} ` };
  let priority = 0;
  const bang = take(st, /\s(!{1,3})(?=\s)/);
  if (bang) priority = bang[1].length === 1 ? 2 : 3;
  let businessHint: string | null = null;
  const tag = take(st, /(?:^|\s)#([\p{L}\p{N}_-]+)/u);
  if (tag) businessHint = tag[1];

  // "en 2 horas" / "en media hora"
  let date: string | null = null;
  let time: string | null = null;
  let m: RegExpExecArray | null;
  if ((m = take(st, /\b(?:dentro\s+de|en)\s+(\d{1,2}|una|media)\s+(horas?|hora)\b/i))) {
    const hours = /media/i.test(m[1]) ? 0.5 : /una/i.test(m[1]) ? 1 : +m[1];
    const total = Number(nowHHMM.slice(0, 2)) * 60 + Number(nowHHMM.slice(3, 5)) + Math.round(hours * 60);
    date = addDays(today, Math.floor(total / 1440));
    time = hhmm(Math.floor((total % 1440) / 60), total % 60);
  }

  const recurrence = parseRecurrenceText(st);
  if (!time) time = parseTime(st);
  if (!date) date = parseDate(st, today);
  if (recurrence && !date) {
    // Primera aparición: hoy si encaja, si no la siguiente.
    if (recurrence.freq === "weekly" && recurrence.byweekday?.length) {
      const dows = recurrence.byweekday;
      for (let i = 0; i < 7 && !date; i++) if (dows.includes(dow(addDays(today, i)))) date = addDays(today, i);
    } else date = today;
  }
  if (time && !date) date = today;

  let title = st.s
    .replace(/\s+(?:el|la|los|las|para|de|a|en|del|al|por)\s*$/i, "")
    .replace(/^\s*(?:el|la|para)\s+(?=\S+\s*$)/i, "")
    .replace(/\s+/g, " ")
    .replace(/\s+[,;.]/g, "")
    .trim()
    .replace(/^[,;:\-–\s]+|[,;:\-–\s]+$/g, "");
  // Quita conectores que quedan colgando al final tras extraer fechas ("... el", "... para")
  for (let i = 0; i < 3; i++) title = title.replace(/\s+(?:el|la|los|las|para|de|a|en|del|al|por|que|y)$/i, "").trim();
  if (!title) title = text.trim();
  if (title.length > 200) title = title.slice(0, 200);
  return { title: title.charAt(0).toUpperCase() + title.slice(1), date, time, priority, recurrence, businessHint };
}
