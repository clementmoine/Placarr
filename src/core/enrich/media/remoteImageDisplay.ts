import {
  isClientSafeRemoteImageProxyTarget,
  remoteImageUrlMatchesProxyHost,
} from "@/core/enrich/media/remoteImageProxyHosts";

/** Remote CDN URLs that need Referer / FlareSolverr — not safe for `/_next/image`. */
export function remoteImageNeedsProxy(url: string): boolean {
  return remoteImageUrlMatchesProxyHost(url);
}

/** Local uploads are already on disk — routing them through `/_next/image`
 *  (esp. `w=3840`) burns sharp on the Next event loop and starves API/RSC. */
export function isLocalUploadImageSrc(url: string): boolean {
  return (
    url.startsWith("/uploads/") ||
    url.startsWith("/public/uploads/") ||
    /^https?:\/\/localhost(?::\d+)?\/uploads\//i.test(url)
  );
}

/** Foil pack textures under ``/assets/<pack>/…`` — streamed from ``data/``, not CDN. */
export function isLocalFoilImageSrc(url: string): boolean {
  return (
    url.startsWith("/assets/") ||
    /^https?:\/\/localhost(?::\d+)?\/foil\//i.test(url)
  );
}

/** TCGdex asset CDN — already sized (`low.webp` / `high.png`); sharp adds latency. */
export function isTcgdexAssetImageSrc(url: string): boolean {
  try {
    return new URL(url).hostname.toLowerCase() === "assets.tcgdex.net";
  } catch {
    return false;
  }
}

/** Skip the Next image optimizer when it adds no value or can hang the server. */
export function remoteImageShouldSkipOptimizer(url: string): boolean {
  return (
    remoteImageNeedsProxy(url) ||
    isLocalUploadImageSrc(url) ||
    isLocalFoilImageSrc(url) ||
    isTcgdexAssetImageSrc(url) ||
    // Already rewritten to our referer/Flare proxy — query strings are not in
    // `images.localPatterns` and must not go through `/_next/image`.
    url.startsWith("/api/media/remote")
  );
}

export function remoteImageProxyPath(url: string): string | null {
  if (!isClientSafeRemoteImageProxyTarget(url)) return null;
  return `/api/media/remote?url=${encodeURIComponent(url)}`;
}

/** UI src: internal proxy for protected CDNs, unchanged otherwise. */
export function remoteImageDisplaySrc(url: string): string {
  return remoteImageProxyPath(url) ?? url;
}
