"use client";

import { Check, Copy } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createMcpToken, revokeMcpToken } from "@/app/(app)/ajustes/actions";
import { Button } from "@/components/ui/button";

/** Texto para las preferencias de Claude / CLAUDE.md: que apunte en BiBuru lo que se queda a medias. */
export const CLAUDE_PREFERENCE = `Tengo conectado BiBuru (mi panel de tareas y proyectos). Cuando en una conversación quede algo a medias o con pasos pendientes, antes de terminar llama a la herramienta apuntar_pendiente de BiBuru con qué falta y el contexto para retomarlo (y el proyecto si lo sabes). Cuando te pida apuntar, recordar o planificar algo, créalo en BiBuru.`;

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button type="button" variant="secondary" onClick={() => { void navigator.clipboard?.writeText(text); setDone(true); setTimeout(() => setDone(false), 2000); }}>
      {done ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}{done ? "Copiado" : label}
    </Button>
  );
}

/**
 * Conector de Claude (MCP): una dirección con clave personal que se añade en claude.ai (sirve en la web, el móvil y
 * el escritorio) y en Claude Code. Con ella Claude puede crear y completar tareas, notas, proyectos y eventos, buscar
 * y apuntar lo que se queda a medias en «Pendiente de Claude».
 */
export function ClaudeConnector({ status }: { status: { createdAt: string; lastUsedAt: string | null; lastClient: string | null } | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [url, setUrl] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const fmt = (iso: string) => new Date(iso).toLocaleString("es-ES", { timeZone: "Europe/Madrid", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

  const create = () => start(async () => {
    if (status && !confirm("Se creará una dirección nueva y la que tengas puesta en Claude dejará de funcionar hasta que pongas la nueva. ¿Seguir?")) return;
    const r = await createMcpToken(window.location.origin);
    if (r.ok) { setUrl(r.url); setMsg(null); } else setMsg(r.error);
    router.refresh();
  });
  const cmd = url ? `claude mcp add --transport http --scope user biburu ${url}` : "";

  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="text-muted">Conecta BiBuru a Claude (web, app del móvil y escritorio) y a Claude Code. Desde cualquier chat podrás decirle «apúntame…», «¿qué tengo hoy?», «crea el proyecto…», «guarda esta nota», y lo que se quede a medias aparecerá aquí en el proyecto <strong>Pendiente de Claude</strong> (Proyectos y Tareas → Bandeja).</p>
      {status && !url && <p className="text-muted">Conectado desde el {fmt(status.createdAt)}{status.lastUsedAt ? ` · último uso: ${fmt(status.lastUsedAt)}${status.lastClient ? ` (${status.lastClient.slice(0, 40)})` : ""}` : " · aún no se ha usado"}.</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={pending} onClick={create}>{status ? "Generar dirección nueva" : "Generar dirección para Claude"}</Button>
        {url && <CopyButton text={url} label="Copiar dirección" />}
        {status && <Button type="button" variant="secondary" disabled={pending} onClick={() => { if (confirm("¿Desconectar Claude? Dejará de poder ver y crear cosas en BiBuru.")) start(async () => { const r = await revokeMcpToken(); setUrl(null); setMsg(r.ok ? "Claude desconectado" : (r.error ?? "No se pudo")); router.refresh(); }); }}>Desconectar</Button>}
      </div>
      {url && (
        <>
          <code className="break-all rounded-lg bg-fill p-3 text-xs">{url}</code>
          <p className="text-xs text-muted">La dirección lleva tu clave personal: no la compartas. Cópiala ahora, no se vuelve a mostrar.</p>
        </>
      )}
      <div>
        <h3 className="font-medium">En Claude (web, móvil y escritorio)</h3>
        <ol className="mt-1 list-decimal space-y-1.5 pl-5">
          <li>Abre <strong>claude.ai</strong> en el ordenador → <strong>Ajustes</strong> → <strong>Conectores</strong> → <strong>Añadir conector personalizado</strong>.</li>
          <li>Nombre: <strong>BiBuru</strong>. URL: pega la dirección. <strong>Añadir</strong>. Queda disponible también en la app del móvil.</li>
          <li>En un chat, en el botón de herramientas, comprueba que <strong>BiBuru</strong> está activado. La primera vez Claude te pedirá permiso para cada herramienta: puedes elegir «Permitir siempre».</li>
        </ol>
      </div>
      <div>
        <h3 className="font-medium">En Claude Code</h3>
        <p className="mt-1 text-muted">En la terminal (una vez, vale para todos tus proyectos):</p>
        {url ? <div className="mt-1 flex flex-wrap items-center gap-2"><code className="min-w-0 flex-1 break-all rounded-lg bg-fill p-3 text-xs">{cmd}</code><CopyButton text={cmd} label="Copiar comando" /></div>
          : <code className="mt-1 block break-all rounded-lg bg-fill p-3 text-xs">claude mcp add --transport http --scope user biburu &lt;dirección&gt;</code>}
      </div>
      <div>
        <h3 className="font-medium">Que apunte solo lo que queda a medias</h3>
        <p className="mt-1 text-muted">BiBuru ya se lo pide a Claude al conectarse. Para que no se le olvide, pega esto en claude.ai → Ajustes → <strong>Perfil</strong> → «¿Qué preferencias personales debería tener en cuenta Claude?» y, para Claude Code, en <code>~/.claude/CLAUDE.md</code>:</p>
        <p className="mt-2 rounded-lg bg-fill p-3 text-xs">{CLAUDE_PREFERENCE}</p>
        <div className="mt-2"><CopyButton text={CLAUDE_PREFERENCE} label="Copiar texto" /></div>
      </div>
      {msg && <p role="status" className="text-muted">{msg}</p>}
    </div>
  );
}
