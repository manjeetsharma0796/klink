import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

const buttonVariants = cva(
  // Base — mirrors landing's pill buttons: 1px subtle shadow at rest,
  // softer lift + active scale on press, cubic-bezier-eased.
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-pill text-sm font-medium " +
    "ring-offset-background transition-all duration-200 ease-[cubic-bezier(.22,1,.36,1)] " +
    "shadow-[0_1px_2px_rgba(61,79,42,0.04)] " +
    "hover:-translate-y-[1px] hover:shadow-[0_2px_8px_rgba(61,79,42,0.08)] " +
    "active:translate-y-0 active:scale-[0.98] " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 " +
    "disabled:pointer-events-none disabled:opacity-50 disabled:hover:translate-y-0 disabled:shadow-none " +
    "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-[#B6D497]",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-olive-deep/15 bg-card text-olive-deep hover:bg-secondary/60",
        secondary: "bg-secondary text-secondary-foreground hover:bg-[#CBE0B5]",
        ghost: "shadow-none hover:shadow-none hover:bg-accent hover:text-accent-foreground hover:-translate-y-0",
        link: "shadow-none hover:shadow-none hover:-translate-y-0 text-olive-deep underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-5 py-2",
        sm: "h-9 px-4",
        lg: "h-11 px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
