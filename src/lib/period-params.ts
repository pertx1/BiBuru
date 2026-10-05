import { PERIOD_LABELS, isValidISO, resolvePeriod, todayISO, type PeriodPreset } from "@/lib/dates";

export type PeriodSearchParams = { periodo?: string; desde?: string; hasta?: string };

/** Lee ?periodo=…&desde=…&hasta=… y devuelve el rango efectivo (por defecto, este mes). */
export function periodFromParams(sp: PeriodSearchParams, now: Date = new Date()) {
  const today = todayISO(now);
  const preset = (sp.periodo && sp.periodo in PERIOD_LABELS ? sp.periodo : "this_month") as PeriodPreset;
  const custom = sp.desde && sp.hasta && isValidISO(sp.desde) && isValidISO(sp.hasta) ? { from: sp.desde, to: sp.hasta } : undefined;
  const effective = preset === "custom" && !custom ? "this_month" : preset;
  const period = resolvePeriod(effective, today, custom);
  return { preset: effective, period, today };
}
