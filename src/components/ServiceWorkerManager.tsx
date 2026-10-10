"use client";

import { useEffect } from "react";

/**
 * Placarr does not ship a service worker (no HTTPS in the current deploy,
 * so a worker would never control a real session). This only drops leftover
 * registrations from older Serwist / webpack builds so they stop 404-ing
 * hashed `/_next/static/…` URLs.
 */
export function ServiceWorkerManager() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    void (async () => {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(
        registrations.map((registration) => registration.unregister()),
      );
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
      }
    })();
  }, []);

  return null;
}
