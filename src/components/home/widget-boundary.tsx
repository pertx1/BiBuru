"use client";

import { Component, type ReactNode } from "react";

/** Si un widget falla al cargar, muestra un aviso en su hueco y los demás siguen funcionando. */
export class WidgetBoundary extends Component<{ title: string; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(e: unknown) { console.error("[inicio] widget:", this.props.title, e instanceof Error ? e.message : e); }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="flex h-full min-h-28 flex-col justify-center gap-2 rounded-xl border border-border bg-surface p-4 text-sm">
        <p className="font-medium">{this.props.title}</p>
        <p className="text-muted">No se pudo cargar este widget.</p>
        <button type="button" className="min-h-11 self-start rounded-lg border border-border px-3 text-sm hover:bg-surface-2" onClick={() => location.reload()}>Reintentar</button>
      </div>
    );
  }
}
