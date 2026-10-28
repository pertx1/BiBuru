"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setSocialAccountBusiness } from "@/app/(app)/redes/actions";
import { useToast } from "@/components/ui/toast";

type Acc = { id: string; kind: "instagram" | "tiktok" | "youtube"; label: string };
const KIND: Record<Acc["kind"], string> = { instagram: "Instagram", tiktok: "TikTok", youtube: "YouTube" };

/** Ajustes › Cuentas sin negocio: cuentas de redes que aún no están asignadas a un negocio (no salen en su pestaña Redes). */
export function UnassignedAccounts({ accounts, businesses }: { accounts: Acc[]; businesses: { id: string; name: string }[] }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, start] = useTransition();
  if (!accounts.length) return <p className="text-sm text-muted">Todas tus cuentas de redes tienen negocio. 👌</p>;
  return (
    <div className="flex flex-col gap-2 text-sm">
      <p className="text-muted">Asigna cada cuenta a su negocio para que salga en la pestaña «Redes» de ese negocio.</p>
      <ul className="flex flex-col divide-y divide-border">
        {accounts.map((a) => (
          <li key={`${a.kind}:${a.id}`} className="flex min-h-12 flex-wrap items-center justify-between gap-2 py-1.5">
            <span className="min-w-0"><span className="text-xs text-muted">{KIND[a.kind]}</span><br /><span className="font-medium">{a.label}</span></span>
            <select aria-label={`Negocio de ${a.label}`} defaultValue="" disabled={busy} className="min-h-11 rounded-lg bg-fill px-3 text-base md:min-h-9 md:text-sm"
              onChange={(e) => {
                const biz = e.target.value || null;
                if (!biz) return;
                start(async () => {
                  const r = await setSocialAccountBusiness(a.id, biz);
                  toast({ message: r.ok ? "Cuenta asignada" : r.error });
                  router.refresh();
                });
              }}>
              <option value="">Elige negocio…</option>
              {businesses.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </li>
        ))}
      </ul>
    </div>
  );
}
