import { useRef, useState, useCallback, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Trash2, CheckCircle2, ArrowRight } from "lucide-react";

interface SwipeableCardProps {
  children: ReactNode;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  leftLabel?: string;
  rightLabel?: string;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  leftColor?: string;
  rightColor?: string;
  disabled?: boolean;
}

export default function SwipeableCard({
  children,
  onSwipeLeft,
  onSwipeRight,
  leftLabel = "Delete",
  rightLabel = "Next",
  leftIcon = <Trash2 className="h-4 w-4" />,
  rightIcon = <ArrowRight className="h-4 w-4" />,
  leftColor = "bg-red-500",
  rightColor = "bg-emerald-500",
  disabled = false,
}: SwipeableCardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [offsetX, setOffsetX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const isHorizontal = useRef<boolean | null>(null);

  const THRESHOLD = 80;

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (disabled) return;
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    isHorizontal.current = null;
    setDragging(true);
  }, [disabled]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!dragging || disabled) return;
    const dx = e.touches[0].clientX - startX.current;
    const dy = e.touches[0].clientY - startY.current;

    // Determine direction on first significant move
    if (isHorizontal.current === null) {
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
        isHorizontal.current = Math.abs(dx) > Math.abs(dy);
      }
      return;
    }

    if (!isHorizontal.current) return;

    e.preventDefault();

    // Only allow left swipe if onSwipeLeft, right if onSwipeRight
    let clamped = dx;
    if (dx < 0 && !onSwipeLeft) clamped = 0;
    if (dx > 0 && !onSwipeRight) clamped = 0;
    clamped = Math.max(-150, Math.min(150, clamped));

    setOffsetX(clamped);
  }, [dragging, disabled, onSwipeLeft, onSwipeRight]);

  const handleTouchEnd = useCallback(() => {
    if (!dragging) return;
    setDragging(false);

    if (offsetX < -THRESHOLD && onSwipeLeft) {
      onSwipeLeft();
    } else if (offsetX > THRESHOLD && onSwipeRight) {
      onSwipeRight();
    }

    setOffsetX(0);
    isHorizontal.current = null;
  }, [dragging, offsetX, onSwipeLeft, onSwipeRight]);

  const progress = Math.min(Math.abs(offsetX) / THRESHOLD, 1);

  return (
    <div ref={containerRef} className="relative overflow-hidden rounded-xl">
      {/* Left action (swipe right reveals) */}
      {onSwipeRight && offsetX > 0 && (
        <div
          className={cn("absolute inset-y-0 left-0 flex items-center justify-center px-4", rightColor)}
          style={{ width: Math.abs(offsetX), opacity: progress }}
        >
          <div className="flex flex-col items-center gap-1 text-white">
            {rightIcon}
            <span className="text-[10px] font-semibold">{rightLabel}</span>
          </div>
        </div>
      )}

      {/* Right action (swipe left reveals) */}
      {onSwipeLeft && offsetX < 0 && (
        <div
          className={cn("absolute inset-y-0 right-0 flex items-center justify-center px-4", leftColor)}
          style={{ width: Math.abs(offsetX), opacity: progress }}
        >
          <div className="flex flex-col items-center gap-1 text-white">
            {leftIcon}
            <span className="text-[10px] font-semibold">{leftLabel}</span>
          </div>
        </div>
      )}

      {/* Card content */}
      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          transform: `translateX(${offsetX}px)`,
          transition: dragging ? "none" : "transform 0.3s ease-out",
        }}
        className="relative z-10 bg-card"
      >
        {children}
      </div>
    </div>
  );
}
