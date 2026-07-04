import {
  isClientSafeRemoteImageProxyTarget,
  remoteImageUrlMatchesProxyHost,
} from "@/lib/media/remoteImageProxyHosts";

/** Remote CDN URLs that need Referer / FlareSolverr — not safe for `/_next/image`. */
export function remoteImageNeedsProxy(url: string): boolean {
  return remoteImageUrlMatchesProxyHost(url);
}

export function remoteImageProxyPath(url: string): string | null {
  if (!isClientSafeRemoteImageProxyTarget(url)) return null;
  return `/api/media/remote?url=${encodeURIComponent(url)}`;
}

/** UI src: internal proxy for protected CDNs, unchanged otherwise. */
export function remoteImageDisplaySrc(url: string): string {
  return remoteImageProxyPath(url) ?? url;
}
