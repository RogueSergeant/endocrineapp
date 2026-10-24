// The service worker serves the precached page, so a new deploy is only
// picked up on the visit after the one that downloaded it. Once the new
// worker takes over (skipWaiting + clientsClaim), reload onto it, but not
// while the user is mid-scan: on those screens wait until they are back
// on the scan page.

const BUSY_PATHS = ["/camera", "/crop", "/paste"];

let updateReady = false;

function reloadNow() {
  window.location.reload();
}

export function registerServiceWorker(): void {
  if (!("serviceWorker" in navigator)) return;
  // On a first visit the worker takes control of a page that is already
  // current; only a replacement worker means newer code.
  const hadController = navigator.serviceWorker.controller !== null;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController || updateReady) return;
    updateReady = true;
    if (!BUSY_PATHS.some((p) => window.location.pathname.startsWith(p))) reloadNow();
  });
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
  });
}

/** Called on the scan page: apply an update that arrived mid-scan. */
export function reloadIfUpdated(): void {
  if (updateReady) reloadNow();
}
