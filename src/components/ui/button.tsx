import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "ripple-container inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-5 [&_svg]:shrink-0 active:scale-95",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-button-base hover:bg-primary/90 hover:shadow-button-hover active:shadow-button-active",
        destructive: "bg-destructive text-destructive-foreground shadow-button-base hover:bg-destructive/90 hover:shadow-button-hover active:shadow-button-active",
        outline: "border-2 border-primary bg-background text-primary shadow-none hover:bg-primary/5 hover:border-primary/80",
        "outline-bold": "border-2 border-foreground bg-background text-foreground shadow-none hover:bg-foreground/5",
        secondary: "bg-secondary text-secondary-foreground shadow-button-base hover:bg-secondary/80 hover:shadow-button-hover active:shadow-button-active",
        accent: "bg-brand-blue text-white shadow-button-base hover:bg-primary/85 hover:shadow-button-hover active:shadow-button-active",
        success: "bg-status-success text-white shadow-button-base hover:bg-status-success/90 hover:shadow-button-hover active:shadow-button-active",
        warning: "bg-status-warning text-white shadow-button-base hover:bg-status-warning/90 hover:shadow-button-hover active:shadow-button-active",
        danger: "bg-status-error text-white shadow-button-base hover:bg-status-error/90 hover:shadow-button-hover active:shadow-button-active",
        ghost: "text-foreground hover:bg-accent/50 hover:text-foreground shadow-none",
        link: "text-primary underline-offset-4 hover:underline shadow-none",
      },
      size: {
        default: "h-11 px-5 py-2.5 text-sm",
        sm: "h-9 px-3.5 py-1.5 text-xs",
        lg: "h-13 px-7 py-3 text-base",
        xl: "h-14 px-8 py-3.5 text-base",
        icon: "h-11 w-11",
        "icon-sm": "h-9 w-9",
        "icon-lg": "h-13 w-13",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
