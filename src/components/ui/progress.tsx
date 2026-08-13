import * as React from "react"
import * as ProgressPrimitive from "@radix-ui/react-progress"

import { cn } from "@/lib/utils"

const Progress = React.forwardRef<
  React.ElementRef<typeof ProgressPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root> & {
    /** "ribbon" ties the fill color to how far along the value is, using the brand spectrum. Default stays a solid primary fill. */
    variant?: "default" | "ribbon"
  }
>(({ className, value, variant = "default", ...props }, ref) => (
  <ProgressPrimitive.Root
    ref={ref}
    className={cn(
      "relative h-4 w-full overflow-hidden rounded-full bg-secondary",
      className
    )}
    {...props}
  >
    <ProgressPrimitive.Indicator
      className={cn(
        "h-full w-full flex-1 transition-all",
        variant === "ribbon" ? "ribbon-progress-fill" : "bg-primary"
      )}
      style={
        variant === "ribbon"
          ? {
              transform: `translateX(-${100 - (value || 0)}%)`,
              backgroundPosition: `${value || 0}% 0`,
            }
          : { transform: `translateX(-${100 - (value || 0)}%)` }
      }
    />
  </ProgressPrimitive.Root>
))
Progress.displayName = ProgressPrimitive.Root.displayName

export { Progress }
