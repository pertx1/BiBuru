"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setSocialPrefs } from "@/app/(app)/redes/sync-actions";
import { useToast } from "@/components/ui/toast";

type Prefs = { social_alerts_enabled: boolean };

const ITEMS: { key: keyof Prefs; title: string; help: string }[] = [
  { key: "social_alerts_enabled", title: "Alertas de redes (apagado)", help: "Te avisa si llegas a una cifra redonda de seguidores, si una publicación va muy por encima de lo normal o si pierdes seguidores de golpe." },
];

/** Ajustes → Redes. */
export function SocialSettings({ initial }: { initial: Prefs }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-3 text-sm">
      {ITEMS.map((i) => (
        <label key={i.key} className="flex items-start gap-3">
          <input type="checkbox" className="mt-0.5 size-5 shrink-0" defaultChecked={initial[i.key]} disabled={pending}
            onChange={(e) => { const on = e.target.checked; start(async () => { const r = await setSocialPrefs({ [i.key]: on }); if (!r.ok) toast({ message: r.error ?? "No se pudo" }); router.refresh(); }); }} />
          <span><strong>{i.title}</strong><br /><span className="text-xs text-muted">{i.help}</span></span>
        </label>
      ))}
    </div>
  );
}
