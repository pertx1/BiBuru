import { addDays } from "@/lib/dates";
import { dueLabel } from "./format";
import type { TaskView, TaskWithSubs } from "./data";

export type TaskGroup = { key: string; title: string; tone?: "danger"; tasks: TaskWithSubs[] };

/** Agrupa las tareas para mostrarlas según la vista. `biz` da el nombre de cada negocio. */
export function groupTasks(view: TaskView, tasks: TaskWithSubs[], today: string, biz: Map<string, string>): TaskGroup[] {
  switch (view) {
    case "hoy":
      return [
        { key: "late", title: "Atrasadas", tone: "danger", tasks: tasks.filter((t) => t.due_date! < today) },
        { key: "today", title: "Hoy", tasks: tasks.filter((t) => t.due_date === today) },
      ];
    case "7dias": {
      const days = Array.from({ length: 7 }, (_, i) => addDays(today, i));
      return days.map((d) => ({ key: d, title: dueLabel(d, null, today).text.replace(/^Atrasada.*/, "") || d, tasks: tasks.filter((t) => t.due_date === d) }));
    }
    case "negocio": {
      const ids = [...new Set(tasks.map((t) => t.business_id))];
      return ids
        .sort((a, b) => (a === null ? 1 : b === null ? -1 : (biz.get(a) ?? "").localeCompare(biz.get(b) ?? "", "es")))
        .map((id) => ({ key: id ?? "none", title: id ? (biz.get(id) ?? "Negocio") : "Sin negocio", tasks: tasks.filter((t) => t.business_id === id) }));
    }
    case "todas":
      return [
        { key: "late", title: "Atrasadas", tone: "danger", tasks: tasks.filter((t) => t.due_date && t.due_date < today) },
        { key: "dated", title: "Con fecha", tasks: tasks.filter((t) => t.due_date && t.due_date >= today) },
        { key: "none", title: "Sin fecha", tasks: tasks.filter((t) => !t.due_date) },
      ];
    case "hechas":
      return [{ key: "done", title: "Hechas", tasks }];
  }
}
