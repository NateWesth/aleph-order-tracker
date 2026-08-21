import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const EMOJI_GROUPS: { label: string; emojis: string[] }[] = [
  {
    label: "Smileys",
    emojis: ["😀", "😂", "🥲", "😊", "😉", "😍", "😘", "🤔", "😅", "😎", "🙂", "🙃", "😴", "🥳", "😬", "😢", "😭", "😡", "🤯", "🥺"],
  },
  {
    label: "Gestures",
    emojis: ["👍", "👎", "👏", "🙌", "🙏", "💪", "🤝", "✌️", "🤞", "👌", "✋", "👋", "🤦", "🤷", "🫡"],
  },
  {
    label: "Symbols",
    emojis: ["❤️", "🔥", "✅", "❌", "⚠️", "⭐", "🎉", "💯", "❗", "❓", "💡", "📌", "⏰", "🚀", "👀"],
  },
  {
    label: "Work",
    emojis: ["📦", "🚚", "💰", "📋", "📊", "🛠️", "🔧", "📅", "✉️", "📞", "🖊️", "🗂️", "🏢", "🔒", "🔑"],
  },
];

// Handy one-tap reactions, mirrors the common WhatsApp long-press set
export const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  trigger: React.ReactNode;
  align?: "start" | "center" | "end";
}

export default function EmojiPicker({ onSelect, trigger, align = "start" }: EmojiPickerProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild onClick={(e: React.MouseEvent) => e.stopPropagation()}>
        {trigger}
      </PopoverTrigger>
      <PopoverContent
        className="w-64 p-2.5"
        align={align}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="max-h-56 overflow-y-auto space-y-2.5">
          {EMOJI_GROUPS.map((group) => (
            <div key={group.label}>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1 px-0.5">
                {group.label}
              </p>
              <div className="grid grid-cols-8 gap-0.5">
                {group.emojis.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => {
                      onSelect(emoji);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex h-7 w-7 items-center justify-center rounded-lg text-base transition-transform",
                      "hover:bg-primary/10 hover:scale-110 active:scale-95"
                    )}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
