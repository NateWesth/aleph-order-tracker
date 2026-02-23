import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { X, ArrowRight, ArrowLeft, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface TourStep {
  target: string; // CSS selector
  title: string;
  description: string;
  position?: "top" | "bottom" | "left" | "right";
}

const TOUR_STEPS: TourStep[] = [
  {
    target: '[data-tour="home"]',
    title: "Dashboard Home",
    description: "Click here to see an overview of your orders, stats, and recent activity.",
    position: "bottom",
  },
  {
    target: '[data-tour="search"]',
    title: "Quick Search",
    description: "Search orders, clients, and more. Press ⌘K for the command palette.",
    position: "bottom",
  },
  {
    target: '[data-tour="nav-orders"]',
    title: "Orders Board",
    description: "Your Kanban board — track orders from Awaiting Stock through to Delivery.",
    position: "bottom",
  },
  {
    target: '[data-tour="nav-history"]',
    title: "Order History",
    description: "View completed orders, export reports, and track performance over time.",
    position: "bottom",
  },
  {
    target: '[data-tour="notifications"]',
    title: "Notifications",
    description: "Stay updated with real-time alerts on order changes and updates.",
    position: "bottom",
  },
];

const STORAGE_KEY = "onboarding-tour-completed";

export default function OnboardingTour() {
  const [active, setActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [spotlightRect, setSpotlightRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    const completed = localStorage.getItem(STORAGE_KEY);
    if (!completed) {
      // Delay start to let the dashboard render
      const timer = setTimeout(() => setActive(true), 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  const updateSpotlight = useCallback(() => {
    if (!active) return;
    const step = TOUR_STEPS[currentStep];
    const el = document.querySelector(step.target);
    if (el) {
      setSpotlightRect(el.getBoundingClientRect());
    } else {
      setSpotlightRect(null);
    }
  }, [active, currentStep]);

  useEffect(() => {
    updateSpotlight();
    window.addEventListener("resize", updateSpotlight);
    return () => window.removeEventListener("resize", updateSpotlight);
  }, [updateSpotlight]);

  const handleNext = () => {
    if (currentStep < TOUR_STEPS.length - 1) {
      setCurrentStep((s) => s + 1);
    } else {
      handleFinish();
    }
  };

  const handleBack = () => {
    if (currentStep > 0) setCurrentStep((s) => s - 1);
  };

  const handleFinish = () => {
    setActive(false);
    localStorage.setItem(STORAGE_KEY, "true");
  };

  if (!active) return null;

  const step = TOUR_STEPS[currentStep];
  const isLast = currentStep === TOUR_STEPS.length - 1;

  // Calculate tooltip position
  const getTooltipStyle = (): React.CSSProperties => {
    if (!spotlightRect) return { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };

    const pos = step.position || "bottom";
    const gap = 16;

    switch (pos) {
      case "bottom":
        return {
          top: spotlightRect.bottom + gap,
          left: spotlightRect.left + spotlightRect.width / 2,
          transform: "translateX(-50%)",
        };
      case "top":
        return {
          bottom: window.innerHeight - spotlightRect.top + gap,
          left: spotlightRect.left + spotlightRect.width / 2,
          transform: "translateX(-50%)",
        };
      case "right":
        return {
          top: spotlightRect.top + spotlightRect.height / 2,
          left: spotlightRect.right + gap,
          transform: "translateY(-50%)",
        };
      case "left":
        return {
          top: spotlightRect.top + spotlightRect.height / 2,
          right: window.innerWidth - spotlightRect.left + gap,
          transform: "translateY(-50%)",
        };
      default:
        return {};
    }
  };

  return (
    <div className="fixed inset-0 z-[100]" aria-label="Onboarding tour">
      {/* Overlay with cutout */}
      <svg className="absolute inset-0 w-full h-full" style={{ pointerEvents: "auto" }}>
        <defs>
          <mask id="tour-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {spotlightRect && (
              <rect
                x={spotlightRect.left - 6}
                y={spotlightRect.top - 6}
                width={spotlightRect.width + 12}
                height={spotlightRect.height + 12}
                rx="12"
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgba(0,0,0,0.6)"
          mask="url(#tour-mask)"
          onClick={handleFinish}
        />
      </svg>

      {/* Spotlight ring */}
      {spotlightRect && (
        <div
          className="absolute rounded-xl border-2 border-primary animate-glow-pulse pointer-events-none"
          style={{
            top: spotlightRect.top - 6,
            left: spotlightRect.left - 6,
            width: spotlightRect.width + 12,
            height: spotlightRect.height + 12,
          }}
        />
      )}

      {/* Tooltip card */}
      <div
        className="absolute glass-card p-5 rounded-2xl shadow-glow-lg max-w-xs animate-scale-in z-[101]"
        style={getTooltipStyle()}
      >
        <button
          onClick={handleFinish}
          className="absolute top-2 right-2 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="text-xs font-medium text-muted-foreground">
            Step {currentStep + 1} of {TOUR_STEPS.length}
          </span>
        </div>

        <h3 className="text-sm font-semibold text-foreground mb-1">{step.title}</h3>
        <p className="text-xs text-muted-foreground leading-relaxed mb-4">{step.description}</p>

        {/* Progress dots */}
        <div className="flex items-center justify-between">
          <div className="flex gap-1.5">
            {TOUR_STEPS.map((_, i) => (
              <div
                key={i}
                className={cn(
                  "h-1.5 rounded-full transition-all duration-300",
                  i === currentStep ? "w-4 bg-primary" : "w-1.5 bg-muted-foreground/30"
                )}
              />
            ))}
          </div>

          <div className="flex gap-2">
            {currentStep > 0 && (
              <Button size="sm" variant="ghost" onClick={handleBack} className="h-7 text-xs px-2">
                <ArrowLeft className="h-3 w-3 mr-1" />
                Back
              </Button>
            )}
            <Button size="sm" onClick={handleNext} className="h-7 text-xs px-3">
              {isLast ? "Finish" : "Next"}
              {!isLast && <ArrowRight className="h-3 w-3 ml-1" />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
