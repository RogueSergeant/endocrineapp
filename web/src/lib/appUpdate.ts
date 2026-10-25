import { useSyncExternalStore } from "react";

// The service worker serves the precached page, so a new deploy is only
// picked up on the visit after the one that downloaded it. Once the new
// worker takes over (skipWaiting + clientsClaim) the home page offers a
// reload onto it. It never reloads by itself: the user may be mid-scan,
// and the next launch loads the new version anyway.

let updateReady = false;
const listeners = new Set<() => void>();

export function registerServiceWorker(): void {
  if (!("serviceWorker" in navigator)) return;
  // On a first visit the worker takes control of a page that is already
  // current; only a replacement worker means newer code.
  const hadController = navigator.serviceWorker.controller !== null;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController || updateReady) return;
    updateReady = true;
    listeners.forEach((l) => l());
  });
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
  });
}

/** Whether a newer version has been installed and is waiting for a reload. */
export function useUpdateReady(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => updateReady,
  );
}

export function reloadOntoUpdate(): void {
  window.location.reload();
}
