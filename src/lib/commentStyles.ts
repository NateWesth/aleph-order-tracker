import { useEffect, useState } from "react";

const NAME_COLORS = [
  "text-logo-cyan",
  "text-logo-violet",
  "text-logo-magenta",
  "text-emerald-500",
  "text-amber-500",
  "text-sky-400",
  "text-rose-400",
  "text-lime-500",
];

export function nameColorClass(userId: string | null | undefined) {
  if (!userId) return NAME_COLORS[0];
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) >>> 0;
  return NAME_COLORS[h % NAME_COLORS.length];
}

/** Smooth, almost transparent fill: own bubbles cyan tint, others violet tint. */
export function bubbleClass(mine: boolean) {
  return mine
    ? "bg-logo-cyan/10 border-logo-cyan/20 rounded-tr-md"
    : "bg-logo-violet/10 border-logo-violet/20 rounded-tl-md";
}

export function bubbleTime(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const today = new Date().toDateString() === d.toDateString();
  return today
    ? d.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleString("en-ZA", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

const SEEN_KEY = "aleph:comments-seen";
const EVT = "aleph:comments-seen-change";

function readSeen(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(SEEN_KEY) || "{}"); } catch { return {}; }
}

export function markCommentsSeen(key: string, count: number) {
  const seen = readSeen();
  if ((seen[key] ?? -1) >= count) return;
  seen[key] = count;
  try { localStorage.setItem(SEEN_KEY, JSON.stringify(seen)); } catch { /* ignore */ }
  window.dispatchEvent(new Event(EVT));
}

export function useCommentsSeen() {
  const [seen, setSeen] = useState<Record<string, number>>(() => readSeen());
  useEffect(() => {
    const update = () => setSeen(readSeen());
    window.addEventListener(EVT, update);
    window.addEventListener("storage", update);
    return () => { window.removeEventListener(EVT, update); window.removeEventListener("storage", update); };
  }, []);
  return seen;
}

export function hasUnread(seen: Record<string, number>, key: string, count: number) {
  return count > 0 && count > (seen[key] ?? 0);
}
