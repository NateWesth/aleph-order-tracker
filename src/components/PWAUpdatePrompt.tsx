import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { RefreshCw, X } from 'lucide-react';

export const PWAUpdatePrompt = () => {
  const [showUpdatePrompt, setShowUpdatePrompt] = useState(false);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const checkForUpdates = async () => {
      try {
        const registration = await navigator.serviceWorker.getRegistration();
        if (!registration) return;

        // Check if there's already a waiting worker
        if (registration.waiting) {
          setWaitingWorker(registration.waiting);
          setShowUpdatePrompt(true);
        }

        // Listen for new updates
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                setWaitingWorker(newWorker);
                setShowUpdatePrompt(true);
              }
            });
          }
        });

        // Check for updates every 60 seconds
        const intervalId = setInterval(() => {
          registration.update();
        }, 60 * 1000);

        return () => clearInterval(intervalId);
      } catch (error) {
        console.log('Error checking for SW updates:', error);
      }
    };

    // Listen for controller change (update applied)
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.location.reload();
    });

    checkForUpdates();
  }, []);

  const handleUpdate = useCallback(() => {
    if (waitingWorker) {
      waitingWorker.postMessage({ type: 'SKIP_WAITING' });
    }
  }, [waitingWorker]);

  const handleDismiss = () => {
    setShowUpdatePrompt(false);
  };

  if (!showUpdatePrompt) {
    return null;
  }

  return (
    <div className="fixed top-4 left-4 right-4 z-[100] md:left-auto md:right-4 md:w-96">
      <Card className="shadow-lg border-primary/20 bg-card/95 backdrop-blur">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-full bg-primary/10">
              <RefreshCw className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-foreground text-sm">Update Available</h3>
              <p className="text-xs text-muted-foreground mt-1">
                A new version of Aleph Orders is available. Refresh to get the latest updates.
              </p>
              
              <div className="flex items-center gap-2 mt-3">
                <Button size="sm" onClick={handleUpdate} className="h-8 text-xs">
                  <RefreshCw className="h-3 w-3 mr-1" />
                  Update Now
                </Button>
                <Button size="sm" variant="ghost" onClick={handleDismiss} className="h-8 text-xs">
                  Later
                </Button>
              </div>
            </div>
            <button 
              onClick={handleDismiss}
              className="p-1 rounded-full hover:bg-muted transition-colors"
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
