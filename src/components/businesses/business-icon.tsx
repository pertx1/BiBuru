import { Briefcase, Camera, Code, Dumbbell, Home, Music, Palette, Shirt, ShoppingBag, Sparkles, Store, Utensils, type LucideIcon } from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  briefcase: Briefcase, shirt: Shirt, "shopping-bag": ShoppingBag, store: Store, palette: Palette, camera: Camera,
  code: Code, utensils: Utensils, dumbbell: Dumbbell, music: Music, home: Home, sparkles: Sparkles,
};

export function BusinessIcon({ name, color, className = "size-9" }: { name: string; color: string; className?: string }) {
  const Icon = ICONS[name] ?? Briefcase;
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-lg ${className}`} style={{ backgroundColor: `${color}1f`, color }}>
      <Icon className="size-1/2" aria-hidden />
    </span>
  );
}
