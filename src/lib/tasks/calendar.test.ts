import { describe, expect, it } from "vitest";
import { expandEvents, itemsForDay, layoutDay, minutes, tasksToItems, type EventRow } from "./calendar";

const ev = (o: Partial<EventRow>): EventRow => ({
  id: "e1", title: "Evento", notes: null, location: null, all_day: false, start_date: "2026-10-05", start_time: "10:00",
  end_date: "2026-10-05", end_time: "11:00", recurrence: null, business_id: null, ...o,
});

describe("calendario", () => {
  it("evento simple dentro y fuera del rango", () => {
    expect(expandEvents([ev({})], "2026-10-01", "2026-10-31")).toHaveLength(1);
    expect(expandEvents([ev({})], "2026-11-01", "2026-11-30")).toHaveLength(0);
  });
  it("evento de varios días aparece en cada día", () => {
    const items = expandEvents([ev({ all_day: true, start_time: null, end_time: null, start_date: "2026-10-05", end_date: "2026-10-07" })], "2026-10-01", "2026-10-31");
    expect([4, 5, 6, 7, 8].map((d) => itemsForDay(items, `2026-10-0${d}`).length)).toEqual([0, 1, 1, 1, 0]);
  });
  it("evento que empezó antes del rango pero lo solapa", () => {
    expect(expandEvents([ev({ all_day: true, start_time: null, end_time: null, start_date: "2026-09-29", end_date: "2026-10-02" })], "2026-10-01", "2026-10-31")).toHaveLength(1);
  });
  it("recurrente semanal", () => {
    const items = expandEvents([ev({ recurrence: { freq: "weekly", interval: 1, byweekday: [0] } })], "2026-10-01", "2026-10-31");
    expect(items.map((i) => i.date)).toEqual(["2026-10-05", "2026-10-12", "2026-10-19", "2026-10-26"]);
    expect(items.every((i) => i.recurring)).toBe(true);
  });
  it("recurrente de varios días solapa el inicio del rango", () => {
    const items = expandEvents([ev({ all_day: true, start_time: null, end_time: null, start_date: "2026-09-28", end_date: "2026-09-30", recurrence: { freq: "weekly", interval: 1 } })], "2026-10-05", "2026-10-06");
    expect(items.map((i) => [i.date, i.endDate])).toEqual([["2026-10-05", "2026-10-07"]]);
  });
  it("tareas con fecha y orden del día", () => {
    const items = [
      ...expandEvents([ev({ title: "Reunión", start_time: "16:00", end_time: "17:00" }), ev({ id: "e2", title: "Cumple", all_day: true, start_time: null, end_time: null })], "2026-10-05", "2026-10-05"),
      ...tasksToItems([{ id: "t1", title: "Llamar", due_date: "2026-10-05", due_time: "09:00", business_id: null, priority: 0, status: "open" }, { id: "t2", title: "Sin fecha", due_date: null, due_time: null, business_id: null, priority: 0, status: "open" }]),
    ];
    expect(itemsForDay(items, "2026-10-05").map((i) => i.title)).toEqual(["Cumple", "Llamar", "Reunión"]);
  });
  it("minutos", () => expect(minutes("10:30:00")).toBe(630));
  it("coloca eventos solapados en carriles distintos", () => {
    const items = expandEvents([
      ev({ id: "a", start_time: "10:00", end_time: "11:30" }),
      ev({ id: "b", start_time: "11:00", end_time: "12:00" }),
      ev({ id: "c", start_time: "13:00", end_time: "14:00" }),
    ], "2026-10-05", "2026-10-05");
    const placed = layoutDay(items, "2026-10-05");
    const by = Object.fromEntries(placed.map((p) => [p.item.id, p]));
    expect([by.a.lane, by.b.lane]).toEqual([0, 1]);
    expect([by.a.lanes, by.b.lanes, by.c.lanes]).toEqual([2, 2, 1]);
    expect(by.a).toMatchObject({ top: 600, height: 90 });
  });
  it("eventos que cruzan la medianoche llegan hasta el final del día", () => {
    const items = expandEvents([ev({ start_time: "22:00", end_time: "02:00", end_date: "2026-10-06" })], "2026-10-05", "2026-10-06");
    expect(layoutDay(items, "2026-10-05")[0]).toMatchObject({ top: 1320, height: 120 });
    expect(layoutDay(items, "2026-10-06")[0]).toMatchObject({ top: 0, height: 120 });
  });
});
