import type { PreviewKind } from "@/lib/home/layout";

/** Miniatura ilustrativa de cada tipo de widget para la galería (sin datos reales). */
export function WidgetPreview({ kind }: { kind: PreviewKind }) {
  const box = "h-16 w-full rounded-lg bg-surface-2/60 p-2";
  switch (kind) {
    case "finance":
      return (
        <div className={box}>
          <div className="flex gap-1">{["bg-income", "bg-expense", "bg-good"].map((c) => <span key={c} className="h-3 flex-1 rounded-sm bg-surface"><span className={`ml-auto block size-3 rounded-sm ${c} opacity-60`} /></span>)}</div>
          <svg viewBox="0 0 100 30" className="mt-1 h-7 w-full" aria-hidden><path d="M0 22 C20 18 30 8 50 10 S80 4 100 6" fill="none" stroke="var(--chart-income)" strokeWidth="2" /><path d="M0 26 C20 24 35 20 50 22 S80 16 100 18" fill="none" stroke="var(--chart-expense)" strokeWidth="2" /></svg>
        </div>
      );
    case "line":
      return (
        <div className={box}>
          <span className="block h-2 w-10 rounded bg-surface" /><span className="mt-1 block h-3 w-16 rounded bg-foreground/60" />
          <svg viewBox="0 0 100 24" className="h-6 w-full" aria-hidden><path d="M0 18 C20 16 30 10 50 12 S80 4 100 6" fill="none" stroke="var(--accent)" strokeWidth="2" /><path d="M0 20 C25 19 40 16 60 17 S85 12 100 14" fill="none" stroke="var(--accent)" strokeOpacity=".4" strokeWidth="1.5" strokeDasharray="3 3" /></svg>
        </div>
      );
    case "number":
      return <div className={box}><span className="block h-2 w-12 rounded bg-surface" /><span className="mt-2 block h-6 w-8 rounded bg-foreground/60" /></div>;
    case "list":
      return <div className={`${box} flex flex-col gap-1.5`}>{[0, 1, 2].map((i) => <span key={i} className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm border border-muted" /><span className="h-2 flex-1 rounded bg-surface" /></span>)}</div>;
    case "agenda":
      return <div className={`${box} flex flex-col gap-1.5`}>{[0, 1].map((i) => <span key={i} className="flex gap-1.5"><span className="h-2 w-6 rounded bg-accent/60" /><span className="h-2 flex-1 rounded bg-surface" /></span>)}</div>;
    case "bars":
      return <div className={`${box} flex flex-col justify-center gap-2`}>{[70, 40].map((w) => <span key={w} className="h-2 rounded-full bg-surface"><span className="block h-2 rounded-full bg-accent" style={{ width: `${w}%` }} /></span>)}</div>;
    case "ring":
      return <div className={`${box} flex items-center justify-center`}><svg viewBox="0 0 36 36" className="size-12" aria-hidden><circle cx="18" cy="18" r="14" fill="none" stroke="var(--surface)" strokeWidth="5" /><circle cx="18" cy="18" r="14" fill="none" stroke="var(--accent)" strokeWidth="5" strokeDasharray="60 100" strokeLinecap="round" transform="rotate(-90 18 18)" /></svg></div>;
    case "input":
      return <div className={`${box} flex items-center`}><span className="flex h-8 w-full items-center gap-2 rounded-full bg-surface px-3"><span className="text-accent">+</span><span className="h-2 flex-1 rounded bg-surface-2" /></span></div>;
  }
}
