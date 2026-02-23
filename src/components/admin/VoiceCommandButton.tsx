import { useState, useCallback, useRef, useEffect } from "react";
import { Mic, MicOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface VoiceCommandButtonProps {
  onCommand: (command: string) => void;
  className?: string;
}

// Map spoken words to navigation views
const VOICE_COMMANDS: Record<string, { action: "navigate" | "action"; target: string }> = {
  "orders": { action: "navigate", target: "orders" },
  "order board": { action: "navigate", target: "orders" },
  "show orders": { action: "navigate", target: "orders" },
  "history": { action: "navigate", target: "history" },
  "show history": { action: "navigate", target: "history" },
  "completed": { action: "navigate", target: "history" },
  "clients": { action: "navigate", target: "clients" },
  "show clients": { action: "navigate", target: "clients" },
  "suppliers": { action: "navigate", target: "suppliers" },
  "show suppliers": { action: "navigate", target: "suppliers" },
  "items": { action: "navigate", target: "items" },
  "show items": { action: "navigate", target: "items" },
  "stats": { action: "navigate", target: "stats" },
  "statistics": { action: "navigate", target: "stats" },
  "show stats": { action: "navigate", target: "stats" },
  "reports": { action: "navigate", target: "stats" },
  "users": { action: "navigate", target: "users" },
  "home": { action: "navigate", target: "home" },
  "go home": { action: "navigate", target: "home" },
  "dashboard": { action: "navigate", target: "home" },
  "settings": { action: "action", target: "settings" },
  "open settings": { action: "action", target: "settings" },
  "create order": { action: "action", target: "create-order" },
  "new order": { action: "action", target: "create-order" },
  "purchase orders": { action: "navigate", target: "po-tracking" },
  "po tracking": { action: "navigate", target: "po-tracking" },
  "urgent orders": { action: "navigate", target: "orders" },
  "what's overdue": { action: "navigate", target: "orders" },
};

export default function VoiceCommandButton({ onCommand, className }: VoiceCommandButtonProps) {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const recognitionRef = useRef<any>(null);
  const { toast } = useToast();

  const isSupported = typeof window !== "undefined" && ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setListening(false);
    setTranscript("");
  }, []);

  const processCommand = useCallback((text: string) => {
    const lower = text.toLowerCase().trim();

    // Try exact match first, then partial match
    for (const [phrase, cmd] of Object.entries(VOICE_COMMANDS)) {
      if (lower.includes(phrase)) {
        toast({
          title: "🎤 Voice Command",
          description: `"${text}" → ${cmd.target}`,
        });
        onCommand(`${cmd.action}:${cmd.target}`);
        return true;
      }
    }

    toast({
      title: "🎤 Didn't catch that",
      description: `"${text}" — try "show orders", "go home", "create order"`,
    });
    return false;
  }, [onCommand, toast]);

  const startListening = useCallback(() => {
    if (!isSupported) {
      toast({
        title: "Not Supported",
        description: "Voice commands aren't supported in this browser.",
        variant: "destructive",
      });
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onstart = () => setListening(true);

    recognition.onresult = (event: any) => {
      const result = event.results[event.results.length - 1];
      const text = result[0].transcript;
      setTranscript(text);

      if (result.isFinal) {
        processCommand(text);
        stopListening();
      }
    };

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error:", event.error);
      if (event.error !== "aborted") {
        toast({
          title: "Voice Error",
          description: `Microphone error: ${event.error}`,
          variant: "destructive",
        });
      }
      stopListening();
    };

    recognition.onend = () => {
      setListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [isSupported, processCommand, stopListening, toast]);

  const toggle = useCallback(() => {
    if (listening) {
      stopListening();
    } else {
      startListening();
    }
  }, [listening, startListening, stopListening]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  if (!isSupported) return null;

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="icon"
        onClick={toggle}
        className={cn(
          "rounded-xl text-muted-foreground hover:text-foreground relative",
          listening && "text-primary bg-primary/10",
          className
        )}
      >
        {listening ? (
          <>
            <Mic className="h-[18px] w-[18px]" />
            <span className="absolute inset-0 rounded-xl border-2 border-primary animate-pulse" />
          </>
        ) : (
          <MicOff className="h-[18px] w-[18px]" />
        )}
      </Button>
      {listening && transcript && (
        <div className="absolute top-full mt-2 right-0 bg-card border border-border rounded-lg px-3 py-2 shadow-lg z-50 min-w-[200px] max-w-[300px]">
          <p className="text-xs text-muted-foreground mb-1">Listening...</p>
          <p className="text-sm font-medium text-foreground">{transcript}</p>
        </div>
      )}
    </div>
  );
}
