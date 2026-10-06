"use client";

import { FileUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { previewProfityImport, runProfityImport, type ProfityPreview } from "@/app/(app)/ajustes/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ReconRow } from "@/lib/profity-apply";

const LABELS: Record<string, string> = { orders: "Pedidos", ordersActive: "Pedidos sin cancelar", expenses: "Gastos", incomes: "Ingresos", tshirtStocks: "Stock de prendas", dtfStocks: "Stock DTF", invoices: "Facturas" };

/** Importa la exportación JSON de PROFITY: elegir archivo → revisar totales → importar → conciliación. */
export function ProfityImport() {
  const router = useRouter();
  const [text, setText] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<ProfityPreview | null>(null);
  const [main, setMain] = useState("Akerra");
  const [vinted, setVinted] = useState("Vinted");
  const [separate, setSeparate] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ rows: ReconRow[]; allOk: boolean; summary: string } | null>(null);
  const [pending, start] = useTransition();

  async function onFile(f: File | undefined) {
    setError(null); setPreview(null); setResult(null);
    if (!f) return;
    const t = await f.text();
    setText(t); setFileName(f.name);
    start(async () => { const r = await previewProfityImport(t); if (r.ok && r.preview) setPreview(r.preview); else setError(r.ok ? "No se pudo leer" : r.error); });
  }

  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="text-muted">Sube el archivo <code>profity-AAAA-MM-DD.json</code> exportado de PROFITY. Primero verás un resumen; no se escribe nada hasta que pulses «Importar». Puedes repetirlo: no duplica.</p>
      <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 self-start rounded-lg border border-border bg-surface px-3 hover:bg-surface-2 md:min-h-9">
        <FileUp className="size-4" aria-hidden /> {fileName || "Elegir archivo JSON"}
        <input type="file" accept="application/json,.json" className="sr-only" aria-label="Archivo JSON de PROFITY" onChange={(e) => void onFile(e.target.files?.[0])} />
      </label>
      {pending && !preview && !result && <p className="text-muted">Leyendo…</p>}
      {error && <p role="alert" className="text-danger">{error}</p>}

      {preview && !result && (
        <div className="flex flex-col gap-3 rounded-xl border border-border p-3">
          <p>Exportación de <strong>{preview.email ?? "PROFITY"}</strong>{preview.exportedAt ? ` del ${new Date(preview.exportedAt).toLocaleString("es-ES")}` : ""}.</p>
          <table className="w-full text-left"><tbody>
            {preview.totals.map((t) => <tr key={t.label} className="border-t border-border"><td className="py-1.5">{t.label}</td><td className="py-1.5 text-right tabular-nums">{t.count}</td><td className="py-1.5 text-right tabular-nums">{t.amount}</td></tr>)}
          </tbody></table>
          {preview.warnings.map((w) => <p key={w} className="text-xs text-amber-600">⚠ {w}</p>)}
          <label className="flex flex-col gap-1">Negocio para pedidos y gastos<Input value={main} onChange={(e) => setMain(e.target.value)} maxLength={60} /></label>
          {preview.vinted > 0 && (
            <>
              <label className="flex items-center justify-between gap-3">Separar Vinted en su propio negocio ({preview.vinted} apuntes)
                <input type="checkbox" className="size-5" checked={separate} onChange={(e) => setSeparate(e.target.checked)} />
              </label>
              {separate && <label className="flex flex-col gap-1">Nombre del negocio de Vinted<Input value={vinted} onChange={(e) => setVinted(e.target.value)} maxLength={60} /></label>}
            </>
          )}
          <Button type="button" className="self-start" disabled={pending || !text || !main.trim()} onClick={() => start(async () => {
            setError(null);
            const r = await runProfityImport(text!, { main, vinted, separateVinted: separate });
            if (r.ok && r.rows) { setResult({ rows: r.rows, allOk: !!r.allOk, summary: r.summary ?? "" }); router.refresh(); } else setError(r.ok ? "Error" : r.error);
          })}>{pending ? "Importando… (puede tardar un minuto)" : "Importar"}</Button>
        </div>
      )}

      {result && (
        <div className={`flex flex-col gap-2 rounded-xl border p-3 ${result.allOk ? "border-emerald-500/50" : "border-danger/50"}`}>
          <p className="font-medium">{result.allOk ? "✔ Todo coincide. Importación completada." : "✘ Hay diferencias: revisa la tabla antes de seguir."}</p>
          <p className="text-muted">{result.summary}</p>
          <ul className="flex flex-col">
            {result.rows.map((r) => (
              <li key={r.tabla} className="flex items-center justify-between gap-3 border-t border-border py-1.5">
                <span>{LABELS[r.tabla] ?? r.tabla}</span>
                <span className="text-right tabular-nums">{r["destino nº"]}{r.tabla === "invoices" ? "" : ` · ${r.destino}`} <span aria-label={r.resultado}>{r.resultado.startsWith("✔") ? "✔" : `✘ (origen ${r["origen nº"]} · ${r.origen})`}</span></span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
