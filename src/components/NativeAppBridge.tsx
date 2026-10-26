import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";

/** Native lifecycle and Android Back behavior live above individual workspaces. */
export default function NativeAppBridge() {
  const navigate = useNavigate();
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let disposed = false;
    const handles: Array<{ remove: () => Promise<void> }> = [];
    const keep = async (promise: Promise<{ remove: () => Promise<void> }>) => {
      const handle = await promise;
      if (disposed) await handle.remove(); else handles.push(handle);
    };
    void keep(App.addListener("backButton", ({ canGoBack }) => {
      // Close the topmost modal before leaving the current page.
      const dialog = [...document.querySelectorAll<HTMLElement>('[role="dialog"][data-state="open"]')].pop();
      if (dialog) {
        dialog.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        return;
      }
      if (canGoBack) navigate(-1);
      else if (window.location.pathname !== "/admin-dashboard" && window.location.pathname !== "/") navigate("/admin-dashboard");
      else void App.minimizeApp();
    })).catch(console.warn);
    void keep(App.addListener("appStateChange", ({ isActive }) => {
      if (isActive) { window.dispatchEvent(new Event("focus")); window.dispatchEvent(new Event("aleph:notification-settings")); }
    })).catch(console.warn);
    return () => { disposed = true; handles.forEach(handle => { void handle.remove(); }); };
  }, [navigate]);
  return null;
}