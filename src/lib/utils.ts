import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** plural(1, "pedido", "pedidos") -> "1 pedido" */
export function plural(n: number, one: string, many: string): string {
  return `${n.toLocaleString("es-ES")} ${n === 1 ? one : many}`;
}
