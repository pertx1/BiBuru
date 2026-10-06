import { Briefcase, Cpu, Landmark, Megaphone, Newspaper, ShoppingBag, type LucideIcon } from "lucide-react";

const ICONS: Record<string, LucideIcon> = { briefcase: Briefcase, cpu: Cpu, landmark: Landmark, "shopping-bag": ShoppingBag, megaphone: Megaphone, newspaper: Newspaper };
export const TOPIC_ICON_NAMES = Object.keys(ICONS);
export function TopicIcon({ name, className }: { name: string | undefined; className?: string }) {
  const Icon = ICONS[name ?? ""] ?? Newspaper;
  return <Icon className={className} aria-hidden />;
}
