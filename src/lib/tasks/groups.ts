import { addDays } from "@/lib/dates";
import { relativeDay } from "./format";
import type { TaskView, TaskWithSubs } from "./data";

export type TaskGroup = { key: string; title: string; tone?: "danger"; tasks: TaskWithSubs[] };

/** Agrupa como Antola: Hoy = «Vencidas» + «Hoy»; 7 días = por día relativo; el resto, una sola lista. */
export function groupTasks(view: TaskView, tasks: TaskWithSubs[], today: string): TaskGroup[] {
  switch (view) {
    case "hoy":
      return [
        { key: "late", title: "Vencidas", tone: "danger", tasks: tasks.filter((t) => t.due_date! < today) },
        { key: "today", title: "Hoy", tasks: tasks.filter((t) => t.due_date === today) },
      ];
    case "semana":
      return Array.from({ length: 7 }, (_, i) => addDays(today, i)).map((d) => ({ key: d, title: relativeDay(d, today), tasks: tasks.filter((t) => t.due_date === d) }));
    case "todas":
      return [
        { key: "late", title: "Vencidas", tone: "danger", tasks: tasks.filter((t) => t.due_date && t.due_date < today) },
        { key: "dated", title: "Con fecha", tasks: tasks.filter((t) => t.due_date && t.due_date >= today) },
        { key: "none", title: "Sin fecha", tasks: tasks.filter((t) => !t.due_date) },
      ];
    case "hechas":
      return [{ key: "done", title: "Completadas", tasks }];
    default:
      return [{ key: view, title: "", tasks }];
  }
}
