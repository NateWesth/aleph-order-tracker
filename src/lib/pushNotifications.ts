import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";

export const VAPID_PUBLIC_KEY =
  "BAwX0AT4VpA5BM1eniYDcUoFTTurLjgbV7fgCySl2Pxfe2ZxmOJnSApjm3B5MBi2jWSwEDdr7NMBX1DCKQ67GnQ";

export const PUSH_TYPES = new Set([
  "entity_comment", "comment_reply", "comment_mention", "item_comment",
  "mention", "new_message", "order_update", "comment_reaction",
]);

export type PushStatus = "enabled" | "disabled" | "denied" | "unsupported" | "open-in-new-tab";

const isNative = () => Capacitor.isNativePlatform();
const inIframe = () => { try { return window.top !== window.self; } catch { return true; } };

function b64ToUint8(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  const existing = await navigator.serviceWorker.getRegistration();
  if (existing) return existing;
  // Fallback: a push-only worker (no caching) when the app worker isn't installed.
  return navigator.serviceWorker.register("/push-sw.js");
}

export async function getPushStatus(): Promise<PushStatus> {
  if (isNative()) {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    const p = await LocalNotifications.checkPermissions();
    return p.display === "granted" ? "enabled" : p.display === "denied" ? "denied" : "disabled";
  }
  if (!("Notification" in window) || !("PushManager" in window)) return "unsupported";
  if (inIframe()) return "open-in-new-tab";
  if (Notification.permission === "denied") return "denied";
  if (Notification.permission !== "granted") return "disabled";
  const reg = await navigator.serviceWorker?.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub ? "enabled" : "disabled";
}

/** Must be called from a click. */
export async function enablePush(userId: string): Promise<PushStatus> {
  if (isNative()) {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    const p = await LocalNotifications.requestPermissions();
    return p.display === "granted" ? "enabled" : "denied";
  }
  if (!("Notification" in window) || !("PushManager" in window)) return "unsupported";
  if (inIframe()) return "open-in-new-tab";
  const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (permission !== "granted") return "denied";
  const reg = await getRegistration();
  if (!reg) return "unsupported";
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToUint8(VAPID_PUBLIC_KEY) });
  }
  const j = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  const { error } = await supabase.from("push_subscriptions").upsert(
    { user_id: userId, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, updated_at: new Date().toISOString() },
    { onConflict: "user_id,endpoint" },
  );
  if (error) throw error;
  return "enabled";
}

export async function disablePush(): Promise<PushStatus> {
  if (isNative()) return "disabled";
  const reg = await navigator.serviceWorker?.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
    await sub.unsubscribe();
  }
  return "disabled";
}

/** Show a system notification while the app is open. Same tag as push so duplicates collapse. */
export async function showLocalNotification(n: { id: string; title: string; message: string; order_id: string | null }) {
  if (isNative()) {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    const perm = await LocalNotifications.checkPermissions();
    if (perm.display !== "granted") return;
    await LocalNotifications.schedule({
      notifications: [{
        id: Math.abs([...n.id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)),
        title: n.title,
        body: n.message,
        largeBody: n.message,
        extra: { order_id: n.order_id },
      }],
    });
    return;
  }
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const reg = await navigator.serviceWorker?.getRegistration();
  const opts = {
    body: n.message,
    tag: n.id,
    icon: "/lovable-uploads/e1088147-889e-43f6-bdf0-271189b88913.png",
    data: { url: n.order_id ? `/admin-dashboard?order=${n.order_id}` : "/admin-dashboard" },
  };
  if (reg) await reg.showNotification(n.title, opts);
  else new Notification(n.title, opts);
}
