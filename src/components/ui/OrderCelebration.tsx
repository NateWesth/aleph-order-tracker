import { useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";

interface ConfettiPiece {
  id: number;
  x: number;
  y: number;
  color: string;
  rotation: number;
  scale: number;
  speedX: number;
  speedY: number;
  opacity: number;
}

const COLORS = [
  "#f43f5e", "#8b5cf6", "#3b82f6", "#10b981", "#f59e0b",
  "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#a855f7",
];

export function useOrderCelebration() {
  const [showConfetti, setShowConfetti] = useState(false);
  const [streak, setStreak] = useState(0);

  const celebrate = useCallback(() => {
    // Load streak from session
    const today = new Date().toDateString();
    const stored = sessionStorage.getItem("completion_streak");
    let currentStreak = 0;
    
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed.date === today) {
        currentStreak = parsed.count;
      }
    }
    
    currentStreak++;
    sessionStorage.setItem("completion_streak", JSON.stringify({ date: today, count: currentStreak }));
    setStreak(currentStreak);
    setShowConfetti(true);

    setTimeout(() => setShowConfetti(false), 2500);
  }, []);

  return { showConfetti, streak, celebrate };
}

export function ConfettiOverlay({ show, streak }: { show: boolean; streak: number }) {
  const [pieces, setPieces] = useState<ConfettiPiece[]>([]);

  useEffect(() => {
    if (!show) {
      setPieces([]);
      return;
    }

    const newPieces: ConfettiPiece[] = Array.from({ length: 60 }, (_, i) => ({
      id: i,
      x: Math.random() * window.innerWidth,
      y: -20 - Math.random() * 100,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      rotation: Math.random() * 360,
      scale: 0.5 + Math.random() * 0.8,
      speedX: (Math.random() - 0.5) * 4,
      speedY: 2 + Math.random() * 4,
      opacity: 1,
    }));
    setPieces(newPieces);

    // Animate
    let frame: number;
    const animate = () => {
      setPieces(prev => prev.map(p => ({
        ...p,
        x: p.x + p.speedX,
        y: p.y + p.speedY,
        rotation: p.rotation + 3,
        speedY: p.speedY + 0.1,
        opacity: Math.max(0, p.opacity - 0.008),
      })).filter(p => p.y < window.innerHeight + 50 && p.opacity > 0));
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(frame);
  }, [show]);

  if (!show && pieces.length === 0) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] pointer-events-none overflow-hidden">
      {/* Confetti pieces */}
      {pieces.map(p => (
        <div
          key={p.id}
          className="absolute w-3 h-3 rounded-sm"
          style={{
            left: p.x,
            top: p.y,
            backgroundColor: p.color,
            transform: `rotate(${p.rotation}deg) scale(${p.scale})`,
            opacity: p.opacity,
          }}
        />
      ))}

      {/* Streak badge */}
      {show && streak > 0 && (
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-bounce">
          <div className="bg-card border-2 border-primary rounded-2xl px-6 py-4 shadow-2xl text-center">
            <p className="text-3xl font-bold text-foreground">🎉</p>
            <p className="text-lg font-bold text-foreground mt-1">Order Delivered!</p>
            {streak > 1 && (
              <p className="text-sm text-primary font-semibold mt-1">
                🔥 {streak} today!
              </p>
            )}
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}
