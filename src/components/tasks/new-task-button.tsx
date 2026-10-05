"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { TaskSheet, type BizOption, type GoalOption } from "./task-sheet";

export function NewTaskButton({ businesses, goals, today, defaultBusinessId }: { businesses: BizOption[]; goals: GoalOption[]; today: string; defaultBusinessId?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" className="shrink-0 whitespace-nowrap" onClick={() => setOpen(true)}><Plus className="size-4" aria-hidden /> Tarea completa</Button>
      <TaskSheet task={null} open={open} onClose={() => setOpen(false)} businesses={businesses} goals={goals} today={today} defaultBusinessId={defaultBusinessId} />
    </>
  );
}
