const key = "aleph:device-notifications";
export function deviceNotificationsAllowed(value: string | null) { return value !== "off"; }
export function notificationsAllowedOnDevice() { return deviceNotificationsAllowed(localStorage.getItem(key)); }
export function setDeviceNotificationsAllowed(enabled: boolean) {
  localStorage.setItem(key, enabled ? "on" : "off");
  window.dispatchEvent(new Event("aleph:notification-settings"));
}