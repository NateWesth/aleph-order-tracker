import React from "react";
import { createRoot } from "react-dom/client";
import { Capacitor } from "@capacitor/core";
import App from "./App.tsx";
import "./index.css";

// Preview / dev environments must NEVER be served by a cached service worker,
// otherwise the Lovable preview keeps showing an old build.
function isPreviewEnv() {
  if (import.meta.env.DEV) return true;
  const h = window.location.hostname;
  return h === "localhost" || h.endsWith(".lovable.app") && h.includes("preview");
}

async function nukeServiceWorkersAndCaches() {
  if ("serviceWorker" in navigator) {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    } catch {
      // ignore
    }
  }
  try {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  } catch {
    // ignore
  }
}

async function disablePwaCachingInNative() {
  // When running inside a Capacitor WebView, a PWA service worker can cache
  // the remote app shell and prevent "instant" updates from showing.
  if (!Capacitor.isNativePlatform()) return;
  if (!("serviceWorker" in navigator)) return;


  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.unregister()));
  } catch {
    // ignore
  }

  try {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  } catch {
    // ignore
  }
}

// For web (non-Capacitor) users: register the PWA service worker explicitly
// and force a clean reload the moment a new version is ready, instead of
// letting it silently take over in the background. Without this, a tab left
// open can end up running old JS while the newly-activated worker starts
// serving new assets underneath it - which is what was causing people to
// see the app flip between old and new. A short periodic check also means
// a tab left open for hours will actually notice a new deploy exists,
// instead of only finding out on the next full navigation.
async function registerServiceWorkerWithForcedUpdates() {
  if (Capacitor.isNativePlatform()) return;
  if (isPreviewEnv()) {
    // Never let a stale worker serve the preview.
    await nukeServiceWorkersAndCaches();
    return;
  }



  try {
    const { registerSW } = await import("virtual:pwa-register");
    const updateSW = registerSW({
      immediate: true,
      onNeedRefresh() {
        // A new version has finished installing - activate it and reload
        // once, atomically, rather than leaving the page half old/half new.
        updateSW(true);
      },
      onRegisteredSW(_url, registration) {
        if (!registration) return;
        // Browsers only check for a new service worker on navigation by
        // default, so a tab left open indefinitely could otherwise never
        // find out a new version was deployed. Poll periodically too.
        setInterval(() => {
          registration.update().catch(() => {});
        }, 30 * 60 * 1000);
      },
    });
  } catch {
    // Service worker not available (e.g. dev mode) - ignore.
  }
}

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element not found");

// Best-effort cleanup before React mounts
void disablePwaCachingInNative().finally(() => {
  void registerServiceWorkerWithForcedUpdates();
  createRoot(rootElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
});

