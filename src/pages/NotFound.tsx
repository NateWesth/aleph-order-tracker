import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Home } from "lucide-react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname
    );
  }, [location.pathname]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[560px] h-[560px] rounded-full opacity-[0.08] blur-3xl ribbon-gradient"
      />
      <div className="text-center relative z-10 max-w-sm">
        <img
          src="/lovable-uploads/e1088147-889e-43f6-bdf0-271189b88913.png"
          alt="Aleph"
          className="h-12 w-12 mx-auto mb-6 opacity-90"
        />
        <p className="font-display text-7xl font-bold ribbon-gradient-text mb-3">404</p>
        <h1 className="text-xl font-semibold mb-2">Page not found</h1>
        <p className="text-muted-foreground mb-8">
          The page you're looking for doesn't exist or may have moved.
        </p>
        <Button asChild size="lg">
          <a href="/">
            <Home className="h-4 w-4" />
            Return home
          </a>
        </Button>
      </div>
    </div>
  );
};

export default NotFound;
