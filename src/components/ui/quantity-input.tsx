
import * as React from "react";
import { cn } from "@/lib/utils";

export interface QuantityInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {}

const QuantityInput = React.forwardRef<HTMLInputElement, QuantityInputProps>(
  ({ className, ...props }, ref) => {
    const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
      // Only allow numbers, backspace, delete, arrow keys, and tab
      if (
        !/[0-9]/.test(e.key) &&
        !['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.key)
      ) {
        e.preventDefault();
      }
    };

    return (
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className
        )}
        onKeyPress={handleKeyPress}
        ref={ref}
        {...props}
      />
    );
  }
);
QuantityInput.displayName = "QuantityInput";

export { QuantityInput };
