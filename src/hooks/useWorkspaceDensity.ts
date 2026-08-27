import { useCallback, useEffect, useState } from "react";

export type WorkspaceDensity = "comfortable" | "compact" | "focus";
const KEY = "aleph:workspace-density";

export function useWorkspaceDensity() {
  const [density, setDensityState] = useState<WorkspaceDensity>(() => {
    if (typeof window === "undefined") return "comfortable";
    const saved = window.localStorage.getItem(KEY);
    return saved === "compact" || saved === "focus" ? saved : "comfortable";
  });

  useEffect(() => {
    document.documentElement.dataset.density = density;
    window.localStorage.setItem(KEY, density);
  }, [density]);

  const setDensity = useCallback((value: WorkspaceDensity) => setDensityState(value), []);
  const cycleDensity = useCallback(() => {
    setDensityState((current) => current === "comfortable" ? "compact" : current === "compact" ? "focus" : "comfortable");
  }, []);

  return { density, setDensity, cycleDensity };
}
