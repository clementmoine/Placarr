"use client";

import { useEffect } from "react";

/**
 * Serwist is disabled in `next dev`, but a leftover `public/sw.js` from a
 * production build can still sit on disk — and a previously registered worker
 * will keep installing against it, precaching old `/_next/static/…` hashes that
 * 404. Clear the registration in development so localhost stays honest.
 */
export function DevServiceWorkerCleanup() {
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    if (!("serviceWorker" in navigator)) return;

    void (async () => {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
      }
    })();
  }, []);

  return null;
}
