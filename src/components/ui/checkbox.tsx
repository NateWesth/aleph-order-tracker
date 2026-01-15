import * as React from "react"
import * as CheckboxPrimitive from "@radix-ui/react-checkbox"
import { Check } from "lucide-react"

import { cn } from "@/lib/utils"

const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root> & {
    'data-custom-color'?: string;
  }
>(({ className, style, ...props }, ref) => {
  const hasCustomColor = props['data-custom-color'] === 'true';
  const customColor = (style as any)?.['--checkbox-color'];
  
  return (
    <CheckboxPrimitive.Root
      ref={ref}
      className={cn(
        "peer h-4 w-4 shrink-0 rounded-sm border border-primary ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        !hasCustomColor && "data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground",
        className
      )}
      style={{
        ...(style || {}),
        ...(hasCustomColor && customColor ? {
          '--tw-ring-color': customColor,
        } : {}),
      } as React.CSSProperties}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        className={cn("flex items-center justify-center text-current")}
        style={hasCustomColor && customColor ? { color: 'white' } : undefined}
      >
        <Check className="h-4 w-4" />
      </CheckboxPrimitive.Indicator>
      {/* Custom color overlay for checked state */}
      {hasCustomColor && customColor && (
        <style dangerouslySetInnerHTML={{
          __html: `
            [data-custom-color="true"][data-state="checked"] {
              background-color: var(--checkbox-color) !important;
              border-color: var(--checkbox-color) !important;
            }
          `
        }} />
      )}
    </CheckboxPrimitive.Root>
  );
})
Checkbox.displayName = CheckboxPrimitive.Root.displayName

export { Checkbox }
