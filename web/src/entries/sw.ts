// Registers the service worker that keeps the site and Python available offline.
export function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || import.meta.env.DEV) return;
  addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* offline support is an extra: the site works without it */
    });
  });
}
