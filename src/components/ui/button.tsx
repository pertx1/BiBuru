import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 [&_svg]:shrink-0 text-[15px] font-semibold transition-[background-color,opacity,transform] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 md:min-h-9 md:text-sm",
  {
    variants: {
      variant: {
        primary: "bg-accent text-accent-foreground hover:opacity-90",
        secondary: "bg-fill text-foreground hover:bg-fill-strong",
        ghost: "text-accent hover:bg-fill",
      },
    },
    defaultVariants: { variant: "primary" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant }), className)} {...props} />;
}
export { buttonVariants };
