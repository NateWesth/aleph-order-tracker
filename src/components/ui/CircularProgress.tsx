import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface CircularProgressProps {
  /** Progress value 0-100 */
  value: number;
  /** Size in pixels */
  size?: number;
  /** Stroke width */
  strokeWidth?: number;
  /** Color of the progress arc (CSS color) */
  color?: string;
  /** Whether to animate on mount */
  animate?: boolean;
  /** Optional label inside the circle */
  label?: string;
  className?: string;
}

export default function CircularProgress({
  value,
  size = 28,
  strokeWidth = 3,
  color,
  animate = true,
  label,
  className,
}: CircularProgressProps) {
  const [displayValue, setDisplayValue] = useState(animate ? 0 : value);

  useEffect(() => {
    if (!animate) {
      setDisplayValue(value);
      return;
    }
    // Animate from current to target
    const timeout = setTimeout(() => setDisplayValue(value), 50);
    return () => clearTimeout(timeout);
  }, [value, animate]);

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (displayValue / 100) * circumference;

  // Determine color based on value if not provided
  const progressColor =
    color ||
    (value >= 100
      ? "hsl(var(--primary))"
      : value >= 75
      ? "hsl(142, 76%, 36%)"
      : value >= 50
      ? "hsl(221, 83%, 53%)"
      : value >= 25
      ? "hsl(38, 92%, 50%)"
      : "hsl(var(--muted-foreground))");

  return (
    <div
      className={cn("relative inline-flex items-center justify-center shrink-0", className)}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="transform -rotate-90"
      >
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="hsl(var(--muted))"
          strokeWidth={strokeWidth}
          opacity={0.4}
        />
        {/* Progress arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={progressColor}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-700 ease-out"
        />
      </svg>
      {label && (
        <span
          className="absolute text-foreground font-bold"
          style={{ fontSize: size * 0.28 }}
        >
          {label}
        </span>
      )}
    </div>
  );
}
