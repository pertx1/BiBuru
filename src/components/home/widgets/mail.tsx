import Link from "next/link";
import { getContext } from "@/lib/context";
import { WidgetCard } from "../widget-card";
import type { WidgetProps } from "../types";

/** «Correos sin leer» de todas las cuentas de Outlook conectadas (o el aviso para conectarlas). */
export async function MailUnreadWidget({ w }: WidgetProps) {
  const { supabase, userId } = await getContext();
  const { data: accs } = await supabase.from("mail_accounts").select("id").eq("user_id", userId);
  if (!accs?.length) return <WidgetCard title="Correos sin leer" href="/correo"><p className="text-sm text-muted">Conecta tu Outlook en Ajustes → Correo.</p></WidgetCard>;
  const [{ count }, { data }] = await Promise.all([
    supabase.from("mail_messages").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("is_read", false),
    supabase.from("mail_messages").select("id, from_name, from_address, subject").eq("user_id", userId).eq("is_read", false).order("received_at", { ascending: false }).limit(w.size === "l" ? 6 : 3),
  ]);
  return (
    <WidgetCard title="Correos sin leer" href="/correo?filtro=no-leidos">
      <p className="text-[1.65rem] font-bold tabular-nums">{count ?? 0}</p>
      {w.size !== "s" && (data ?? []).length > 0 && (
        <ul className="mt-1 flex flex-col divide-y divide-border">
          {data!.map((m) => (
            <li key={m.id}><Link href={`/correo?abrir=${m.id}`} className="flex min-h-11 flex-col justify-center text-sm">
              <span className="truncate font-medium">{m.from_name || m.from_address}</span><span className="truncate text-xs text-muted">{m.subject || "(sin asunto)"}</span>
            </Link></li>
          ))}
        </ul>
      )}
    </WidgetCard>
  );
}
