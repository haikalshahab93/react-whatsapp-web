import { api } from "./api";

/**
 * Web Push helpers. Everything here is optional: when the browser, the service worker
 * or the server's VAPID keys are missing, the app keeps working without push.
 */

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) output[index] = raw.charCodeAt(index);
  return output;
}

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    window.isSecureContext
  );
}

/** Subscribes this device so messages arrive while the app is closed. */
export async function enablePushNotifications(): Promise<boolean> {
  if (!pushSupported()) return false;
  try {
    const { publicKey } = await api<{ publicKey: string | null }>("/push/key");
    if (!publicKey) return false;

    const registration = await navigator.serviceWorker.ready;
    const existing = await registration.pushManager.getSubscription();
    const subscription =
      existing ||
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as unknown as BufferSource,
      }));

    await api("/push/subscribe", {
      method: "POST",
      body: { endpoint: subscription.endpoint, keys: subscription.toJSON().keys },
    });
    return true;
  } catch {
    return false;
  }
}

export async function disablePushNotifications(): Promise<void> {
  if (!pushSupported()) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return;
    await api("/push/subscribe", {
      method: "DELETE",
      body: { endpoint: subscription.endpoint },
    }).catch(() => undefined);
    await subscription.unsubscribe().catch(() => undefined);
  } catch {
    /* nothing to clean up */
  }
}
