"use client";

import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { cn } from "@/lib/cn";

const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SliderPrimitive.Root
    ref={ref}
    className={cn("relative flex w-full touch-none select-none items-center", className)}
    {...props}
  >
    <SliderPrimitive.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-secondary/60 ring-1 ring-olive-deep/[0.06]">
      <SliderPrimitive.Range className="absolute h-full bg-gradient-to-r from-[#9CC36B] to-[#B6D497] transition-[width] duration-[var(--dur-base)] ease-[var(--ease-klink)]" />
    </SliderPrimitive.Track>
    <SliderPrimitive.Thumb
      className="block h-5 w-5 rounded-full border-2 border-primary bg-card ring-offset-background transition-all duration-[var(--dur-base)] ease-[var(--ease-klink)] hover:scale-110 hover:shadow-[var(--shadow-pill)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-95 disabled:pointer-events-none disabled:opacity-50"
      style={{ boxShadow: "0 2px 6px rgba(61, 79, 42, 0.12)" }}
    />
  </SliderPrimitive.Root>
));
Slider.displayName = SliderPrimitive.Root.displayName;

export { Slider };
