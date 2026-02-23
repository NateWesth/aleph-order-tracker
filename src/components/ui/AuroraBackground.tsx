import { memo } from "react";

/**
 * A performant CSS-only aurora background.
 * Uses layered radial gradients with slow, offset CSS animations.
 */
const AuroraBackground = memo(function AuroraBackground() {
  return (
    <div
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden opacity-40 dark:opacity-25"
      aria-hidden="true"
    >
      {/* Blob 1 — primary color, top-left drift */}
      <div
        className="absolute -top-1/4 -left-1/4 h-[60vh] w-[60vh] rounded-full animate-aurora-1"
        style={{
          background:
            "radial-gradient(circle, hsl(var(--primary) / 0.3) 0%, transparent 70%)",
          filter: "blur(80px)",
        }}
      />
      {/* Blob 2 — accent / purple shift, bottom-right drift */}
      <div
        className="absolute -bottom-1/4 -right-1/4 h-[50vh] w-[50vh] rounded-full animate-aurora-2"
        style={{
          background:
            "radial-gradient(circle, hsl(var(--primary) / 0.2) 0%, hsl(var(--accent) / 0.15) 50%, transparent 70%)",
          filter: "blur(100px)",
        }}
      />
      {/* Blob 3 — smaller accent, center drift */}
      <div
        className="absolute top-1/3 left-1/2 h-[40vh] w-[40vh] rounded-full animate-aurora-3"
        style={{
          background:
            "radial-gradient(circle, hsl(var(--ring) / 0.15) 0%, transparent 70%)",
          filter: "blur(90px)",
        }}
      />
    </div>
  );
});

export default AuroraBackground;
