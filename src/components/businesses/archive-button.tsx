"use client";

import { Archive, ArchiveRestore } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setBusinessArchived } from "@/app/(app)/negocios/actions";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

/** Archivar sin diálogo de confirmación: se avisa con "Deshacer". */
export function ArchiveButton({ id, archived }: { id: string; archived: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const run = (value: boolean) =>
    start(async () => {
      await setBusinessArchived(id, value);
      router.refresh();
    });
  return (
    <Button
      variant="ghost" disabled={pending}
      onClick={() => {
        run(!archived);
        toast({
          message: archived ? "Negocio restaurado" : "Negocio archivado",
          actionLabel: "Deshacer",
          onAction: () => run(archived),
        });
      }}
    >
      {archived ? <ArchiveRestore className="size-4" aria-hidden /> : <Archive className="size-4" aria-hidden />}
      {archived ? "Restaurar negocio" : "Archivar negocio"}
    </Button>
  );
}
