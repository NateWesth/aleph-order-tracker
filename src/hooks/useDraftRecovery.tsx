import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";

const PREFIX = "aleph:draft:v2:";
const MAX_AGE = 7 * 86400000;
export function readLocalDraft<T>(key: string): T | null {
  try {
    const record = JSON.parse(localStorage.getItem(key) || "null");
    const age=Date.now()-record?.savedAt;
    return record?.version === 2 && Number.isFinite(record.savedAt) && age>=0 && age<MAX_AGE && record.value!==undefined ? record.value as T : null;
  } catch { return null; }
}

/** Device-only backups, scoped to the signed-in user. Never claims a server save. */
export function useDraftRecovery<T>(name: string, value: T, active: boolean, onRestore: (value: T) => void) {
  const { user } = useAuth();
  const key = user?.id ? PREFIX + user.id + ":" + name : null;
  const [available, setAvailable] = useState<T | null>(null);
  const [failed, setFailed] = useState(false);
  const latest = useRef({ key, value, active });
  latest.current = { key, value, active };
  const encoded = JSON.stringify(value);
  const persist = () => {
    const state = latest.current;
    if (!state.key || !state.active) return;
    try {
      localStorage.setItem(state.key, JSON.stringify({ version: 2, savedAt: Date.now(), value: state.value }));
      setAvailable(state.value); setFailed(false);
    } catch { setFailed(true); }
  };
  useEffect(() => { setAvailable(key ? readLocalDraft<T>(key) : null); }, [key]);
  useEffect(() => { persist(); }, [key, encoded, active]);
  useEffect(() => {
    const flush = () => persist();
    const warn = (event: BeforeUnloadEvent) => {
      const state = latest.current;
      if (state.active) flush();
      if (state.active && failed) { event.preventDefault(); event.returnValue = ""; }
    };
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", warn);
    return () => { window.removeEventListener("pagehide", flush); window.removeEventListener("beforeunload", warn); };
  }, [failed]);
  const clear = () => {
    if (key) { try { localStorage.removeItem(key); } catch { setFailed(true); } }
    latest.current.active = false;
    setAvailable(null);
  };
  const banner = <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-muted/30 px-3 py-2 text-xs" role="status">
    <span className={failed ? "text-destructive" : "text-muted-foreground"}>{failed ? "Draft not protected — device storage unavailable. Keep this window open." : active ? "Draft saved on this device · not synced to the team" : available ? "An unfinished draft is available on this device." : "Drafts are saved on this device for 7 days."}</span>
    {!active && available !== null && <><Button size="sm" variant="outline" onClick={() => onRestore(available)}>Resume draft</Button><Button size="sm" variant="ghost" onClick={clear}>Discard draft</Button></>}
  </div>;
  return { clear, banner, failed };
}
